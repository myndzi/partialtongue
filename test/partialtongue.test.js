'use strict';

require('should');

var factory = require('../index');

var fs = require('fs'),
    PATH = require('path');

function test(path, opts, cb) {
    if (typeof opts === 'function') {
        cb = opts;
        opts = { };
    }
    
    var partialtongue = factory(opts);
    
    path = PATH.resolve(__dirname, path);
    
    var dir = PATH.dirname(path),
        file = PATH.basename(path);
    
    var inStream = fs.createReadStream(path);
    
    var stream = partialtongue(inStream, dir, file);
    
    var chunks = [ ],
        _pushChunk = chunks.push.bind(chunks);
    
    stream.on('data', _pushChunk);
    stream.on('error', _finish);
    stream.on('end', _finish);
    
    function _finish(err) {
        stream.removeListener('data', _pushChunk);
        stream.removeListener('error', _finish);
        stream.removeListener('end', _finish);
        
        if (err) { cb(err); }
        else { cb(null, Buffer.concat(chunks).toString()); }
        
        chunks.length = 0;
    }
}

describe('Partialtongue', function () {
    it('should not alter files with no special contents', function (done) {
        test('test0.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('nothing special\n');
            done();
        });
    });
    it('should not alter matching delimiters without matching directives', function (done) {
        test('test1.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('<!--ignored-->\n');
            done();
        });
    });
    it('should consume matching delimiters with unknown directives', function (done) {
        test('test4.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('ab\n');
            done();
        });
    });
    it('should support inline export/local import', function (done) {
        test('test2.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('bar\n[pt:export foo\nbar][pt:import foo]\n');
            done();
        });
    });
    it('should support delimited exports', function (done) {
        test('test10.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('\ndelimited reference\n\n\ndelimited reference\n\n');
            done();
        });
    });
    it('should support alternate delimiters', function (done) {
        test('test2.pt', {
            start: '[',
            end: ']'
        }, function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('<!--pt:export foo\nbar--><!--pt:import foo-->\nbar\n');
            done();
        });
    });
    it('should support alternate prefixes', function (done) {
        test('test5.pt', {
            prefix: '#'
        }, function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('<!--export foo\nbar--><!--import foo-->\nbar\n');
            done();
        });
    });
    it('should support empty prefixes', function (done) {
        test('test5.pt', {
            prefix: ''
        }, function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('bar\n\n');
            done();
        });
    });
    it('should support imports from other files', function (done) {
        test('test3.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('bar\n');
            done();
        });
    });
    it('should support importing an entire file', function (done) {
        test('test6.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('nothing special\n\n');
            done();
        });
    });
    it('should process file imports (in-file references only)', function (done) {
        test('test7.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('bar\n[pt:export foo\nbar][pt:import foo]\n\n');
            done();
        });
    });
    it('should process file imports (with external file references)', function (done) {
        test('test8.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('bar\n\n');
            done();
        });
    });
    it('should use the file\'s directory as the relative path base', function (done) {
        test('subdir/one.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('foo\n\n');
            done();
        });
    });
    it('should support module:file inclusion', function (done) {
        test('test9.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('# README\n\n\n### Section\n\nHi\n\n\n');
            done();
        });
    });
    it('should support module:file references', function (done) {
        test('test11.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('\n### Section\n\nHi\n\n');
            done();
        });
    });
    it('should support relative module:file inclusion', function (done) {
        test('test12.pt', function (err, res) {
            if (err) { return done(err); }
            
            res.should.equal('keke\n\n');
            done();
        });
    });
});
