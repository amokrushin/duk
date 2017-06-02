const crypto = require('crypto');
const bs58 = require('bs58');

function createHmac(str, key, slice = 8) {
    const hmac = crypto.createHmac('sha1', key).update(str).digest();
    return slice ? bs58.encode(hmac).slice(0, slice) : bs58.encode(hmac);
}

class ResourceUrl {
    constructor({ method, id, version, filename, hmacKey, baseUrl } = {}) {
        this.setMethod(method);
        this.setId(id);
        this.setVersion(version);
        this.setFilename(filename);
        this.setHmacKey(hmacKey || ResourceUrl.hmacKey);
        this.setBaseUrl(baseUrl || ResourceUrl.baseUrl);

        Object.defineProperty(this, 'signature', {
            enumerable: true,
            get: () => {
                if (typeof this._method !== 'string' || !this._method) {
                    throw new Error('`method` is required parameter');
                }
                if (typeof this._id !== 'string' || !this._id) {
                    throw new Error('`id` is required parameter');
                }
                if (typeof this._version !== 'string' || !this._version) {
                    throw new Error('`version` is required parameter');
                }
                if (typeof this._hmacKey !== 'string' || !this._hmacKey) {
                    throw new Error('`hmacKey` is required parameter');
                }

                return createHmac([this._method, this._id, this._version].join('&'), this._hmacKey);
            },
        });
    }

    setMethod(method) {
        if (typeof method === 'string' && method) {
            this._method = method.toUpperCase();
        }
        return this;
    }

    setId(id) {
        if (typeof id === 'string' && id) {
            this._id = id;
        }
        return this;
    }

    setVersion(version) {
        if (typeof version === 'string' && version) {
            this._version = version;
        }
        return this;
    }

    setFilename(filename) {
        if (typeof filename === 'string' && filename) {
            this._filename = filename;
        }
        return this;
    }

    setHmacKey(hmacKey) {
        if (typeof hmacKey === 'string' && hmacKey) {
            this._hmacKey = hmacKey;
        }
        return this;
    }

    setBaseUrl(baseUrl) {
        if (typeof baseUrl === 'string' && baseUrl) {
            this._baseUrl = baseUrl;
        }
        return this;
    }

    verifySignature(signature) {
        return crypto.timingSafeEqual(Buffer.from(this.signature), Buffer.from(signature));
    }

    toString() {
        if (typeof this._filename !== 'string' || !this._filename) {
            throw new Error('`filename` is required parameter');
        }
        if (typeof this._baseUrl !== 'string' || !this._baseUrl) {
            throw new Error('`baseUrl` is required parameter');
        }
        return `${this._baseUrl}/${this._id}/${this.signature}/${this._version}/${this._filename}`;
    }

    clone() {
        return new this.constructor({
            method: this._method,
            id: this._id,
            version: this._version,
            filename: this._filename,
            hmacKey: this._hmacKey,
            baseUrl: this._baseUrl,
        });
    }

    static create(params) {
        return new this(params);
    }
}

module.exports = ResourceUrl;
