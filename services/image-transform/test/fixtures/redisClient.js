const sinon = require('sinon');

let counter = 0;


const redisClient = {
    select() {},
    on() {},
    hincrbyfloat: sinon.stub(),
    hdel: sinon.stub(),
    resetStub() {
        initHincrbyfloatStub();
    },
};

function initHincrbyfloatStub() {
    counter = 0;
    redisClient.hincrbyfloat.reset();
    redisClient.hincrbyfloat.callsFake((key, taskId, incrBy, callback) => {
        counter += incrBy;
        callback(null, counter);
    });
}

initHincrbyfloatStub();

module.exports = { redisClient };
