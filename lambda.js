'use strict'

const awsServerlessExpress = require('aws-serverless-express')
const app = require('./app')
const binaryMimeTypes = [
    'application/octet-stream',
    'application/zip',
];

const server = awsServerlessExpress.createServer(app, null, binaryMimeTypes);
exports.handler = (event, context, callback ) => {
    // ugh
    context.callbackWaitsForEmptyEventLoop = false;

    awsServerlessExpress.proxy(server, event, context, 'PROMISE')
    .promise
    .then( r2 => {
        console.log( 'then()', typeof r2, r2.body ? r2.body.length : 'none', r2.headers );
        callback( null, r2 );
    }).catch( err => {
        console.log('catch()', err );
        callback(err);
    });
}