const amqplib = require('amqplib');
const EventEmitter = require('events');
const defaultsDeep = require('lodash.defaultsdeep');
const map = require('lodash.map');
const retry = require('retry-promise').default;
const { hideUrlPassword } = require('./util');

const { assign } = Object;

class Amqp extends EventEmitter {
    /**
     * @param url
     * @param [options]
     */
    constructor(url, options = {}) {
        super();
        this._url = url;
        this._options = assign({}, options);
        this._connection = null;
        this._channel = null;

        defaultsDeep(this._options, {
            retry: {
                max: 5,
                backoff: 1000,
            },
            configuration: {},
        });
    }

    connect() {
        console.info('[AMQP]', 'Connecting to', hideUrlPassword(this._url));

        return retry(this._options.retry, () => amqplib.connect(this._url))
            .then((connection) => {
                connection.once('error', (err) => {
                    this.emit('error', err);
                });
                console.info('[AMQP]', 'Connected');
                connection.once('close', () => {
                    console.info('[AMQP] Disconnected');
                });
                this._connection = connection;
                return connection;
            })
            .catch((err) => {
                this.emit(`[AMQP] Connection error: ${err.message}`);
            })
            .then(connection => connection.createChannel())
            .then((channel) => {
                this._channel = channel;
                return this._init();
            })
            .catch((err) => {
                this.emit(`[AMQP] Channel error: ${err.message}`);
            })
            .then(() => this);
    }

    _init() {
        const channel = this._channel;
        const configuration = this._options.configuration;
        const promises = [];
        map(configuration.queues, (options, queue) => {
            promises.push(channel.assertQueue(queue, options));
        });
        map(configuration.exchanges, (options, exchange) => {
            promises.push(channel.assertExchange(exchange, options.type || 'direct', options));
        });
        return Promise.all(promises);
    }

    _messageToBuffer(message) {
        return Buffer.from(JSON.stringify(message));
    }

    _messageFromBuffer(buffer) {
        return JSON.parse(buffer.toString());
    }

    sendToQueue(queue, message) {
        console.info('[AMQP]', 'sendToQueue', queue);
        this._channel.sendToQueue(queue, this._messageToBuffer(message));
        return this;
    }

    subscribe(exchange, key, options, handler) {
        const channel = this._channel;
        return channel.assertQueue('', { exclusive: true })
            .then(({ q: queue }) => {
                console.info('[AMQP]', `Listening exchange \`${key}\``);
                channel.bindQueue(queue, exchange, key);
                channel.consume(
                    queue,
                    (message) => {
                        console.info('[AMQP]', `Incoming message from \`${exchange}\` [\`${key}\`]`, message);
                        handler(assign(
                            {},
                            message,
                            {
                                content: this._messageFromBuffer(message.content),
                            },
                            options.noAck ? {} : {
                                ack() {
                                    channel.ack(message);
                                },
                                nack(requeue = false) {
                                    channel.nack(message, false, requeue);
                                },
                            }
                        ));
                    },
                    { noAck: options.noAck || false }
                );
            });
    }

    publish(exchange, key, message) {
        console.info('[AMQP]', `Publish message to \`${exchange}\` [\`${key}\`]`, message);
        this._channel.publish(exchange, key, this._messageToBuffer(message));
    }

    close() {
        return (this._connection ? this._connection.close() : Promise.resolve());
    }

    static createClient(url, options) {
        return new this(url, options).connect();
    }
}

module.exports = Amqp;
