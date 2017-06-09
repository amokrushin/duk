```js
    const queue = new Queue();

    queue.on('success', [task], callback)

    queue.worker((task, ack, nack) => {

    });

    queue.wait(task, (task) => {
        if(task.success) {

        } else {

        }
    });
```