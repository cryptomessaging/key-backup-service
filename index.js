//
// Startup file for Node servers
// (For Lambda, see lambda.js)
//

// On multicore machines, fire up more than one worker
const cluster = require('cluster');
if(false && cluster.isMaster) {
    const numWorkers = require('os').cpus().length;
    console.log('Master cluster setting up', numWorkers, 'workers...');

    for(var i = 0; i < numWorkers; i++) {
        cluster.fork();
    }

    cluster.on('online', function(worker) {
        console.log('Worker', worker.process.pid, 'is online');
    });

    cluster.on('exit', function(worker, code, signal) {
        console.log( 'Worker', worker.process.pid, 'died with code:', code, 'and signal:', signal );
        console.log( 'Starting a new worker' );
        cluster.fork();
    });

    return;
}

const app = require('./app')

// enable logging
app.use(require('morgan')('combined'));

const port = process.env.PORT || 3032
app.listen(port, () => 
    console.log(`Key Backup Server is listening on port ${port}`)
)