'use strict';

require('should');

var fs = require('fs'),
    cli = require('../cli');

function makeOpts(obj2) {
    var obj = {
        _: [ ],
        start: '<!--',
        end: '-->',
        prefix: 'pt:',
        $0: 'cli',
        i: void 0,
        o: void 0
    };
    
    Object.keys(obj2).forEach(function (key) {
        obj[key] = obj2[key];
    });
    
    return obj;
}
var mockStream = { pipe: function (a) { return a; } };
function testCall(opts, cb) {
    return cli(makeOpts(opts), function () {
        return function () {
            cb.apply(null, arguments);
            return mockStream;
        };
    });
}
function testOpts(opts, cb) {
    cli(makeOpts(opts), function () {
        cb.apply(null, arguments);
        return function () {
            return mockStream;
        };
    });
}
function noop() { }

describe('CLI', function () {
    var hasProp = process.stdin.hasOwnProperty('isTTY'),
        isTTY = process.stdin.isTTY;
    
    beforeEach(function () {
        process.stdin.isTTY = false;
    });
    afterEach(function () {
        if (hasProp) { process.stdin.isTTY = isTTY; }
        else { delete process.stdin.isTTY; }
    });
    it('should default input to process.stdin', function () {
        testCall({ }, function (inStream) {
            inStream.should.equal(process.stdin);
        });
    });
    it('should accept an input file (-i)', function () {
        testCall({
            i: __filename
        }, function (inStream, inDir, inFile) {
            inDir.should.equal(__filename);
        });
    });
    it('should accept an input file (untagged)', function () {
        testCall({
            _: [__filename]
        }, function (inStream, inDir, inFile) {
            inDir.should.equal(__filename);
        });
    });
    it('should default output to process.stdout', function () {
        testCall({
            i: __filename
        }, noop)
        .should.equal(process.stdout);
    });
    it('should accept an output file (-o)', function () {
        testCall({
            i: __filename,
            o: __dirname + '/tmp'
        }, noop).end();
        fs.unlink(__dirname + '/tmp');
    });
    it('should accept \'start\' option', function () {
        testOpts({ start: 'foo' }, function (opts) {
            opts.start.should.equal('foo');
        });
    });
    it('should accept \'end\' option', function () {
        testOpts({ end: 'foo' }, function (opts) {
            opts.end.should.equal('foo');
        });
    });
    it('should accept \'prefix\' option', function () {
        testOpts({ prefix: 'foo' }, function (opts) {
            opts.prefix.should.equal('foo');
        });
    });
});
