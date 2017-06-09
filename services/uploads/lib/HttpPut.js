const fs = require('fs');
const { Transform } = require('stream');
const testRequiredChunkFields = require('./testRequiredChunkFields');
const { MissingRequiredParameter, FsReadError, HttpError } = require('./errors');
const { ResourceUrl, request } = require('duk');

class HttpPut extends Transform {
    /**
     * Upload a file using HTTP PUT method
     * @param {Object} options
     *      HttpPut options.
     * @param {string} options.hmacKey
     *      URL sign HMAC key
     * @param {string} options.baseUrl
     *      Base URL
     * @extends Transform
     */
    constructor(options) {
        super({ objectMode: true });

        if (!options || !options.hmacKey) {
            throw new MissingRequiredParameter('Missing required key `hmacKey` in options');
        }

        if (!options || !options.baseUrl) {
            throw new MissingRequiredParameter('Missing required key `baseUrl` in options');
        }

        this.options = Object.assign({
            keyBy: 'id',
        }, options);
    }

    _transform({ metadata, errors = [] }, encoding, callback) {
        if (Array.isArray(errors) && errors.length) {
            return callback(null, { metadata, errors });
        }
        const missingFields = testRequiredChunkFields(metadata, [
            'id',
            'contentType',
            'filename',
            'localTmpFilepath',
        ], this.constructor.name, 'metadata');

        if (missingFields) {
            return callback(null, { metadata, errors: errors.concat(missingFields) });
        }

        const fileStream = fs.createReadStream(metadata.localTmpFilepath);
        const putEndpoint = ResourceUrl.create({
            method: 'PUT',
            id: metadata.id,
            version: 'original',
            filename: metadata.filename,
            hmacKey: this.options.hmacKey,
            baseUrl: this.options.baseUrl,
        }).toString();
        const putStream = request.put(putEndpoint, {
            headers: { 'Content-Type': metadata.contentType },
        });

        putStream.once('response', (res) => {
            console.log('[HTTP PUT]', `${putEndpoint} ${res.statusCode} (${res.statusMessage})`);
            const { statusCode, statusMessage } = res;
            if (statusCode >= 200 && statusCode < 300) {
                callback(null, { metadata, errors });
            } else {
                callback(null, {
                    metadata,
                    errors: errors.concat(new HttpError(`HTTP PUT failed: HTTP${statusCode} ${statusMessage}`)),
                });
            }
        });

        fileStream.once('error', (err) => {
            const error = new FsReadError(err.message);
            callback(null, { metadata, errors: errors.concat(error) });
        });

        putStream.once('error', (err) => {
            const error = new HttpError(`HTTP PUT failed: ${err.message}`);
            callback(null, { metadata, errors: errors.concat(error) });
        });

        fileStream.pipe(putStream);
    }
}

module.exports = HttpPut;
