class RecoverableError extends Error {
    constructor(...args) {
        super(...args);
        this.name = this.constructor.name;
    }
}

class UnrecoverableError extends Error {
    constructor(...args) {
        super(...args);
        this.name = this.constructor.name;
        this.unrecoverable = true;
    }
}

class SharpError extends UnrecoverableError {}
class InvalidContentTypeError extends UnrecoverableError {}
class InvalidHttpResponseError extends RecoverableError {}
class RedisError extends RecoverableError {}
class InvalidUrl extends UnrecoverableError {}
class HttpRequestError extends RecoverableError {}

module.exports = {
    SharpError,
    InvalidContentTypeError,
    InvalidHttpResponseError,
    RedisError,
    InvalidUrl,
    HttpRequestError,
};
