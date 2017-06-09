/* eslint-disable no-param-reassign */

function promisifyCallback(cb) {
    if (typeof cb !== 'function') {
        let resolve;
        let reject;
        cb = (...args) => {
            if (args[0]) return reject(args[0]);
            resolve(...args.slice(1));
        };
        cb.promise = new Promise((_resolve, _reject) => {
            resolve = _resolve;
            reject = _reject;
        });
    }
    return cb;
}

module.exports = promisifyCallback;
