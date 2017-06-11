const EventEmitter = require('events');
const AmqpClient = require('rmqp');
const async = require('async');
const redis = require('redis');
const { inspect } = require('util');
const { RedisError, InvalidTask, LockExistsError } = require('./errors');

const AMQP_NACK_REQUEUE = true;
const AMQP_NACK_NO_REQUEUE = false;

function noop() {}

class TransformTaskQueue extends EventEmitter {
    constructor(settings) {
        super();

        this._settings = {
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

        this._redisInit();
        this._amqpInit();
    }

    _redisInit() {
        const { redisUrl } = this._settings;

        const redisClient = redis.createClient({ url: redisUrl })
            .once('ready', () => {
                this.emit('redis.ready');
            })
            .on('error', (err) => {
                this.emit('redis.error', err);
                this.emit('error', err);
            });

        this._redisClient = redisClient;
    }

    _amqpInit() {
        const { amqpUrl, amqpTaskQueue, amqpTaskStatusExchange } = this._settings;

        const amqpClient = new AmqpClient({ url: amqpUrl })
            .once('ready', () => {
                this.emit('amqp.ready');
            })
            .on('error', (err) => {
                this.emit('amqp.error', err);
                this.emit('error', err);
            });

        amqpClient.assertQueue(amqpTaskQueue, {});
        amqpClient.assertExchange(amqpTaskStatusExchange, 'fanout', { durable: false });

        this._amqpClient = amqpClient;
    }

    close(cb) {
        this.removeAllListeners('ready');
        this.removeAllListeners('amqp.ready');
        this.removeAllListeners('redis.ready');
        async.parallel([
            c => this._amqpClient.close(c),
            c => this._redisClient.quit(c),
        ], cb);
    }
}

/**
 * @param settings
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
class TransformTaskPublisher extends TransformTaskQueue {
    constructor(settings) {
        super(settings);

        /**
         * @type {?stream.Writable}
         * @private
         */
        this._taskStream = null;

        const {
            amqpTaskQueue,
            amqpTaskStatusExchange,
            amqpTaskStatusReadyKey,
            printLogs,
            logger,
        } = this._settings;

        this.once('amqp.ready', () => {
            this._taskStream = this._amqpClient.publisher(
                amqpTaskQueue,
                { contentType: 'application/json' },
            );

            this._taskStatusStream = this._amqpClient.subscriber(
                amqpTaskStatusExchange,
                amqpTaskStatusReadyKey,
                { noAck: true },
            );

            this._taskStatusStream.on('data', (message) => {
                const task = message.content;
                this.emit('task.done', task);
                this.emit(`task.done.${task.id}`, task);
            });
        });

        this.once('close', () => {
            this._taskStream.end();
            this._taskStatusStream.close();
        });

        if (printLogs) {
            log(this, logger);
        }
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
                    this._taskStream.write(task);
                }
                next(null, ctx);
            },
            (ctx, next) => {
                this._waitTaskReadyStatus(task, (err) => {
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

    /**
     * @param {Object} task
     * @param {function} cb
     */
    _waitTaskReadyStatus(task, cb) {
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
}

/**
 * @param settings
 * @param {string} settings.amqpUrl
 * @param {string} settings.redisUrl
 * @param {function} settings.taskHandler
 * @param {string} [settings.amqpTaskQueue]
 * @param {string} [settings.amqpTaskStatusExchange]
 * @param {string} [settings.amqpTaskStatusReadyKey]
 * @param {string} [settings.redisTaskAttemptsKey]
 * @param {string} [settings.maxAttempts = 3]
 * @param {boolean} [settings.printLogs = true]
 * @param {Object} [settings.logger = console]
 */
class TransformTaskSubscriber extends TransformTaskQueue {
    constructor(settings) {
        super(settings);

        this._settings.taskHandler = settings.taskHandler;

        const {
            taskHandler,
            amqpTaskQueue,
            amqpTaskStatusExchange,
            amqpTaskStatusReadyKey,
            printLogs,
            logger,
        } = this._settings;

        if (typeof taskHandler !== 'function') {
            throw new Error('Task handler must be a function');
        }

        this.once('amqp.ready', () => {
            this._taskStream = this._amqpClient.subscriber(amqpTaskQueue, { noAck: false, prefetch: 1 })
                .on('data', (message) => {
                    this._onTaskMessage(taskHandler, message);
                })
                .on('error', (err) => {
                    this.emit('error', err);
                });

            this._taskStatusStream = this._amqpClient.publisher(
                amqpTaskStatusExchange,
                amqpTaskStatusReadyKey,
                { contentType: 'application/json' },
            );
        });

        this.once('close', () => {
            this._taskStatusStream.end();
            this._taskStream.close();
        });

        if (printLogs) {
            log(this, logger);
        }
    }

    _onTaskMessage(taskHandler, message) {
        const { amqpTaskQueue } = this._settings;
        const task = message.content;
        if (!task || !task.id) {
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
                        if (attempt < this._settings.maxAttempts && !err.unrecoverable) {
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
                        this._taskStatusStream.write(task);
                        message.ack();
                    }
                });
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

module.exports = {
    TransformTaskPublisher,
    TransformTaskSubscriber,
};
