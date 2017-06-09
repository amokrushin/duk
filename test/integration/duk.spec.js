const test = require('tape');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { request, ResourceUrl } = require('../..');
const meter = require('stream-meter');
const probe = require('probe-image-size');
const async = require('async');

const ORIGIN = 'http://localhost:8081';
const UPLOAD_ENDPOINT = `${ORIGIN}/upload`;
const STORE_ENDPOINT = `${ORIGIN}/store`;
const DUK_URL_SIGNING_KEY = '5SMIQOMOAmpQ1tdwttUsuD9RHa9hdFG';

ResourceUrl.hmacKey = DUK_URL_SIGNING_KEY;
ResourceUrl.baseUrl = STORE_ENDPOINT;

test('POST upload', (t) => {
    const form = new FormData();
    const rq = request.post(UPLOAD_ENDPOINT, { headers: form.getHeaders() });
    const fileStream = fs.createReadStream(path.join(__dirname, '../fixtures/sample-photo-1.jpg'));

    form.append('file', fileStream);
    form.pipe(rq);

    rq.once('response', (res) => {
        t.equal(res.statusCode, 200, 'response status code is 200');
    });

    rq.buffer((body) => {
        const content = JSON.parse(body);
        t.ifError(content[0].errors, 'response body has no error');
        t.deepEqual(
            content,
            [{
                metadata: {
                    cameraAperture: 'f/2',
                    cameraDatetime: '2015-03-18T09:10:06',
                    cameraExposureTime: '46/7541s',
                    cameraFlashFired: false,
                    cameraFlashMode: 0,
                    cameraFocalLength: '2.69mm',
                    cameraISO: 'ISO50',
                    cameraModel: 'ASUS T00J',
                    contentType: 'image/jpeg',
                    create: '2015-03-18T09:10:06',
                    encoding: 'binary',
                    fieldname: 'file',
                    filename: 'sample-photo-1.jpg',
                    gpsTimestamp: 1426641005,
                    height: 1836,
                    id: '36jj25Jt33GggbYumNUUsa5Vf17H',
                    modify: '2015-03-18T09:10:06',
                    orientation: 6,
                    sha1: '36jj25Jt33GggbYumNUUsa5Vf17H',
                    size: 1590132,
                    width: 3264,
                },
            }],
            'response body match',
        );

        t.end();
    });
});

test('GET original', (t) => {
    const resourceUrl = ResourceUrl
        .create({
            method: 'GET',
            id: '36jj25Jt33GggbYumNUUsa5Vf17H',
            version: 'original',
            filename: 'sample-photo-1.jpg',
        })
        .toString();

    const rq = request.get(resourceUrl);
    const size = meter();
    const rs = rq.pipe(size).resume();
    rq.once('response', (res) => {
        t.equal(res.statusCode, 200, 'response status code is 200');
    });
    rs.once('finish', () => {
        t.equal(size.bytes, 1590132, 'response size match');
        t.end();
    });
    rq.end();
});

test('DELETE original+rt,rs(w:200,h:200),max', (t) => {
    const resourceUrl = ResourceUrl
        .create({
            method: 'DELETE',
            id: '36jj25Jt33GggbYumNUUsa5Vf17H',
            version: 'original+rt,rs(w:200,h:200),max',
            filename: 'sample-photo-1.jpg',
        })
        .toString();

    request.delete(resourceUrl)
        .once('response', (res) => {
            t.equal(res.statusCode, 204, 'response status code is 204');
            t.end();
        })
        .resume()
        .end();
});

