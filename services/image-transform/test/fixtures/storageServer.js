const http = require('http');
const mime = require('mime');
const fs = require('fs');
const sinon = require('sinon');

function storageServer(srcImagePath) {
    const storageState = {
        getStatus: 200,
        getContentType: null,
        putStatus: 201,
    };
    const server = http.createServer((req, res) => {
        if (req.method === 'GET') {
            server.getRequest();
            if (storageState.getStatus === 200) {
                res.writeHead(200, { 'Content-Type': storageState.getContentType || mime.lookup(srcImagePath) });
                fs.createReadStream(srcImagePath).pipe(res);
            } else {
                res.statusCode = storageState.getStatus;
                res.end();
            }
        }
        if (req.method === 'PUT') {
            server.putRequest();
            req.resume().once('end', () => {
                res.statusCode = storageState.putStatus;
                res.end();
            });
        }
    });
    server.getRequest = sinon.stub();
    server.putRequest = sinon.stub();

    server.resetStub = () => {
        server.getRequest.reset();
        server.putRequest.reset();
        storageState.getStatus = 200;
        storageState.getContentType = null;
        storageState.putStatus = 201;
    };
    return { server, storageState };
}

module.exports = storageServer;
