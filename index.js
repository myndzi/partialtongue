'use strict';

var fs = require('fs'),
    PATH = require('path'),
    inspect = require('util').inspect,
    inherits = require('util').inherits,
    Readable = require('stream').Readable,
    Transform = require('stream').Transform,
    PassThrough = require('stream').PassThrough,
    SpliceStream = require('streams2-splice');

var debug;
try {
    debug = require('debug')('partialtongue');
} catch (e) {
    debug = function () { };
}

var resolve = (function () {
    var resolveFilename = module.constructor._resolveFilename;
    return function (request, dir) {
        debug('Resolving module "%s" from %s', request, dir);
        return resolveFilename(request, {
            paths: [ dir + '/node_modules' ]
        });
    };
})();

module.exports = function (opts) {
    opts = opts || { };
    opts.start = opts.start || '<!--';
    opts.end = opts.end || '-->';
    
    debug('Instantiated with options:', opts);
    
    function Registry() {
        this.data = { };
    }
    Registry.getKey = function (path, name) {
        if (name === null) {
            return 'stream:'+path;
        } else {
            return 'file:'+path+'/'+name;
        }
    };
    Registry.prototype.store = function (path, name, data) {
        if (arguments.length === 2) {
            data = name;
            name = PATH.basename(path);
            path = PATH.dirname(path);
        }

        var key = Registry.getKey(path, name);
        if (key in this.data) { throw new Error('Registry.store: duplicate key: ' + key); }
        this.data[Registry.getKey(path, name)] = data;
    };
    Registry.prototype.get = function (path, name) {
        if (arguments.length === 1) {
            name = PATH.basename(path);
            path = PATH.dirname(path);
        }

        var key = Registry.getKey(path, name);
        if (!(key in this.data)) { return null; }
        return this.data[key];
    };
    
    var EXPORTS = new Registry();
    
    function PTStream(inStream, baseDir, fileName) {
        Transform.call(this);
        
        if (arguments.length === 2) {
            this.baseDir = PATH.resolve(baseDir);
            this.fileName = PATH.basename(this.baseDir);
            this.baseDir = PATH.dirname(this.baseDir);
        } else if (typeof fileName === 'string') {
            this.baseDir = baseDir;
            this.fileName = fileName;
        } else {
            this.baseDir = PATH.resolve(baseDir);
            this.fileName = null;
        }
        var key = Registry.getKey(this.baseDir, this.fileName);
        
        if (EXPORTS.get(this.baseDir, this.fileName)) {
            throw new Error('Circular import: ' + key);
        }
        
        this.exports = { };
        
        debug('new PTStream(): baseDir: %s, fileName: %s', this.baseDir, this.fileName);
        
        EXPORTS.store(this.baseDir, this.fileName, this);
        
        this.chunks = [ ];
        this.capturing = '';
        this.data = new Buffer(0);
        
        var ss = new SpliceStream(opts.start, opts.end, this.readToken.bind(this));
        inStream.pipe(ss).pipe(this);
    }
    inherits(PTStream, Transform);
    
    PTStream.prototype.resolvePath = function (str) {
        var matches = str.match(/^(.*?):(.*)$/), path, pkgDir;
        if (!matches) {
            path = PATH.resolve(this.baseDir, str);
        } else {
            try {
                pkgDir = PATH.dirname(resolve(matches[1], this.baseDir));
            } catch (e) {
                this.emit('error', e);
                return;
            }
            path = PATH.resolve(pkgDir, matches[2]);
        }
        
        debug('PTStream.resolvePath: %s -> %s', str, path);
        return path;
    };
    
    PTStream.prototype._transform = function (chunk, encoding, callback) {
        // store complete file data for wholesale inclusion
        this.data = Buffer.concat([ this.data, chunk ]);
        
        // conditionally store partial file data for inclusion by reference
        if (this.capturing) {
            this.chunks.push(chunk);
        }
        
        // pass along output
        this.push(chunk);
        callback();
    };
    PTStream.prototype.capture = function (name) {
        if (this.capturing) {
            this.stopCapture();
        }
        
        if (!name) { throw new Error('PTStream.capture: Invalid capture name: ' + name); }
        if (name in this.exports) { throw new Error('PTSTream.capture: Duplicate capture name: ' + name); }
        
        this.capturing = name;
        this.chunks.length = 0;
    };
    PTStream.prototype.stopCapture = function () {
        if (!this.capturing) { throw new Error('PTStream.stopCapture: not capturing'); }
        
        var str = Buffer.concat(this.chunks).toString();
        str = str.replace(/^[\s\r\n]*((?:.|\r|\n)*?)[\s\r\n]*$/, '$1');
        
        this.storeExport(this.capturing, str);
        this.capturing = '';
        this.chunks.length = 0;
    };
    PTStream.prototype.storeExport = function (ref, data) {
        debug('Storing export "%s": %s', ref, inspect(data));
        if (ref in this.exports) {
            this.emit('error', new Error('Duplicate ref: "'+ref+'"'));
        } else {
            this.exports[ref] = data;
        }
    };
    PTStream.prototype.readToken = function (stream) {
        var chunks = [ ], pt = new PassThrough();
        
        stream.on('data', chunks.push.bind(chunks))
        stream.on('error', function (err) {
            debug('PTStream.readToken error:', err);
        });
        stream.on('end', function () {
            var buf = Buffer.concat(chunks),
                str = buf.toString();
            
            chunks.length = 0;
            
            var replace = this.directive(str);
            
            if (replace instanceof Readable) {
                debug('PTStream.readToken: piping stream');
                replace.pipe(pt);
            } else {
                if (replace === null) { // ignore unrecognized directive
                    debug('PTStream.readToken: ignoring');
                    
                    pt.write(opts.start);
                    pt.write(buf);
                    pt.write(opts.end);
                } else if (typeof replace === 'string' || Buffer.isBuffer(replace)) {
                    debug('PTStream.readToken: replacing data');
                    pt.write(replace);
                } else if (replace === void 0) {
                    // empty replacement
                } else {
                    this.emit('error', new Error('Invalid replacement: ' + typeof replace));
                }
                pt.end();
            }
        }.bind(this));
        
        return pt;
    };
    PTStream.prototype.directive = function (str) {
        debug('PTStream.directive:', inspect(str));
        
        var split, lastArg;
        if (/\n/.test(str)) {
            split = str.split('\n');
            str = split.shift();
            lastArg = split.join('\n');
        }
        
        str = str.replace(/^[\s\r\n]*(.*?)[\s\r\n]*$/, '$1');

        var matches = str.match(/^pt:(.+)/);
        if (!matches) { return null; }

        var args = matches[1].split(' '),
            cmd = 'dir_'+args.shift();
        
        if (lastArg) { args.push(lastArg); }
        
        debug('Got directive: %s (%s)', cmd, args.map(inspect).join(', '));
        
        if (typeof this[cmd] !== 'function') {
            debug('PTStream.directive: no such command: ' + cmd);
            return;
        } else {
            return this[cmd].apply(this, args);
        }
    };
    PTStream.prototype.dir_import = function (arg1, arg2) {
        var path, stream, ptStream;
        
        if (arguments.length === 1) {
            return this.dir_import1(arg1);
        } else if (arguments.length === 2) {
            return this.dir_import2(arg1, arg2);
        } else {
            var i = arguments.length, args = new Array(i);
            while (i--) { args[i] = arguments[i]; }
            
            this.emit('error', new Error('PTStream.dir_import: invalid arguments: '+args));
            return;
        }
    };
    PTStream.prototype.dir_import1 = function (arg1) {
        debug('PTStream.dir_import1('+arg1+')');
        
        // check for local reference
        if (arg1 in this.exports) {
            return this.exports[arg1];
        }
        
        // check for file
        var path = this.resolvePath(arg1), stream;
        try {
            stream = fs.createReadStream(path);
        } catch (e) {
            this.emit('error', new Error('PTStream.dir_import1: invalid reference (ref "'+arg1+'" doesn\'t exist)'));
            return;
        }
        
        // have we already loaded this file?
        if (EXPORTS.get(path)) {
            // the whole file contents are stored when reading a file; in most cases
            // interpolation blocks on the complete processing of a file, so we can
            // rely on the .data property containing everything
            // the exception is circular references, which are impossible to resolve
            // in these cases, .data will contain only up to the "blocked" portion
            // of the file. This behavior may not be what's expected, but it's the
            // best that can be done
            
            return EXPORTS.get(path).data;
        }
        
        // insert entire file with processing
        return new PTStream(stream, path);
    };
    PTStream.prototype.dir_import2 = function (arg1, arg2) {
        debug('PTStream.dir_import2('+arg1+', '+arg2+')');
        
        var path = this.resolvePath(arg1), stream;
        
        // have we already loaded/scanned this file?
        if (EXPORTS.get(path)) {
            // does the reference exist?
            if (arg2 in EXPORTS.get(path).exports) {
                return EXPORTS.get(path).exports[arg2];
            }
            // fail
            this.emit('error', new Error('PTStream.dir_import2: invalid reference (ref "'+arg2+'" doesn\'t exist)'));
            return;
        }
        
        // have to load the file; first check if it exists
        try {
            stream = fs.createReadStream(path);
        } catch (e) {
            // nope
            this.emit('error', new Error('PTStream.dir_import2: invalid reference ('+e.code+')'));
            return;
        }
        
        // create a dummy stream to defer our data
        var pt = new PassThrough();
        
        // load the file
        debug('PTStream.dir_import2: loading %s', path);
        var ptStream = new PTStream(stream, path);
        
        var _finish = function (err) {
            ptStream.removeListener('error', _finish);
            ptStream.removeListener('end', _finish);
            
            if (err) {
                debug('PTStream.dir_import2: error', err);
                this.emit('error', err);
                pt.end();
                return;
            }
            
            debug('PTStream.dir_import2: finished');
            
            // our reference should exist now; call ourselves recursively to avoid repeating code
            var result = this.dir_import2(arg1, arg2);
            pt.end(result);
        }.bind(this);
        
        ptStream.on('error', _finish);
        ptStream.on('end', _finish);
        
        // enter flowing mode; we're not doing anything with the data, just reading in directives
        ptStream.resume();
        
        return pt;
    };
    PTStream.prototype.dir_export = function (arg1, arg2) {
        if (arguments.length === 1) {
            // delimited data
            this.capture(arg1);
        } else if (arguments.length === 2) {
            this.storeExport(arg1, arg2);
        }
    };
    PTStream.prototype.dir_end = function () {
        this.stopCapture();
    };
    
    return function (inStream, inDir, inFile) {
        var i = arguments.length, args = new Array(i);
        while (i--) { args[i] = arguments[i]; }
        
        if (arguments.length < 2) {
            throw new Error('partialtongue: Invalid arguments: ' + arguments.map(inspect).join(', '));
        }
        if (!(inStream instanceof Readable)) {
            throw new Error('partialtongue: inStream must be a readable stream');
        }
        if (typeof inDir !== 'string') {
            throw new Error('partialtongue: invalid source dir: ' + inDir);
        }
        
        debug('partialtongue(<stream>, %s)', args.slice(1).map(inspect).join(', '));
        
        if (args.length === 2) {
            inFile = PATH.basename(inDir);
            inDir = PATH.dirname(inDir);
        } else if (typeof inFile !== 'string') {
            inFile = null;
        }
        
        return new PTStream(inStream, inDir, inFile);
    };
};
