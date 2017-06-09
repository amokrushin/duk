const fs = require('fs');
const path = require('path');
const mime = require('mime');
const { ResourceUrl } = require('duk');
const TransformTask = require('./TransformTask');
const express = require('express');
const { inspect } = require('util');

inspect.defaultOptions.colors = true;

function logStart() {
    return (req, res, next) => {
        req.tag = process.hrtime()[1].toString().slice(-4);
        console.log(req.tag, `[HTTP ${req.method}]`, 'start', '\n', req.url);
        next();
    };
}

function logEnd() {
    return [
        (req, res, next) => {
            console.log(req.tag, `[HTTP ${req.method}]`, 'end');
            next();
        },
        (err, req, res, next) => {
            console.log(req.tag, `[HTTP ${req.method}]`, 'error', '\n', err);
            next(err);
        },
    ];
}

function validateUrlParams() {
    return (req, res, next) => {
        if (!/\w+/.test(req.params.id)) {
            return res.status(400).end('Bad Request. Invalid URL `id` parameter');
        }
        if (!/\w+/.test(req.params.signature)) {
            return res.status(400).end('Bad Request. Invalid URL `signature` parameter');
        }
        if (!req.params.version) {
            return res.status(400).end('Bad Request. Invalid URL `version` parameter');
        }
        if (!req.params.filename) {
            return res.status(400).end('Bad Request. Invalid URL `filename` parameter');
        }
        req.resource = req.params;
        next();
    };
}

function validateSignature(hmacKey) {
    return (req, res, next) => {
        const { id, signature, version, filename } = req.resource;
        const resourceUrl = ResourceUrl.create({ method: req.method, id, version, filename, hmacKey });
        const isValid = resourceUrl.verifySignature(signature);
        if (isValid) {
            console.log(req.tag, '[VALIDATE_SIGNATURE]', 'OK');
            next();
        } else {
            console.log(req.tag, '[VALIDATE_SIGNATURE]', 'FAIL', {
                actual: signature,
                expected: resourceUrl.signature,
            });
            res.status(403).end('Invalid URL signature');
        }
    };
}

function pipeFileFromStore(storageDir, middlewares) {
    const nestedChain = middlewares.length
        ? express.Router().use(middlewares)
        : (req, res, next) => next();
    return (req, res, next) => {
        const { id, version, filename } = req.resource;
        const { ext } = path.parse(filename);
        const fileName = path.format({ name: `${id}-${version}`, ext });
        const filePath = path.join(storageDir, fileName);
        const fileStream = fs.createReadStream(filePath);
        fileStream.once('error', (err) => {
            if (err.code === 'ENOENT') {
                const [versionSrc = '', versionDest = ''] = version.split('+');
                if (versionSrc === 'original' && versionDest === '') {
                    res.status(404).end('Not found');
                } else if (!versionSrc || !versionDest) {
                    res.status(400).end('Bad Request. Invalid URL `version` parameter');
                } else {
                    nestedChain(req, res, next);
                }
            } else {
                res.status(500).end(err.message);
            }
        });
        fileStream.once('data', () => {
            console.log(req.tag, '[PIPE_FILE_FROM_STORE]', '\n', req.resource);
            res.writeHead(200, {
                'Content-Type': mime.lookup(filePath),
            });
        });
        fileStream.pipe(res);
        res.once('finish', next);
    };
}

function pipeFileToStore(storageDir) {
    return (req, res, next) => {
        console.log(req.tag, '[PIPE_FILE_TO_STORE]', '\n', req.resource);
        const { id, version, filename } = req.resource;
        const { ext } = path.parse(filename);
        const destFileName = path.format({ name: `${id}-${version}`, ext });
        const destFilePath = path.join(storageDir, destFileName);
        const destFileStream = fs.createWriteStream(destFilePath);
        req.pipe(destFileStream).once('finish', () => {
            console.log(req.tag, '[PIPE_FILE_TO_STORE]', 'finish');
            res.status(201).end();
            next();
        });
        destFileStream.once('error', (err) => {
            console.log(err);
            res.status(500).end(err.message);
            next();
        });
    };
}

function removeFileFromStore(storageDir) {
    return (req, res, next) => {
        const { id, version, filename } = req.resource;
        const { ext } = path.parse(filename);
        const fileName = path.format({ name: `${id}-${version}`, ext });
        const filePath = path.join(storageDir, fileName);
        console.log(req.tag, '[REMOVE_FILE_FROM_STORE]', filePath);
        fs.unlink(filePath, (err) => {
            if (err && err.code !== 'ENOENT') {
                console.log(req.tag, '[REMOVE_FILE_FROM_STORE]', 'FAIL', err);
                res.status(500).end(err.message);
            } else if (err) {
                console.log(req.tag, '[REMOVE_FILE_FROM_STORE]', 'file not found');
                res.status(204).end();
            } else {
                console.log(req.tag, '[REMOVE_FILE_FROM_STORE]', 'OK');
                res.status(204).end();
            }
            next();
        });
    };
}

function buildTransformTask({ frontOrigin, storageBaseUrl, hmacKey }) {
    const baseUrl = `${frontOrigin}${storageBaseUrl}`;
    return (req, res, next) => {
        const { id, version, filename } = req.resource;

        req.transformTask = new TransformTask(
            {
                id,
                version,
                filename,
                baseUrl,
                hmacKey,
            },
            {
                tag: req.tag,
            }
        );

        // console.info(req.tag, '[BUILD_TRANSFORM_TASK]', '\n', inspect({
        //     resource: req.resource,
        //     task: req.transformTask,
        // }));

        next();
    };
}

function enqueueTransformTask() {
    return (req, res, next) => {
        req.app.locals.taskQueue.enqueue(req.transformTask, next);
    };
}

module.exports = {
    logStart,
    logEnd,
    validateUrlParams,
    validateSignature,
    pipeFileFromStore,
    pipeFileToStore,
    removeFileFromStore,
    buildTransformTask,
    enqueueTransformTask,
};
