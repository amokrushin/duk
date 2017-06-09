const fs = require('fs');
const { Transform } = require('stream');
const omit = require('lodash.omit');
const { FsDeleteError } = require('./errors');

class StorageTempLocalCleanup extends Transform {
    constructor() {
        super({ objectMode: true });
    }

    _transform({ metadata, errors = [] }, encoding, callback) {
        if (metadata.localTmpFilepath) {
            fs.unlink(metadata.localTmpFilepath, (err) => {
                if (err) {
                    const error = new FsDeleteError(err.message);
                    callback(null, { metadata, errors: errors.concat(error) });
                } else {
                    callback(null, { metadata: omit(metadata, ['localTmpFilepath']), errors });
                }
            });
        } else {
            callback(null, { metadata, errors });
        }
    }
}

module.exports = StorageTempLocalCleanup;
