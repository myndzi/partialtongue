'use strict';

var partialtongue = require('../index');

partialtongue(__dirname+'/'+process.argv[2])(function (err) {
    if (err) { console.error(err); }
    else { console.error('done'); }
});
