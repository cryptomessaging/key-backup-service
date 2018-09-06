'use strict'

global.DEBUG = true;
global.VERBOSE = true;

const path = require('path');
const express = require('express');
const app = express();

app.use( require('morgan')('combined'));

const bodyParser = require('body-parser');
app.use( bodyParser.json() );
app.use( bodyParser.urlencoded({ extended: false }) );
app.use( bodyParser.raw({ limit:'10mb', type:'*/*' }) );

// support static pages
app.use(express.static(path.join(__dirname, 'webpages'))); // /webpages --> /

// Connect to S3 and wire in some view routes for debugging
const bucket = process.env.KEY_BACKUP_S3_BUCKET || 'keybackups.cryptomessaging.org';
const s3 = require('./my_modules/namedS3').usingBucket(bucket);
app.use('/', require('./my_modules/routes')(express,s3));

module.exports = app;