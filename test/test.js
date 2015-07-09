'use strict';

var partialtongue = require('../index')();

partialtongue(process.argv.length > 2 ? __dirname+'/'+process.argv[2] : null)
.on('error', function (err) {
    console.error(err);
})
.on('end', function () {
    console.error('done');
})
.pipe(process.stdout);
