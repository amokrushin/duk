const EventEmitter = require('events');
const { AmqpClient } = require('duk-amqp');
const async = require('async');
const redis = require('redis');
const { inspect } = require('util');
const { RedisError, InvalidTask, LockExistsError } = require('./errors');

const AMQP_NACK_REQUEUE = true;
const AMQP_NACK_NO_REQUEUE = false;

function noop() {}

class TransformTaskQueue extends EventEmitter {
    /**
     * @param settings
     * @param {'publisher'|'worker'} [settings.role = 'publisher']
     * @param {string} settings.amqpUrl
     * @param {string} settings.redisUrl
     * @param {string} [settings.amqpTaskQueue]
     * @param {string} [settings.amqpTaskStatusExchange]
     * @param {string} [settings.amqpTaskStatusReadyKey]
     * @param {string} [settings.redisTaskAttemptsKey]
     * @param {string} [settings.maxAttempts = 3]
     * @param {boolean} [settings.printLogs = true]
     * @param {Object} [settings.logger = console]
     */
    constructor(settings) {
        super();

        this._settings = {
            role: settings.role || 'publisher',
            amqpUrl: settings.amqpUrl,
            redisUrl: settings.redisUrl,
            amqpTaskQueue: settings.amqpTaskQueue || 'task-queue',
            amqpTaskStatusExchange: settings.amqpTaskStatusExchange || 'task-status',
            amqpTaskStatusReadyKey: settings.amqpTaskStatusReadyKey || 'ready',
            redisTaskAttemptsKey: 'task-attempt',
            maxAttempts: ('maxAttempts' in settings) ? settings.maxAttempts : 3,
            printLogs: ('printLogs' in settings) ? settings.printLogs : true,
            logger: settings.logger || console,
        };

        if (settings.printLogs) {
            log(this, settings.logger);
        }

        this._redisInit();
        this._amqpInit();
    }

    /**
     * @param {function(task: Object)} taskHandler
     * @param cb
     * @returns {{cancel: (function(*))}}
     */
    addWorker(taskHandler, cb = noop) {
        if (typeof taskHandler !== 'function') {
            throw new Error('Task handler must be a function');
        }
        const { amqpTaskQueue } = this._settings;
        return this._amqpClient.consume(
            this._settings.amqpTaskQueue,
            this._onTaskMessage.bind(this, taskHandler),
            {
                prefetch: 1,
                noAck: false,
            },
            (err) => {
                if (err && cb) {
                    cb(err);
                } else if (err) {
                    this.emit('error', err);
                } else {
                    this.emit('amqp.consume', amqpTaskQueue);
                }
            },
        );
    }

    /**
     * @param {Object} task
     * @param {function(err)} cb
     */
    enqueue(task, cb) {
        const { amqpTaskQueue } = this._settings;
        async.waterfall([
            async.constant({
                lockSet: false,
            }),
            (ctx, next) => {
                this._redisTaskLockSet(task, (err) => {
                    if (!err) {
                        ctx.lockSet = true;
                        next(null, ctx);
                    } else if (err && err.code === 'ELOCKEXISTS') {
                        next(null, ctx);
                    } else {
                        next(err, ctx);
                    }
                });
            },
            (ctx, next) => {
                if (ctx.lockSet) {
                    this.emit('task.enqueue', amqpTaskQueue, task);
                    const message = JSON.stringify(task);
                    this._amqpClient.sendToQueue(this._settings.amqpTaskQueue, message, (err) => {
                        next(err, ctx);
                    });
                } else {
                    next(null, ctx);
                }
            },
            (ctx, next) => {
                this.wait(task, (err) => {
                    next(err, ctx);
                });
            },
            (ctx, next) => {
                if (ctx.lockSet) {
                    this._redisTaskLockClear(task, (err) => {
                        next(err, ctx);
                    });
                } else {
                    next(null, ctx);
                }
            },
            (ctx, next) => next(),
        ], cb);
    }