test('DELETE/GET original+rt,rs(w:200,h:200),max', { timeout: 500 }, (group) => {
    const resourceUrl = ResourceUrl
        .create({
            id: '36jj25Jt33GggbYumNUUsa5Vf17H',
            version: 'original+rt,rs(w:200,h:200),max',
            filename: 'sample-photo-1.jpg',
        });
    const deleteUrl = resourceUrl.setMethod('DELETE').toString();
    const getUrl = resourceUrl.setMethod('GET').toString();

    group.test('DELETE original+rt,rs(w:200,h:200),max', { timeout: 500 }, (t) => {
        request.delete(deleteUrl)
            .resume()
            .once('response', (res) => {
                t.equal(res.statusCode, 204, 'response status code is 204');
                t.end();
            })
            .end();
    });

    group.test('GET original+rt,rs(w:200,h:200),max', { timeout: 500 }, (t) => {
        const rq = request.get(getUrl)
            .once('response', (res) => {
                t.equal(res.statusCode, 200, 'response status code is 200');
                t.equal(res.headers['content-type'], 'image/jpeg', 'response content-type is `image/jpeg`');
            });
        probe(rq).then((metadata) => {
            t.equal(metadata.width, 113, 'transformed image width is 113');
            t.equal(metadata.height, 200, 'transformed image height is 200');
            t.equal(metadata.mime, 'image/jpeg', 'transformed image mime type is `image/jpeg`');
            t.end();
        });
        rq.end();
    });
});

test('Stress test, multiple requests to single resource while transforming', (group) => {
    const REPEATS = 10;
    const resourceUrl = ResourceUrl
        .create({
            id: '36jj25Jt33GggbYumNUUsa5Vf17H',
            version: 'original+rt,rs(w:200,h:200),max',
            filename: 'sample-photo-1.jpg',
        });
    const deleteUrl = resourceUrl.setMethod('DELETE').toString();
    const getUrl = resourceUrl.setMethod('GET').toString();

    group.test('Setup (DELETE original+rt,rs(w:200,h:200),max)', (t) => {
        request.delete(deleteUrl)
            .resume()
            .once('response', (res) => {
                t.equal(res.statusCode, 204, 'response status code is 204');
                t.end();
            })
            .end();
    });

    group.test(`Test (GET original+rt,rs(w:200,h:200),max) x ${REPEATS} times`, (t) => {
        async.times(REPEATS, (n, cb) => {
            request.get(getUrl)
                .once('response', (res) => {
                    if (res.statusCode === 200) {
                        cb();
                    } else {
                        cb(new Error(`Status code is not 200 [${res.statusCode}]`));
                    }
                })
                .end();
        }, (err) => {
            if (err) {
                t.ifError(err);
            } else {
                t.pass(`success (${REPEATS} times)`);
            }
            t.end();
        });
    });
});

test.skip('GET original+rs(w:20x),mx (multiple transform workers)', (group) => {
    const resourceUrl = ResourceUrl
        .create({
            id: '36jj25Jt33GggbYumNUUsa5Vf17H',
            version: 'original+rt,rs(w:200,h:200),max',
            filename: 'sample-photo-1.jpg',
        });
    const deleteUrl = resourceUrl.clone().setMethod('DELETE');
    const getUrl = resourceUrl.clone().setMethod('GET');

    console.time('transform x 3');

    group.test('DELETE original+rs(w:20x),mx', { skip: false }, (t) => {
        t.plan(3);
        request.delete(deleteUrl.setVersion('original+rs(w:201),mx').toString())
            .resume()
            .once('response', (res) => {
                t.equal(res.statusCode, 204, 'response status code is 204');
            })
            .end();
        request.delete(deleteUrl.setVersion('original+rs(w:202),mx').toString())
            .resume()
            .once('response', (res) => {
                t.equal(res.statusCode, 204, 'response status code is 204');
            })
            .end();
        request.delete(deleteUrl.setVersion('original+rs(w:203),mx').toString())
            .resume()
            .once('response', (res) => {
                t.equal(res.statusCode, 204, 'response status code is 204');
            })
            .end();
    });

    group.test('GET original+rs(w:20x),mx', { skip: false }, (t) => {
        t.plan(3);
        request.get(getUrl.setVersion('original+rs(w:201),mx').toString())
            .resume()
            .once('response', (res) => {
                t.equal(res.statusCode, 200, 'response status code is 200');
            })
            .end();
        request.get(getUrl.setVersion('original+rs(w:202),mx').toString())
            .resume()
            .once('response', (res) => {
                t.equal(res.statusCode, 200, 'response status code is 200');
            })
            .end();
        request.get(getUrl.setVersion('original+rs(w:203),mx').toString())
            .resume()
            .once('response', (res) => {
                t.equal(res.statusCode, 200, 'response status code is 200');
            })
            .end();
    });

    group.test('time', (t) => {
        console.timeEnd('transform x 3');
        t.end();
    });
});
