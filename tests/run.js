/* Zelf-Xtens | tests/run.js : zero-dependency runner.  node tests/run.js  */
'use strict';
var fs = require('fs'), path = require('path'), pending = [], failed = 0, passed = 0, skipped = 0;
global.test = function (name, fn) { pending.push({ name: name, fn: fn, file: global.__file }); };
global.skip = function (why) { var e = new Error(why); e.skip = true; throw e; };
fs.readdirSync(__dirname).filter(function (f) { return /\.test\.js$/.test(f); }).sort().forEach(function (f) { global.__file = f; require(path.join(__dirname, f)); });
var last = '';
(async function () {
    for (var i = 0; i < pending.length; i++) {
        var t = pending[i];
        if (t.file !== last) { console.log('\n' + t.file); last = t.file; }
        try { await t.fn(); passed++; console.log('  ok    ' + t.name); }
        catch (e) {
            if (e && e.skip) { skipped++; console.log('  skip  ' + t.name + ' (' + e.message + ')'); }
            else { failed++; console.log('  FAIL  ' + t.name + '\n        ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n        ')); }
        }
    }
    console.log('\n' + passed + ' passed, ' + failed + ' failed, ' + skipped + ' skipped');
    process.exit(failed ? 1 : 0);
})();
