const EventEmitter = require('events');
const defaults = require('lodash.defaults');
const Amqp = require('./_Amqp');
const pEvent = require('p-event');
const { timeout } = require('wait-then');

const { assign } = Object;

const { AMQP_IMAGE_TRANSFORM_QUEUE } = process.env;

class TransformTaskQueue extends EventEmitter {
    /**
     * @param url
     * @param [options]
     */
    constructor(url, options) {
        super();
        this._url = url;
        this._options = assign(
            {
                imageTransformQueue: 'image-transform-task',
            },
            options,
        );

        this._connection = null;
        this._channel = null;
    }

    connect() {
        return Amqp
            .createClient(this._url, {
                configuration: {
                    exchanges: {
                        'transform-done': {
                            type: 'fanout',
                            durable: false,
                        },
                    },
                    queues: {
                        [this._options.imageTransformQueue]: {
                            durable: false,
                        },
                    },
                },
            })
            .then((amqp) => {
                this._amqp = amqp;
                this._amqp.subscribe('transform-done', '', {}, (message) => {
                    this.emit(`transform-done:${message.content.id}`);
                });
                return this;
            });
    }

    enqueue(task) {
        this._amqp.sendToQueue(AMQP_IMAGE_TRANSFORM_QUEUE, task);
    }

    ack(task) {
        this._amqp.publish('transform-done', '', defaults({ success: true }, task));
    }

    nack(task) {
        this._amqp.publish('transform-done', '', defaults({ success: false }, task));
    }

    wait(task) {
        return Promise.race([
            pEvent(this, `transform-done:${task.id}`),
            timeout(10e3),
        ]);
    }

    close() {
        return this._amqp.close();
    }

    static createClient(url, options) {
        return new this(url, options).connect();
    }
}

module.exports = TransformTaskQueue;
