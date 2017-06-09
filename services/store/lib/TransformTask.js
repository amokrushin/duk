const crypto = require('crypto');
const path = require('path');
const { ResourceUrl, ImageVersion } = require('duk');

class TransformTask {
    constructor({ id, version, filename, baseUrl, hmacKey }, metadata) {
        const delimiterPos = version.lastIndexOf('+');
        const srcVersion = version.substring(0, delimiterPos);
        const destVersion = version.substring(delimiterPos + 1);
        const destFormat = path.parse(filename).ext.slice(0);

        Object.assign(this, metadata);

        this.id = sha1(`${id}${destVersion || srcVersion}${destFormat}`);

        Object.defineProperty(this, 'src', {
            enumerable: true,
            configurable: true,
            get: () => ResourceUrl
                .create({ method: 'GET', id, version: srcVersion, filename, hmacKey, baseUrl })
                .toString(),
        });

        Object.defineProperty(this, 'dest', {
            enumerable: true,
            configurable: true,
            get: () => ResourceUrl
                .create({ method: 'PUT', id, version, filename, hmacKey, baseUrl })
                .toString(),
        });

        Object.defineProperty(this, 'operations', {
            enumerable: true,
            configurable: true,
            get: () => ImageVersion.parse(destVersion),
        });
    }
}

function sha1(str) {
    return crypto.createHash('sha1').update(str, 'utf8').digest('hex');
}

module.exports = TransformTask;
