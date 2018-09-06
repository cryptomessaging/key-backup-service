const S3 = require('aws-sdk/clients/s3');
const s3 = new S3({region: 'us-west-2'});

const DEBUG = false;

// For local development and light testing
const fs = require('fs');
const path = require('path');
const HOME_DIR = require('os').homedir();

exports.usingBucket = function(bucketName) {

    // i.e. $ export LOCAL_S3_SIMULATOR_DIR=~/s3simulator
    const simdir = process.env.LOCAL_S3_SIMULATOR_DIR;
    let localDir;
    if( simdir ) {
        localDir = path.resolve( HOME_DIR, simdir, bucketName );
        console.log( 'Simulating S3; Saving media files to', localDir );

        // make sure directory exists
        mkdirp(localDir,false);
    } else
        console.log( 'Using S3 media bucket', bucketName );

    return {
        bucketName: bucketName,
        localDir: localDir,

        // next(err)
        saveMedia: function(path,media,options,next) {
            let params = { Bucket:this.bucketName, Key:path, Body:media };
            if( options.metadata ) params.Metadata = options.metadata;
            if( options.contentType ) params.ContentType = options.contentType;

            if( this.localDir )
                localSave(localDir,params,next);
            else
                s3.putObject(params, next);
        },

        // next(err)
        fetchMedia: function(path,next) {
            let params = { Bucket:this.bucketName, Key:path };
            if( this.localDir )
                return localFetch(localDir,params,next);

            s3.getObject(params, function(err,data){
                if(err)
                    return next(err);

                let result = {media:data.Body};
                if(data.Metadata) result.metadata = data.Metadata;
                if(data.ContentType) result.contentType = data.ContentType;
                next(null,result);
            });
        },

        // next()
        listMedia: function(prefix,next) {
            const params = { Bucket:this.bucketName, Prefix:prefix };
            if( this.localDir )
                localList(localDir,params,next);
            else
                s3.listObjects(params, next );
        },

        // next()
        deleteMedia: function(keys,next) {
            console.log( 'deleteMedia', JSON.stringify(keys));
            if( !keys || keys.length == 0 )
                return next();

            if( this.localDir )
                return localDelete(this.localDir,keys,next);

            let objects = [];
            for( var i = 0; i < keys.length; i++ ) {
                objects.push({ Key:keys[i] });
            }

            const params = { Bucket:this.bucketName, Delete: { Objects:objects } };
            s3.deleteObjects( params, next );   
        }
    };
}

//
// Support local (light) testing
//

function localDelete( localDir, keys, next ) {
    for( var i = 0; i < keys.length; i++ ) {
        const filename = path.join(localDir,escapeCapitals(keys[i]));
        const metafile = filename + '.meta';

        if( DEBUG )
            console.log('localDelete()',keys[i],filename,metafile);

        if( fs.existsSync(metafile) )
            fs.unlinkSync(metafile);
        if( fs.existsSync(filename) ) {
            if( fs.statSync(filename).isDirectory() )
                rmdir( filename );
            else
                fs.unlinkSync(filename);
        }
    }

    next();
}

function rmdir(dir) {
    if( DEBUG )
        console.log( 'rmdir()', dir );

    const list = fs.readdirSync(dir);
    for(var i = 0; i < list.length; i++) {
        const filename = path.join(dir, list[i]);
        const stat = fs.statSync(filename);

        if(filename == "." || filename == "..") {
            // pass these files
        } else if(stat.isDirectory()) {
            // rmdir recursively
            rmdir(filename);
        } else {
            // rm fiilename
            fs.unlinkSync(filename);
        }
    }
    fs.rmdirSync(dir);
}

function mkdirp(full,isfile) {
    let parts = full.split(path.sep);
    let count = parts.length;
    if( isfile ) --count;   // for files, dont create last element
    for( var i = 2; i <= count; i++ ) {
        let sliced = parts.slice(1,i);
        let dir = path.sep + sliced.join(path.sep);
        if( !fs.existsSync( dir ) ) {
            console.log( 'Creating local directory', dir );
            fs.mkdirSync( dir );
        }
    }
}

function localSave( localDir, params, next ) {
    // write the body/media
    const filename = path.join(localDir,escapeCapitals(params.Key));
    mkdirp(filename,true);
    if( DEBUG )
        console.log( 'Saving media to',filename);
    fs.writeFile(filename,params.Body,function(err){
        if(err)
            return next(err);

        // write the metadata as JSON
        const metafile = filename + '.meta';
        delete params.Body;
        const json = JSON.stringify(params,null,4);
        if( DEBUG )
            console.log( 'Saving media metadata of',json,'to',metafile);

        fs.writeFile(metafile,json,next);
    });
}

function localFetch(localDir,params,next) {
    const filename = path.join(localDir,escapeCapitals(params.Key));
    const metafile = filename + '.meta';

    if( DEBUG )
        console.log( 'localGet', filename );

    if( !fs.existsSync(metafile) )
        return next({statusCode:404});
    if( !fs.existsSync(filename) )
        return next({statusCode:404});

    // load the metadata first
    /* <filename>.meta = {
        Metadata: {..},
        ContentType: "image/jpeg"
    } */
    fs.readFile(metafile,function(err,data){
        if(err) {
            if( DEBUG )
                console.log( 'FS error is',JSON.stringify(err));
            return next(err);
        }

        var meta = JSON.parse( data );
        if(meta.Metadata) {
            meta.metadata = meta.Metadata;
            delete meta.Metadata;
        }
        if(meta.ContentType) {
            meta.contentType = meta.ContentType;
            delete meta.ContentType;
        }
        if( DEBUG )
            console.log( 'Loaded media metadata',JSON.stringify(meta),'from',metafile);

        fs.readFile(filename,function(err,data){
            if(err)
                return next(err);

            meta.media = data;
            next(null,meta);
        });
    })
}

function localList(localDir,params,next) {
    const prefix = path.join(localDir,escapeCapitals(params.Prefix));

    let result = { Contents:[] };
    if( !fs.existsSync(prefix) )
        return next(null,result);   // non-existant directories are empty... right?!

    // is this a file?
    const stat = fs.statSync(prefix);
    if( stat.isFile() ) {
        result.Contents.push({ Key:params.Prefix});
        return next(null,result);
    }

    // TODO maybe? recurse
    // for now just one level deep
    fs.readdirSync( prefix ).forEach(function(name){
        const key = path.join( params.Prefix, unescapeCapitals( name ) );
        if( !key.endsWith('.meta') && !key.endsWith('.DS_Store') )
            result.Contents.push({ Key:key });
    });
    if( DEBUG ) console.log( 'localList()', JSON.stringify(result,null,'\t') );
    next(null,result);
}

function unescapeCapitals(filename) {
    return filename.replace('^','');
}

// to ensure case IN-sensitive filesystems work, escape upper case letters
// This was done for us Mac users ;)
function escapeCapitals(path) {
    let result = ''
    path.split('').forEach(function(c){
        if( c != c.toLowerCase() )
            result += '^';  // preceed uppers with a carot!
        result += c;
    });

    if( DEBUG ) console.log( 'Old path ', path, " is now ", result );
    return result;
}
