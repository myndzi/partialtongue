'use strict';

var fs = require('fs'),
    PATH = require('path'),
    PassThrough = require('stream').PassThrough,
    SpliceStream = require('streams2-splice');

var debug = require('debug')('partialtongue');

var resolve = (function () {
    var resolveFilename = module.constructor._resolveFilename;
    return function (request, dir) {
        return resolveFilename(request, {
            paths: [ dir + '/node_modules' ]
        });
    };
})();

module.exports = function (inFile, outFile, opts) {
    opts = opts || { };
    opts.start = opts.start || '<!--';
    opts.end = opts.end || '-->';
    
    inFile = PATH.resolve(inFile);
    
    var exports = { };
    
    function partialtongue(cb) {
        opts = opts || { };

        var ss = new SpliceStream(opts.start, opts.end, processFile.bind(null, inFile));
        var inStream = fs.createReadStream(inFile);
        var outStream = outFile ? fs.createWriteStream(outFile) : process.stdout;

        inStream.pipe(ss).pipe(outStream)
        .on('error', function (err) { cb(err); })
        .on('end', function () { cb(); });
    }
    function processFile(file, stream) {
        debug('Processing %s', file);
        var pt = new PassThrough();
        
        var buf = new Buffer(0), pos = 0, foundSomething = false;
        
        stream.on('data', seekDirective);
        stream.on('error', finish);
        stream.on('end', _onend);
        pt.on('error', function (err) {
            stream.emit('error', err);
            pt.end();
        });
        
        // accumulate data until we find a newline or the stream ends
        function seekDirective(chunk) {
            buf = Buffer.concat([ buf, chunk ]);
            for (; pos < buf.length; pos++) {
                if (buf[pos] === 0x0A) {
                    debug('Found directive by newline');
                    processDirective(buf.slice(0, pos).toString());
                    return;
                }
            }
        }
        function _onend() {
            if (!foundSomething) {
                debug('Found directive by implication');
                processDirective(buf.toString(), true);
            }
            finish();
        }
        function finish(err) {
            debug('Wrapping up return stream');
            stream.removeListener('data', seekDirective);
            stream.removeListener('error', finish);
            stream.removeListener('end', _onend);
            if (err) { pt.emit('error', err); }
        }
        
        function processDirective(directive, ended) {
            debug('Got directive: %s', directive);
            foundSomething = true;
            stream.removeListener('data', seekDirective);
            
            var parts = directive.split(' ');
            switch (parts.shift()) {
                case 'import':
                    if (!parts.length) {
                        pt.emit('error', new Error('Invalid import directive: '+parts[0]));
                        break;
                    }
                    
                    var match = parts[0].match(/^([^:]+)(?::(.*))?$/);
                    var pkg, path, name;
                    
                    if (!match) {
                        pt.emit('error', new Error('Invalid import directive: '+parts[0]));
                        break;
                    }
                    
                    if (match[2]) {
                        pkg = match[1];
                        path = match[2];
                    } else {
                        pkg = null;
                        path = match[1];
                    }
                    name = parts[1] || null;
                    
                    if (exports[path] && exports[path][name] && !Buffer.isBuffer(exports[path][name])) {
                        pt.emit('error', new Error('Incomplete export: ' + pkg + ':' + path + ':' + name));
                        break;
                    }
                    
                    insertData(pt, pkg, path, name)
                return;

                case 'export':
                    if (!parts.length) {
                        pt.emit('error', new Error('Invalid export directive: '+parts[0]));
                        break;
                    }
                    if (!exports[file]) { exports[file] = { }; }
                    if (exports[file][parts[0]]) {
                        pt.emit('error', new Error('Duplicate export: ' + file + ':' + name));
                        break;
                    }
                    
                    storeData(parts[0], ended);
                return;
            }
            
            ignoreData(ended);
        }
        
        function insertData(stream, pkg, path, name, shouldExist) {
            debug('Attempting to insert data (pkg=%s, path=%s, name=%s)', pkg, path, name);
            if (exports[path] && exports[path][name]) {
                stream.end(exports[path][name]);
                return;
            }
            if (shouldExist) {
                pt.emit('error', new Error('Can\'t locate export: ' + pkg + ':' + path + ':' + name));
            }
            
            try {
                var baseDir = PATH.dirname(file);
                if (pkg) {
                    debug('Looking for "%s" in %s', pkg, baseDir);
                    debug(resolve(pkg, baseDir));
                    baseDir = PATH.dirname(resolve(pkg, baseDir));
                }
                
                debug('baseDir: %s', baseDir);
                
                var inPath = PATH.resolve(baseDir, path);
                debug('Resolved pathname: %s', inPath);
                
                var inStream = fs.createReadStream(inPath);
                inStream.on('error', _tryLocalImport);
            } catch (e) {
                _tryLocalImport(e);
            }
            function _tryLocalImport(err) {
                debug(err.message);
                if (path !== null) {
                    debug('Trying local import');
                    insertData(stream, null, file, path, true);
                    return;
                }
                pt.emit('error', err);
            }
            
            if (!name) {
                inStream.pipe(stream);
                return;
            }
            
            var ss = new SpliceStream(opts.start, opts.end, processFile.bind(null, inPath));
            inStream.pipe(ss, processFile.bind(null, path))
            .on('end', function () {
                debug('Retrying insertData');
                insertData(stream, null, inPath, name, true);
            })
            .resume();
        }
        function storeData(name, ended) {
            debug('Attempting to store data (path=%s, name=%s)', file, name);
            var chunk = (pos+1 < buf.length ? buf.slice(pos+1) : buf);
            exports[file][name] = [ chunk ];
            
            if (ended) { _finish(); }
            else {
                stream.removeListener('data', seekDirective);
                stream.on('data', function (chunk) {
                    exports[file][name].push(chunk);
                });
                stream.on('error', _finish);
                stream.on('end', _finish);
            }
            function _finish(err) {
                if (err) {
                    debug('Error collecting data:', err);
                    pt.emit('error', err);
                } else {
                    debug('Finishing export: %s %s', file, name);
                    exports[file][name] = Buffer.concat(exports[file][name]);
                }
                pt.end();
            }
        }
        function ignoreData(ended) {
            debug('Ignoring data');
            
            pt.write(opts.start);
            pt.write(buf);
            
            if (ended) { _finish(); }
            else {
                stream.removeListener('data', seekDirective);
            
                stream.on('data', function (chunk) { pt.write(chunk); });
                stream.on('error', _finish);
                stream.on('end', _finish);
            }
            
            function _finish(err) {
                debug('ignoreData: on stream end');
                stream.removeListener('error', _finish);
                stream.removeListener('end', _finish);

                if (err) { pt.emit('error', err); }
                pt.end(opts.end);
            }
        }
        
        return pt;
    }
    
    return partialtongue;
};