    _redisInit() {
        this._redisClient = redis.createClient({ url: this._settings.redisUrl })
            .once('ready', () => {
                this.emit('redis.ready');
            })
            .on('error', (err) => {
                this.emit('redis.error', err);
                this.emit('error', err);
            });
    }

    _amqpInit() {
        this._amqpClient = new AmqpClient({ url: this._settings.amqpUrl })
            .once('ready', () => {
                this.emit('amqp.ready');
            })
            .on('error', (err) => {
                this.emit('amqp.error', err);
                this.emit('error', err);
            });

        this._amqpClient.assertQueue(this._settings.amqpTaskQueue, {});

        if (this._settings.role === 'publisher') {
            this._listenTaskStatusUpdates();
        }
    }

    /**
     * @param {Object} task
     * @param {function} cb
     */
    wait(task, cb) {
        this.emit('task.wait', task);
        async.timeout(
            c => this.once(`task.done.${task.id}`, () => c()),
            60000,
        )((err) => {
            if (err && err.code === 'ETIMEDOUT') {
                cb(new Error('Task wait timed out'));
            } else {
                cb(err);
            }
        });
    }

    _listenTaskStatusUpdates() {
        const { amqpTaskStatusExchange, amqpTaskStatusReadyKey } = this._settings;
        this._amqpClient.assertExchange(amqpTaskStatusExchange, 'fanout', { durable: false });
        this._amqpClient.assertQueue('', { exclusive: true }, (err, q) => {
            this._amqpClient.bindQueue(q.queue, amqpTaskStatusExchange, amqpTaskStatusReadyKey);
            this._amqpClient.consume(
                q.queue,
                this._onTaskMessageStatusUpdateMessage.bind(this, q.queue),
                { noAck: true },
                (err) => {
                    if (err) {
                        this.emit('error', err);
                    } else {
                        this.emit('amqp.consume', q.queue);
                    }
                },
            );
        });
    }

    _onTaskMessageStatusUpdateMessage(queue, message) {
        this.emit('amqp.message', queue);
        let task;
        try {
            task = JSON.parse(message.content);
        } catch (err) {
            // TODO: error?
            this.emit('error', new InvalidTask());
        }
        this.emit('task.done', task);
        this.emit(`task.done.${task.id}`, task);
    }

    _redisTaskLockSet(task, cb) {
        const lockId = task.id;
        const lockMetadata = JSON.stringify(task);
        this._redisClient.set(lockId, lockMetadata, 'NX', 'PX', 1000, (err, status) => {
            const success = status === 'OK';
            if (err) {
                cb(new RedisError(err.message));
            } else if (!success) {
                cb(new LockExistsError());
            } else {
                this.emit('task.lock.set', status, task);
                cb();
            }
        });
    }

    _redisTaskLockClear(task, cb) {
        const lockId = task.id;
        this._redisClient.del(lockId, (err) => {
            if (err) {
                cb(new RedisError(err.message));
            } else {
                cb();
                this.emit('task.lock.clear', task);
            }
        });
    }

    _redisTaskAttemptsCounterIncr(task, cb) {
        this._redisClient.hincrbyfloat(this._settings.redisTaskAttemptsKey, task.id, 1, (err, attempt) => {
            if (err) {
                cb(new RedisError(err.message));
            } else if (!Number(attempt)) {
                cb(new Error(`Invalid attempt value: ${attempt}`));
            } else {
                cb(null, attempt);
            }
        });
    }

    _redisTaskAttemptsCounterReset(task, cb) {
        this._redisClient.hdel(this._settings.redisTaskAttemptsKey, task.id, cb || noop);
    }

