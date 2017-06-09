const AmqpClient = require('./lib/AmqpClient');

function createClient(options, cb) {
    return new AmqpClient(options, cb);
}

module.exports = {
    AmqpClient,
    createClient,
};
