const sharp = require('sharp');
const mime = require('mime');
const TransformTaskQueue = require('duk-task-queue');
const request = require('./lib/request');
const { SharpError, InvalidContentTypeError } = require('./lib/errors');
const { inspect } = require('util');

inspect.defaultOptions.colors = true;
inspect.defaultOptions.depth = 1;

const {
    AMQP_URL,
    REDIS_URL,
    TASK_ATTEMPTS_MAX = 3,
} = process.env;

console.info('[PROCESS]', {
    platform: process.platform,
    arch: process.arch,
    pid: process.pid,
});

sharp.cache(false);

const taskQueue = new TransformTaskQueue({
    role: 'worker',
    amqpUrl: AMQP_URL,
    redisUrl: REDIS_URL,
    maxAttempts: TASK_ATTEMPTS_MAX,
    logger: console,
});

taskQueue.on('error', (err) => {
    console.error('TASK QUEUE', 'error', '\n', err);
    process.exit(1);
});

taskQueue.addWorker(taskHandler);

async function taskHandler(task, cb) {
    const srcStream = await request.get(task.src, { headers: { Accept: 'image/*' } });
    if (!/^image\//.test(srcStream.headers['content-type'])) {
        srcStream.resume();
        throw new InvalidContentTypeError(`Failed to load image "${task.src}", ` +
            `the server responded with a Content-Type header of "${srcStream.headers['content-type']}"`);
    }
    const transformStream = createTransformStream(task);
    const putStream = srcStream.pipe(transformStream);
    request.put(task.dest, { headers: { 'Content-Type': mime.lookup(task.dest) } }, putStream)
        .then(() => cb(), cb);
}

function createTransformStream(task) {
    const transformStream = task.operations.reduce((stream, { name, args = [] }) => {
        const sharpMethod = stream[name];
        if (typeof sharpMethod !== 'function') {
            throw new SharpError(`Invalid sharp operation: ${name}`);
        }
        return stream[name](...args);
    }, sharp());

    transformStream
        .metadata()
        .then((metadata) => {
            console.info(task.tag, '[IMAGE METADATA]', `(${task.id})`, metadata);
        });

    return transformStream;
}

function shutdown(signal) {
    console.info(`Received ${signal} signal. Shutting down...`);
    taskQueue.close(() => {
        console.info('[TASK QUEUE] Disconnected');
    });
}

process.on('SIGTERM', shutdown.bind(null, 'SIGTERM'));
process.once('SIGINT', shutdown.bind(null, 'SIGINT'));
