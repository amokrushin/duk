const http = require('http');
const { parse: urlParse } = require('url');
const { InvalidHttpResponseError, InvalidUrl, HttpRequestError } = require('./errors');

const { assign } = Object;

function get(urlString, options = {}) {
    let urlObject;
    try {
        urlObject = urlParse(urlString);
    } catch (err) {
        throw new InvalidUrl(err.message);
    }
    const opts = assign({}, urlObject, options, { method: 'GET' });

    return new Promise((resolve, reject) => {
        const req = http.request(opts, (res) => {
            const { statusCode, statusMessage } = res;
            if (statusCode >= 200 && statusCode < 300) {
                console.info(`[HTTP] ${req.method} ${urlString} ${statusCode} (${statusMessage})`);
                resolve(res);
            } else {
                res.resume();
                reject(new InvalidHttpResponseError(`Failed to ${opts.method} resource "${urlString}", ` +
                    `the server responded with a status of ${statusCode} (${statusMessage})`));
            }
        });
        req.once('error', (err) => {
            reject(new HttpRequestError(err.message));
        });
        req.end();
    });
}

function put(url, options = {}, stream) {
    const opts = assign({}, urlParse(url), options, { method: 'PUT' });

    return new Promise((resolve, reject) => {
        const req = http.request(opts, (res) => {
            const { statusCode, statusMessage } = res;
            res.resume();
            if (statusCode >= 200 && statusCode < 300) {
                console.info(`[HTTP] ${req.method} ${url} ${statusCode} (${statusMessage})`);
                resolve();
            } else {
                reject(new InvalidHttpResponseError(`Failed to ${opts.method} resource "${url}", ` +
                    `the server responded with a status of ${statusCode} (${statusMessage})`));
            }
        });
        stream.pipe(req);
        stream.once('error', reject);
    });
}

module.exports = { get, put };
