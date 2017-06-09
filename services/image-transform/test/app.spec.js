const test = require('tape');
const path = require('path');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

const { amqpConnection, amqpChannel } = require('./fixtures/amqpConnection');
const { redisClient } = require('./fixtures/redisClient');
const storageServer = require('./fixtures/storageServer');

const ANY = sinon.match.any;
const AMQP_NACK_REQUEUE = true;
const AMQP_NACK_NO_REQUEUE = false;
const SRC_IMAGE_PATH = path.join(__dirname, 'fixtures/sample.jpg');

// sinon.stub(console, 'info');
// sinon.stub(console, 'error');

process.env.AMQP_URL = 'stub';
process.env.REDIS_URL = 'stub';

test('task -> get -> transform -> put -> ack', (group) => {
    const { server, storageState } = storageServer(SRC_IMAGE_PATH);
    let queue;
    const validTask = () => ({
        src: `http://localhost:${server.address().port}/sample.jpg`,
        dest: `http://localhost:${server.address().port}/sample-transformed.jpg`,
        operations: [['rotate'], ['resize', 200, 200], ['max']],
    });
    const invalidTaskSrc = src => ({
        src,
        dest: `http://localhost:${server.address().port}/sample-transformed.jpg`,
        operations: [['rotate'], ['resize', 200, 200], ['max']],
    });
    const invalidTaskInvalidSharpOperation = () => ({
        src: `http://localhost:${server.address().port}/sample.jpg`,
        dest: `http://localhost:${server.address().port}/sample-transformed.jpg`,
        operations: [['invalid'], ['invalid']],
    });

    function next(t) {
        process.nextTick(() => {
            server.resetStub();
            amqpChannel.resetStub();
            redisClient.resetStub();
            t.end();
        });
    }

    group.test('setup', (t) => {
        t.plan(2);
        proxyquire('../lib/amqp-queue', {
            amqplib: {
                connect: sinon.stub().resolves(amqpConnection),
            },
        });
        proxyquire('../app', {
            redis: {
                createClient: sinon.stub().returns(redisClient),
            },
        });
        server.listen(() => {
            t.pass('storage server mock started');
        });
        sinon.stub(amqpChannel, 'consume').callsFake((_, event) => {
            queue = payload => event({ content: Buffer.from(JSON.stringify(payload)) });
            t.pass('amqp queue mock started');
        });
    });

    group.test('Success', (t) => {
        amqpChannel.ack.callsFake(() => {
            t.ok(amqpChannel.ack.calledOnce, 'AMQP ACK called once');
            t.ok(amqpChannel.nack.notCalled, 'AMQP NACK not called');
            t.ok(server.getRequest.calledOnce, 'HTTP GET request sent');
            t.ok(server.putRequest.calledOnce, 'HTTP PUT request sent');
            t.ok(redisClient.hincrbyfloat.calledOnce, 'REDIS hincrbyfloat called once');

            next(t);
        });

        queue(validTask());
    });

    group.test('Test nack: storage invalid (not "image/*") Content-Type response on GET request', (t) => {
        storageState.getContentType = 'text/plain';

        amqpChannel.nack.callsFake(() => {
            t.ok(amqpChannel.ack.notCalled, 'AMQP ACK not called');
            t.ok(amqpChannel.nack.firstCall.calledWith(ANY, ANY, AMQP_NACK_NO_REQUEUE), 'AMQP NACK (do not requeue)');

            t.ok(server.getRequest.calledOnce, 'HTTP GET request sent once');
            t.ok(server.putRequest.notCalled, 'HTTP PUT request not sent');

            next(t);
        });

        queue(validTask());
    });

    group.test('Test nack: storage failure (HTTP500 x 3) on PUT request', (t) => {
        storageState.putStatus = 500;

        amqpChannel.nack.callsFake(() => {
            t.ok(amqpChannel.ack.notCalled, 'AMQP ACK not called');
            t.ok(amqpChannel.nack.firstCall.calledWith(ANY, ANY, AMQP_NACK_REQUEUE), 'AMQP NACK (requeue)');

            t.ok(server.getRequest.calledOnce, 'HTTP GET request sent once');
            t.ok(server.putRequest.calledOnce, 'HTTP PUT request sent once');

            next(t);
        });

        queue(validTask());
    });

    group.test('Test requeue: storage failure (HTTP500 x 2, HTTP200) on GET request 1-fall 2-fail 3-fail', (t) => {
        storageState.getStatus = 500;

        amqpChannel.nack.withArgs(ANY, ANY, AMQP_NACK_REQUEUE).callsFake(() => {
            queue(validTask());
        });

        amqpChannel.nack.withArgs(ANY, ANY, AMQP_NACK_NO_REQUEUE).callsFake(() => {
            t.ok(amqpChannel.ack.notCalled, 'AMQP ACK not called');
            t.ok(amqpChannel.nack.firstCall.calledWith(ANY, ANY, AMQP_NACK_REQUEUE), 'AMQP NACK (requeue)');
            t.ok(amqpChannel.nack.secondCall.calledWith(ANY, ANY, AMQP_NACK_REQUEUE), 'AMQP NACK (requeue)');
            t.ok(amqpChannel.nack.thirdCall.calledWith(ANY, ANY, AMQP_NACK_NO_REQUEUE), 'AMQP NACK (do not requeue)');

            t.ok(server.getRequest.calledThrice, 'HTTP GET request sent thrice');
            t.ok(server.putRequest.notCalled, 'HTTP PUT request not sent');
            t.ok(redisClient.hincrbyfloat.calledThrice, 'REDIS hincrbyfloat called thrice');

            next(t);
        });

        queue(validTask());
    });

    group.test('Test requeue: storage failure (HTTP500) on GET request 1-fall 2-fail 3-ok', (t) => {
        storageState.getStatus = 500;

        amqpChannel.nack.withArgs(ANY, ANY, AMQP_NACK_REQUEUE)
            .onFirstCall()
            .callsFake(() => {
                queue(validTask());
            })
            .onSecondCall()
            .callsFake(() => {
                queue(validTask());
                storageState.getStatus = 200;
            });

        amqpChannel.ack.callsFake(() => {
            t.ok(amqpChannel.ack.calledOnce, 'AMQP ACK called once');
            t.ok(amqpChannel.nack.firstCall.calledWith(ANY, ANY, AMQP_NACK_REQUEUE), 'AMQP NACK (requeue)');
            t.ok(amqpChannel.nack.secondCall.calledWith(ANY, ANY, AMQP_NACK_REQUEUE), 'AMQP NACK (requeue)');

            t.ok(server.getRequest.calledThrice, 'HTTP GET request sent thrice');
            t.ok(server.putRequest.calledOnce, 'HTTP PUT request not sent');
            t.ok(redisClient.hincrbyfloat.calledThrice, 'REDIS hincrbyfloat called thrice');

            next(t);
        });

        queue(validTask());
    });

    group.test('Test nack: task with invalid sharp operation', (t) => {
        amqpChannel.nack.callsFake(() => {
            t.ok(amqpChannel.ack.notCalled, 'AMQP ACK not called');
            t.ok(amqpChannel.nack.firstCall.calledWith(ANY, ANY, AMQP_NACK_NO_REQUEUE), 'AMQP NACK (do not requeue)');
            t.ok(amqpChannel.nack.calledOnce, 'AMQP NACK called once');

            next(t);
        });

        queue(invalidTaskInvalidSharpOperation());
    });

    group.test('Test nack: task without src', (t) => {
        amqpChannel.nack.callsFake(() => {
            t.ok(amqpChannel.ack.notCalled, 'AMQP ACK not called');
            t.ok(amqpChannel.nack.firstCall.calledWith(ANY, ANY, AMQP_NACK_NO_REQUEUE), 'AMQP NACK (do not requeue)');
            t.ok(amqpChannel.nack.calledOnce, 'AMQP NACK called once');

            next(t);
        });

        queue(invalidTaskSrc());
    });

    group.test('Test nack: task with invalid src', (t) => {
        amqpChannel.nack.callsFake(() => {
            t.ok(amqpChannel.ack.notCalled, 'AMQP ACK not called');
            t.ok(amqpChannel.nack.firstCall.calledWith(ANY, ANY, AMQP_NACK_REQUEUE), 'AMQP NACK (requeue)');
            t.ok(amqpChannel.nack.calledOnce, 'AMQP NACK called once');

            next(t);
        });

        queue(invalidTaskSrc('https://example'));
    });

    group.test('Test nack: redis hincrbyfloat error', (t) => {
        redisClient.hincrbyfloat.reset();
        redisClient.hincrbyfloat.callsFake((key, taskId, incrBy, callback) => {
            callback(new Error('hincrbyfloat error'));
        });

        process.once('uncaughtException', (err) => {
            t.ok(amqpChannel.ack.notCalled, 'AMQP ACK not called');
            t.ok(amqpChannel.nack.firstCall.calledWith(ANY, ANY, AMQP_NACK_REQUEUE), 'AMQP NACK (requeue)');
            t.ok(amqpChannel.nack.calledOnce, 'AMQP NACK called once');
            t.equal(err.constructor.name, 'RedisError', 'Throws uncaught exception \'RedisError\' after NACK');
            next(t);
        });

        queue(validTask());
    });

    group.test('teardown', (t) => {
        server.on('close', t.end);
        server.close();
    });
});
