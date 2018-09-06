const net = require('./net')
const emailService = require('./emailService')
const auth = require('basic-auth')
const credential = require('credential')
const asyncHandler = require('express-async-handler')
const { randomBytes } = require('crypto')

const DEBUG = true;
const KEY_BACKUP_SERVICE_PATHNAME_PREFIX = process.env.KEY_BACKUP_SERVICE_PATHNAME_PREFIX || '';

module.exports = function( express, s3 ) {
    var router = express.Router();

    // simple status page, also used for server health
    const runningSince = new Date();
    router.get( '/status', function(req,res) {
         res.json({ name:'Key Backup Service', version:[1,0,0], started:runningSince, url:controllerBaseUrl(req) }); 
    });

    // create new account
    // body is { email:, password: }
    router.post( '/accounts', asyncHandler( async (req, res, next) => {
        const params = req.body;
        if( !params || !params.email || !params.password )
            return net.signalNotOk(req,res,[4],'Missing parameters');

        let email = clean(params.email);
        let password = clean(params.password);
        if( !email || !password )
            return net.signalNotOk(req,res,[4],'Missing parameters');

        // Does this email already exist?
        const user = await fetchUser(email);
        if( user )
            return net.signalNotOk(req,res,[4,9],'Email already registered; Reset password or try another email');

        let hash = await hashPassword(password);
        await saveUser(email,{ password_hash: hash });

        res.json({});
    }));

    router.get( '/personas', asyncHandler( async (req, res, next) => {
        if( await verifyAuthentication(req,res) == false )
            return;

        const prefix = escapeEmail(req.user.email) + '/personas';
        const files = await listFiles( prefix );

        const filenames = files.Contents.reduce( (result,e) => {
            let name = e.Key.split('/')[2];
            result.push( name );
            return result;
        }, [] );
        res.json({personas:filenames});
    }));

    router.post( '/personas/:pid', asyncHandler( async (req, res, next) => {
        if( await verifyAuthentication(req,res) == false )
            return;

        const filename = req.params.pid;
        if( filename.indexOf('/') > -1 )
            return net.signalNotOk(req,res,[4],'Invalid persona id: ' + filename );

        let media = req.body;
        if( !media || media.length == 0 )
            return net.signalNotOk(req,res,[4],'Missing required content' );
        if( !req.headers['content-type'] )
            return net.signalNotOk(req,res,[4],'Missing required header: content-type' );

        // if it's JSON, convert back to string
        if( typeof media === 'object' && req.headers['content-type'] === 'application/json' ) {
            media = JSON.stringify( media, null, 4 );   // might as well make it pretty
        }

        let options = {
            metadata: {},
            contentType: req.headers['content-type']
        };

        let fullpath = escapeEmail( req.user.email ) + '/personas/' + filename;
        await saveFile(fullpath,media,options);

        res.json({});
    }));

    router.get( '/personas/:pid', asyncHandler( async (req, res, next) => {
        if( await verifyAuthentication(req,res) == false )
            return;

        const filename = req.params.pid;
        if( filename.indexOf('/') > -1 )
            return net.signalNotOk(req,res,[4],'Invalid persona id: ' + filename );

        let fullpath = escapeEmail( req.user.email ) + '/personas/' + filename;
        const result = await fetchFile(fullpath);
        if( !result )
            res.status(410).send('Persona not found');
        else
            sendMedia(req,res,result);
    }));

    router.delete( '/personas/:pid', asyncHandler( async (req, res, next) => {
        if( await verifyAuthentication(req,res) == false )
            return;

        const filename = req.params.pid;
        if( filename.indexOf('/') > -1 )
            return net.signalNotOk(req,res,[4],'Invalid persona id: ' + filename );

        let fullpaths = [ escapeEmail( req.user.email ) + '/personas/' + filename ];
        await deleteFiles(fullpaths);

        res.json({});
    }));

    // for easier browser testing, but prefer to use the PUT variant below
    router.get( '/password/reset/:email', asyncHandler( async (req, res, next) => {
        let email = clean(req.params.email);
        if( !email )
            net.signalNotOk(req,res,[4],'Missing email parameter');
        else
            await sendPasswordResetEmail(req,res,email);
    }));

    // body { email: }
    router.put( '/password/reset', asyncHandler( async (req, res, next) => {
        const params = req.body;
        if( !params )
            return net.signalNotOk(req,res,[4],'Missing parameters');

        let email = clean(params.email);
        if( !email )
            net.signalNotOk(req,res,[4],'Missing email parameter');
        else
            await sendPasswordResetEmail(req,res,email);
    }));

    async function sendPasswordResetEmail(req,res,email) {

        // Does this email already exist?
        const user = await fetchUser(email);
        if( !user ) {
            console.log( 'NOT sending password reset email; email not found:', email );
            return res.json({});    // silently return to avoid email fishing
        }

        // generate the reset code and save
        let reset_code = randomBytes(32).toString('hex');
        user.reset_code = reset_code;
        await saveUser(email,user);

        // send email
        const link = baseUrl(req) + '/password/reset.html?email=' + encodeURIComponent( email ) + '&reset_code=' + encodeURIComponent( reset_code );
        await emailService.sendPasswordResetEmail(email,link);

        res.json({});
    };

    // body { email:, reset_code:, password: }
    router.post( '/password/reset', asyncHandler( async (req, res, next) => {
        const params = req.body;
        if( !params )
            return net.signalNotOk(req,res,[4],'Missing parameters');

        let email = clean(params.email);
        if( !email )
            return net.signalNotOk(req,res,[4],'Empty email parameter');

        let code = clean(params.reset_code);
        if( !code )
            return net.signalNotOk(req,res,[4],'Empty reset code parameter');

        let password = clean(params.password);
        if( !password )
            return net.signalNotOk(req,res,[4],'Empty password parameter');

        const user = await fetchUser(email);
        if( !user )
            return net.signalNotOk(req,res,[4,10],'Invalid email - account not registered with this service');
        if( user.reset_code != code )
            return net.signalNotOk(req,res,[4,10],'Invalid reset code, please request another');

        // update password hash and clear reset_code, then save
        let hash = await hashPassword(password);
        user.password_hash = hash;
        delete user.reset_code;
        await saveUser(email,user);

        res.json({});
    }));

    console.log( 'Controller API routes are ready' );
    return router;

    //
    // Util
    //

    function baseUrl(req) {
        //const protocol = process.env.PERSONAS_CONTROLLER_PROTOCOL || req.protocol;
        return req.protocol + "://" + req.get('host');
    }

    function clean(s) {
        if( !s )
            return null;
        if( s instanceof String != true )
            return s;   // simply return it back
        s = s.trim();
        return s.length == 0 ? false : s;
    }

    function send401(res) {
        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="Key Backup Service"')
        res.end('Access denied')   
    }

    // .then(true) on success, req.user.email is set
    // .then(false) on failure, HTTP 401 is sent
    async function verifyAuthentication(req,res) {
        console.log( 'verifyAuthentication()', req.headers );
        const credentials = auth(req);
        if( !credentials ) {
            send401(res);
            return false;
        }

        let email = clean(credentials.name);
        let password = clean(credentials.pass);
        if( !email || !password ) {
            send401(res);
            return false;    
        }

        // email is always assumed all lower case
        email = email.toLowerCase();
        const user = await fetchUser(email);
        if( !user ) {
            // unrecognized account
            send401(res);
            return false;    
        }

        // does password match?
        const isValid = await verifyPassword(user.password_hash,password);
        if( isValid ) {
            req.user = { email: email };
            return true;
        }

        send401(res);
        return false;  
    }

    // Write S3 media result to HTTP response
    function sendMedia( req, res, mediaResult ) {
        if( mediaResult.media.length == 0 ) {
            res.status(204).end();  // its ok to have no content
        } else {
            let metadata = mediaResult.metadata;
            if( metadata ) {
                Object.keys(metadata).forEach( name => {
                    res.setHeader( name, metadata[name] );
                });
            }

            res.setHeader('Content-Type',mediaResult.contentType);
            res.write( mediaResult.media );
            res.end();  
        }
    }

    function escapeEmail(email) {
        return email.split('@').reduce( (result,e) => 
            result + (result && result.length ? '@' : '') + encodeURIComponent(e)
        );
    }

    // .then()
    async function saveUser(email,user) {
        let media = JSON.stringify(user,null,4);
        let options = {
            contentType: 'application/json'
        };

        let fullpath = escapeEmail(email) + '/user.json';
        await saveFile(fullpath,media,options);
    }

    // .then(null) == user doesnt exist
    // .then(user) { password_hash: ... }
    async function fetchUser(email) {
        // Yep, it's slow fetching from S3...
        let path = escapeEmail(email) + '/user.json';
        const result = await fetchFile(path);
        return result ? JSON.parse( result.media ) : null;
    }

    //
    // Promise wrappers
    //

    // .then({files:[]})
    function listFiles(prefix) {
        return new Promise((resolve, reject) => {
            s3.listMedia(prefix,(err,result) => {
                if(err)
                    reject(err);
                else
                    resolve(result);
            });
        });
    }

    // .then()
    function saveFile(fullpath,file,options) {
        return new Promise((resolve, reject) => {
            s3.saveMedia(fullpath,file,options,(err,result) => {
                if(err)
                    reject(err);
                else
                    resolve();
            });
        });
    }

    // .then(null) == file doesnt exist
    // .then(result) { media: ... } 
    function fetchFile(fullpath) {
        return new Promise((resolve, reject) => {
            s3.fetchMedia(fullpath,(err,result) => {
                if(err) {
                    if( err.statusCode == 404 )
                        resolve(null);  // nothing found, but it's ok
                    else
                        reject(err);    // real error
                } else {
                    resolve(result);
                }
            }); 
        });  
    }

    // .then(null) == file doesnt exist
    // .then(result) { media: ... } 
    function deleteFiles(fullpaths) {
        return new Promise((resolve, reject) => {
            s3.deleteMedia(fullpaths,(err,result) => {
                if(err)
                    reject(err);    // real error
                else
                    resolve(result);
            }); 
        });  
    }

    // .then(hash)
    // .catch(err)
    function hashPassword(password) {
        return new Promise((resolve, reject) => {
            let pw = credential();
             
            pw.hash(password, function (err, hash) {
                if(err)
                    reject(err);
                else 
                    resolve( JSON.parse( hash ) );
            });
        });
    }

    // .then(isValid)
    // .catch(err)
    function verifyPassword(hash,password) {
        return new Promise((resolve, reject) => {
            let pw = credential()
            hash = JSON.stringify( hash );  // convert to string as required 
            pw.verify( hash, password, function (err, isValid) {
                if(err)
                    reject(err);
                else
                    resolve(isValid);
            });    
        });
    }
}