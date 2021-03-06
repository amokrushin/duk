const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { TransformTaskPublisher } = require('duk-task-queue');
const { inspect } = require('util');
const {
    logStart,
    logEnd,
    validateUrlParams,
    validateSignature,
    pipeFileFromStore,
    pipeFileToStore,
    removeFileFromStore,
    buildTransformTask,
    enqueueTransformTask,
} = require('./lib/middlewares');

inspect.defaultOptions.colors = true;
inspect.defaultOptions.depth = 1;

const {
    DUK_ORIGIN = 'http://front',
    DUK_STORE_PORT = 80,
    DUK_STORE_DIR,
    DUK_STORE_TEMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'duk-')),
    DUK_STORE_BASE_URL = '/store',
    DUK_URL_SIGNING_KEY,
    AMQP_URL,
    REDIS_URL,
} = process.env;

const taskQueue = new TransformTaskPublisher({
    amqpUrl: AMQP_URL,
    redisUrl: REDIS_URL,
});

taskQueue.on('error', (err) => {
    console.error('TASK QUEUE', 'error', '\n', err);
    process.exit(1);
});

const app = express();
const resourceRoute = `${DUK_STORE_BASE_URL}/:id/:signature/:version/:filename`;

app.locals.taskQueue = taskQueue;

app.get(resourceRoute, [
    logStart(),
    validateUrlParams(),
    pipeFileFromStore(DUK_STORE_DIR, [
        validateSignature(DUK_URL_SIGNING_KEY),
        buildTransformTask({
            frontOrigin: DUK_ORIGIN,
            storageBaseUrl: DUK_STORE_BASE_URL,
            hmacKey: DUK_URL_SIGNING_KEY,
        }),
        enqueueTransformTask(),
        pipeFileFromStore(DUK_STORE_DIR, []),
    ]),
    logEnd(),
]);

app.put(resourceRoute, [
    logStart(),
    validateUrlParams(),
    validateSignature(DUK_URL_SIGNING_KEY),
    pipeFileToStore(DUK_STORE_DIR, DUK_STORE_TEMP_DIR),
    logEnd(),
]);

app.delete(resourceRoute, [
    logStart(),
    validateUrlParams(),
    validateSignature(DUK_URL_SIGNING_KEY),
    removeFileFromStore(DUK_STORE_DIR),
    logEnd(),
]);

app.server = http.createServer(app);

app.locals.taskQueue = taskQueue;

app.server.listen(DUK_STORE_PORT, () => {
    console.info('[HTTP SERVER]', `listening port ${app.server.address().port}`);
});

app.once('close', () => {
    app.server.close();
    taskQueue.close();
});

module.exports = app;
