const sinon = require('sinon');

const amqpChannel = {
    assertQueue() {},
    prefetch() {},
    consume() {},
    nack: sinon.stub(),
    ack: sinon.stub(),
    resetStub() {
        amqpChannel.nack.reset();
        amqpChannel.ack.reset();
    },
};

const amqpConnection = {
    createChannel: sinon.stub().resolves(amqpChannel),
    once() {},
};

module.exports = { amqpConnection, amqpChannel };
