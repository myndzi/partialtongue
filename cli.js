'use strict';

var yargs = require('yargs')
    .usage('Usage: $0 [options]')
    .describe('i', 'Input file')
    .alias('i', 'in')
    .nargs('i', 1)
    .describe('o', 'Output file')
    .alias('o', 'out')
    .nargs('o', 1)
    .default('start', '<!--')
    .describe('start', 'Starting delimiter')
    .nargs('start', 1)
    .default('end', '-->')
    .describe('end', 'Ending delimiter')
    .nargs('end', 1);
    
var argv = yargs.argv,
    inFile = argv.i || argv._[0] || null;

if (process.stdin.isTTY && inFile === null) {
    yargs.showHelp();
    process.exit(1);
}

var partialtongue = require('./index')({
    start: argv.start,
    end: argv.end
});

var fs = require('fs'),
    PATH = require('path');

var debug;
try {
    debug = require('debug')('partialtongue');
} catch (e) {
    debug = function () { };
}

var stream, file, outStream;

if (inFile) {
    file = PATH.resolve(process.cwd(), inFile);
    stream = partialtongue(fs.createReadStream(file), file);
    debug('Reading from file: %s', file);
} else {
    stream = partialtongue(process.stdin, process.cwd(), null);
    debug('Reading from stdin');
}

if (argv.o) {
    file = PATH.resolve(process.cwd(), argv.o);
    outStream = fs.createWriteStream(file);
    debug('Writing to file: %s', file);
} else {
    outStream = process.stdout;
    debug('Writing to stdout');
}

stream.pipe(outStream);
