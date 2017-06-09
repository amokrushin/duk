const redis = require('redis');
const { promisifyCallback, hideUrlPassword } = require('./util');
const { promisify } = require('util');

const { assign } = Object;

[
    'set',
    'del',
    'quit',
].forEach((method) => {
    redis.RedisClient.prototype[`${method}Async`] = promisify(redis.RedisClient.prototype[method]);
});

class TransformTaskLock {
    constructor(url, options) {
        this._url = url;

        this._client = null;

        this._options = assign({
            totalRetryTime: 10000,
            maxAttempts: 3,
            reconnectDelay: 3000,
        }, options);
    }

    _connect(callback) {
        const cb = promisifyCallback(callback);

        console.info('[REDIS]', 'Connecting to', hideUrlPassword(this._url));

        this._client = redis.createClient({
            url: this._url,
            enable_offline_queue: false,
            retry_strategy(options) {
                if (options.error && options.error.code === 'ECONNREFUSED') {
                    return new Error('The server refused the connection');
                }
                if (options.total_retry_time > this._options.totalRetryTime) {
                    return new Error('Retry time exhausted');
                }
                if (options.attempt > this._options.maxAttempts) {
                    return new Error('Number of retry attempts exhausted');
                }
                return Math.min(options.attempt * 100, this._options.reconnectDelay);
            },
            prefix: 'lock:',
        });

        this._client.once('ready', () => {
            console.info('[REDIS]', 'Connected');
            // this._client.unref();
            cb(null, this);
        });
        this._client.once('end', () => {
            console.info('[REDIS]', 'Disconnected');
        });
        this._client.once('error', (err) => {
            console.error('[REDIS]', err);
            cb(err);
        });

        return cb.promise;
    }

    async setLock(lockId, metadata) {
        const lockStatus = await this._client.setAsync(lockId, metadata, 'NX', 'PX', 1000);
        return lockStatus === 'OK' ? lockId : null;
    }

    async clearLock(lockId) {
        return this._client.delAsync(lockId);
    }

    close() {
        return this._client.quitAsync();
    }

    static createClient(url, options) {
        return new this(url, options)._connect();
    }
}

module.exports = TransformTaskLock;
