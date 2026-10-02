'use strict';
/* ExtendScript in After Effects 2020 is ES3 + a few extras. Parse every jsx/*.jsx as ES3 (needs the dev-only `acorn`
 * package; skipped when it is not installed) and reject ES5+ library calls that ExtendScript does not have. */
var fs = require('fs'), path = require('path'), assert = require('assert'), acorn = null;
try { acorn = require('acorn'); } catch (e) { acorn = null; }
var dir = path.join(__dirname, '..', 'jsx');
var FORBIDDEN = [[/\.forEach\s*\(/, 'Array.forEach'], [/\.map\s*\(/, 'Array.map'], [/\.filter\s*\(/, 'Array.filter'], [/\.some\s*\(/, 'Array.some'],
    [/\.every\s*\(/, 'Array.every'], [/\.reduce\s*\(/, 'Array.reduce'], [/Object\.keys/, 'Object.keys'], [/\bJSON\./, 'native JSON'], [/\bArray\.isArray/, 'Array.isArray'],
    [/\.trim\s*\(/, 'String.trim'], [/\bconst\s/, 'const'], [/\blet\s/, 'let'], [/=>/, 'arrow function'], [/`/, 'template string'], [/\.indexOf\s*\(\s*[a-z]+\[/, 'Array.indexOf']];
function strip(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1').replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''"); }
fs.readdirSync(dir).filter(function (f) { return /\.jsx$/.test(f); }).forEach(function (f) {
    var src = fs.readFileSync(path.join(dir, f), 'utf8');
    test('ES3 syntax: jsx/' + f, function () {
        if (!acorn) skip('acorn not installed (npm i acorn --no-save)');
        acorn.parse(src, { ecmaVersion: 3, allowReserved: true });
    });
    test('no ES5+ library calls: jsx/' + f, function () {
        var code = strip(src);
        FORBIDDEN.forEach(function (r) { assert.ok(!r[0].test(code), f + ' uses ' + r[1]); });
    });
});
