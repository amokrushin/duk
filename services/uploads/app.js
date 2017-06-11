const http = require('http');
const { Transform } = require('stream');
const {
    Multipart,
    MultipartError,
    Pick,
    FileSize,
    FileHash,
    StorageTempLocal,
    Exiftool,
    Zip,
    Merge,
    StringifyError,
    JsonStream,
} = require('stream-multipart-upload');
const HttpPut = require('./lib/HttpPut');
const StorageTempLocalCleanup = require('./lib/StorageTempLocalCleanup');

const {
    DUK_ORIGIN = 'http://front',
    DUK_UPLOAD_PORT = 80,
    DUK_STORE_BASE_URL = '/store',
    DUK_UPLOAD_EXTENSION_EXIFTOOL = 1,
    DUK_URL_SIGNING_KEY,
} = process.env;
const { assign } = Object;

const server = http.createServer((req, res) => {
    const uploadId = Date.now();
    console.info('[HTTP REQ]', `(${uploadId})`);
    res.once('finish', () => {
        console.info('[HTTP RES]', `(${uploadId}) done in ${Date.now() - uploadId} ms`);
    });

    const multipart = req.pipe(new Multipart({ headers: req.headers }));
    const zip = new Zip();

    multipart.once('data', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
    });

    multipart.once('error', (err) => {
        if (!res.headersSent) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    });

    multipart.pipe(new MultipartError()).pipe(zip);
    multipart.pipe(new Pick('metadata')).pipe(zip);
    multipart.pipe(new FileSize()).pipe(zip);
    multipart.pipe(new FileHash({ encoding: 'bs58', algorithm: 'sha1' })).pipe(zip);
    multipart.pipe(new StorageTempLocal({ tmpDir: '/tmp/duk' })).pipe(zip);

    if (DUK_UPLOAD_EXTENSION_EXIFTOOL && Number(DUK_UPLOAD_EXTENSION_EXIFTOOL)) {
        multipart.pipe(new Exiftool()).pipe(zip);
    }

    zip
        .pipe(new Merge())
        .pipe(new Transform({
            objectMode: true,
            transform({ metadata, errors }, encoding, callback) {
                console.log('[METADATA]', `(${uploadId})`);
                console.dir(metadata, { colors: true });
                callback(null, { metadata: assign({ id: metadata.sha1 }, metadata), errors });
            },
        }))
        .pipe(new HttpPut({
            baseUrl: `${DUK_ORIGIN}${DUK_STORE_BASE_URL}`,
            hmacKey: DUK_URL_SIGNING_KEY,
        }))
        .pipe(new StorageTempLocalCleanup())
        .pipe(new StringifyError())
        .pipe(new JsonStream())
        .pipe(res);
});

server.once('listening', () => {
    console.info('[HTTP]', `listening at ${server.address().port}`);
});

server.once('close', () => {
    if (DUK_UPLOAD_EXTENSION_EXIFTOOL && Number(DUK_UPLOAD_EXTENSION_EXIFTOOL)) {
        Exiftool.end();
    }
});

server.listen(DUK_UPLOAD_PORT);

module.exports = server;
