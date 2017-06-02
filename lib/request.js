const http = require('http');
const duplexify = require('duplexify');
const concat = require('concat-stream');
const { parse } = require('url');

const { assign } = Object;

function request(method, url, options) {
    const req = http.request(assign({}, options, parse(url), { method }));
    const duplex = duplexify(req);
    req.on('response', (res) => {
        duplex.setReadable(res);
        duplex.emit('response', res);
    });
    duplex.buffer = (callback) => {
        duplex.pipe(concat(callback));
    };
    return duplex;
}

module.exports = http.METHODS.reduce((req, method) => {
    req[method.toLowerCase()] = request.bind(null, method);
    return req;
}, {});