    _onTaskMessage(taskHandler, message) {
        const { amqpTaskQueue } = this._settings;
        let task;
        try {
            task = JSON.parse(message.content.toString());
        } catch (err) {
            message.nack(AMQP_NACK_NO_REQUEUE);
            this.emit('error', new InvalidTask(err.message));
        }
        if (!task.id) {
            message.nack(AMQP_NACK_NO_REQUEUE);
            this.emit('task.nack', amqpTaskQueue, task);
            this.emit('error', new InvalidTask('Task `id` required'));
        }

        this.emit('task.dequeue', amqpTaskQueue, task);

        this._redisTaskAttemptsCounterIncr(task, (err, attempt) => {
            if (err) {
                message.nack(AMQP_NACK_NO_REQUEUE);
                this.emit('task.nack', amqpTaskQueue, task);
                this.emit('task.error', err, task);
            } else {
                taskHandler(task, (err) => {
                    if (err) {
                        if (attempt < this._settings.amqpUrl && !err.unrecoverable) {
                            message.nack(AMQP_NACK_REQUEUE);
                            this.emit('task.nack', amqpTaskQueue, task);
                            this.emit('task.error', err, task);
                            this.emit('task.requeue', task);
                        } else {
                            message.nack(AMQP_NACK_NO_REQUEUE);
                            this._redisTaskAttemptsCounterReset(task);
                            this.emit('task.nack', amqpTaskQueue, task);
                            this.emit('task.error', err, task);
                        }
                    } else {
                        this.emit('task.ack', amqpTaskQueue, task);
                        this._redisTaskAttemptsCounterReset(task);
                        this._publishTaskReadyEvent(task);
                        message.ack();
                    }
                });
            }
        });
    }

    _publishTaskReadyEvent(task) {
        this._amqpClient.publish(
            this._settings.amqpTaskStatusExchange,
            this._settings.amqpTaskStatusReadyKey,
            JSON.stringify(task),
        );
    }

    close(cb) {
        this.removeAllListeners('ready');
        async.parallel([
            c => this._amqpClient.close(c),
            c => this._redisClient.quit(c),
        ], cb);
    }
}

function log(taskQueue, logger) {
    taskQueue
        .on('amqp.ready', () => {
            logger.info('[AMQP]', 'Ready');
        })
        .on('amqp.error', (err) => {
            logger.error('[AMQP]', 'Error', '\n', inspect(err));
        })
        .on('amqp.message', (queueName) => {
            logger.info('[AMQP]', 'New message from', queueName);
        })
        .on('amqp.consume', (queueName) => {
            logger.info('[AMQP]', `Listening "${queueName}"`);
        })
        .on('redis.ready', () => {
            logger.info('[REDIS]', 'Connected');
        })
        .on('redis.error', (err) => {
            logger.error('[REDIS]', 'Error', '\n', inspect(err));
        })

        .on('task.enqueue', (queueName, task) => {
            logger.info(task.tag, '[TASK]', 'Enqueue', '\n', inspect({ id: task.id }));
        })
        .on('task.dequeue', (queueName, task) => {
            logger.info(task.tag, '[TASK]', 'Dequeue', '\n', inspect({ id: task.id }));
        })
        .on('task.ack', (queueName, task) => {
            logger.info(task.tag, '[TASK]', 'Ack', '\n', inspect({ id: task.id }));
        })
        .on('task.nack', (queueName, task) => {
            logger.info(task.tag, '[TASK]', 'Nack', '\n', inspect({ id: task.id }));
        })
        .on('task.lock.set', (status, task) => {
            if (status) {
                logger.info(task.tag, '[TASK]', 'Lock set', '\n', inspect({ id: task.id }));
            } else {
                logger.info(task.tag, '[TASK]', 'Lock already exists', '\n', inspect({ id: task.id }));
            }
        })
        .on('task.lock.clear', (task) => {
            logger.info(task.tag, '[TASK]', 'Lock cleared', '\n', inspect({ id: task.id }));
        })
        .on('task.error', (err, task) => {
            logger.error(task.tag, '[TASK]', 'Error', '\n', inspect({ id: task.id }), '\n', inspect(err));
        })
        .on('task.requeue', (task) => {
            logger.info(task.tag, '[TASK]', 'Requeue', '\n', inspect({ id: task.id }));
        })
        .on('error', (err) => {
            logger.error('[TASK]', 'Error', '\n', inspect(err));
        });
}

module.exports = TransformTaskQueue;
