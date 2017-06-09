class CustomError extends Error {
    constructor(...args) {
        super(...args);
        this.name = this.constructor.name;
    }
}

class MissingRequiredParameter extends CustomError {}
class MissingRequiredField extends CustomError {}
class InvalidChunk extends CustomError {}
class DbError extends CustomError {}
class HttpError extends CustomError {}
class FsReadError extends CustomError {}
class FsDeleteError extends CustomError {}

module.exports = {
    CustomError,
    MissingRequiredParameter,
    MissingRequiredField,
    InvalidChunk,
    DbError,
    HttpError,
};
