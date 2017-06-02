const test = require('tape');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const { request, ResourceUrl } = require('../..');
const meter = require('stream-meter');
const probe = require('probe-image-size');

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
            'response body match'
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
    rq.end();
    rq.once('response', (res) => {
        t.equal(res.statusCode, 200, 'response status code is 200');
    });
    rs.once('finish', () => {
        t.equal(size.bytes, 1590132, 'response size match');
        t.end();
    });
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

    const rq = request.delete(resourceUrl);
    rq.end();
    rq.resume();
    rq.once('response', (res) => {
        t.equal(res.statusCode, 204, 'response status code is 204');
        t.end();
    });
});

test('GET original+rt,rs(w:200,h:200),max', (t) => {
    const resourceUrl = ResourceUrl
        .create({
            method: 'GET',
            id: '36jj25Jt33GggbYumNUUsa5Vf17H',
            version: 'original+rt,rs(w:200,h:200),mx',
            filename: 'sample-photo-1.jpg',
        })
        .toString();

    const rq = request.get(resourceUrl);
    rq.end();
    rq.once('response', (res) => {
        t.equal(res.statusCode, 200, 'response status code is 200');
        t.equal(res.headers['content-type'], 'image/jpeg', 'response content-type is `image/jpeg`');
    });
    probe(rq).then((metadata) => {
        t.equal(metadata.width, 113, 'transformed image width is 113');
        t.equal(metadata.height, 200, 'transformed image height is 200');
        t.equal(metadata.mime, 'image/jpeg', 'transformed image mime type is `image/jpeg`');
        t.end();
    });
});

test('GET original+rt,rs(w:200,h:200),max (multiple requests)', (group) => {
    const resourceUrl = ResourceUrl
        .create({
            id: '36jj25Jt33GggbYumNUUsa5Vf17H',
            version: 'original+rt,rs(w:200,h:200),max',
            filename: 'sample-photo-1.jpg',
        });
    const deleteUrl = resourceUrl.setMethod('DELETE').toString();
    const getUrl = resourceUrl.setMethod('GET').toString();

    group.test('DELETE original+rt,rs(w:200,h:200),max', (t) => {
        const rq = request.delete(deleteUrl);
        rq.end();
        rq.resume();
        rq.once('response', () => {
            t.end();
        });
    });

    group.test('GET original+rt,rs(w:200,h:200),max', (t) => {
        t.plan(10);
        for (let i = 0; i < 10; i++) {
            const rq = request.get(getUrl);
            rq.end();
            rq.once('response', (res) => {
                t.equal(res.statusCode, 200, 'response status code is 200');
            });
        }
    });
});
