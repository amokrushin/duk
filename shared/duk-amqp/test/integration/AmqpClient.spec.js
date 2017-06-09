const test = require('tape');
const AmqpClient = require('../../lib/AmqpClient');

const AMQP_URL = 'amqp://duk-rabbit';

function noop() {}

test('constructor', (t) => {
    t.equal(typeof AmqpClient, 'function', 'AmqpClient is function');
    t.equal(AmqpClient.name, 'AmqpClient', 'Constructor name match');
    t.doesNotThrow(() => {
        const amqpClient = new AmqpClient();
        amqpClient.on('error', noop);
        amqpClient.close((err) => {
            if (err) t.ifError(err);
            t.end();
        });
    }, 'Does not throw without options');
});


test('connection (ok)', (group) => {
    const amqpClient = new AmqpClient({ url: AMQP_URL });

    amqpClient.once('error', (err) => {
        group.fail(`AMQP error: ${err.message}`);
        group.end();
    });


    group.test('ready', (t) => {
        t.plan(1);
        amqpClient.once('ready', () => {
            t.pass('ready callback called');
        });
    });

    group.test('close', (t) => {
        t.plan(2);
        amqpClient.close(() => {
            t.pass('close callback called');
        });
        amqpClient.once('close', () => {
            t.pass('close event emitted');
        });
    });
});

test('sendToQueue', (group) => {
    const amqpClient = new AmqpClient({ url: AMQP_URL });

    amqpClient.once('error', (err) => {
        console.log(err);
        group.fail(`AMQP error: ${err.message}`);
        group.end();
    });

    group.test('assertQueue', (t) => {
        amqpClient.assertQueue('test', {}, (err) => {
            t.ifError(err);
            t.end();
        });
    });

    group.test('sendToQueue', (t) => {
        amqpClient.sendToQueue('test', Buffer.from('message'), (err) => {
            t.ifError(err);
        });
        t.end();
    });

    group.test('consume', (t) => {
        const consumer = amqpClient.consume('test', handler, (err) => {
            t.ifError(err);
        });

        function handler(message) {
            console.log('message', message);
            consumer.cancel();
            t.end();
        }
    });

    group.test('teardown', (t) => {
        t.plan(1);
        amqpClient.close(() => {
            t.pass('disconnected');
        });
    });
});


// test('teardown', (t) => {
//     rabbitmq.kill();
//     rabbitmq.on('close', (code) => {
//         t.equal(code, 0, 'rabbitmq process exited with code 0');
//         t.end();
//     });
// });

// process.once('SIGINT', () => {
//     rabbitmq.kill();
// });
// process.once('SIGTERM', () => {
//     rabbitmq.kill('SIGTERM');
// });
