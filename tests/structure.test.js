'use strict';
var fs = require('fs'), path = require('path'), assert = require('assert'), ROOT = path.join(__dirname, '..');
test('index.html loads every js/*.js exactly once, in dependency order, and every referenced file exists', function () {
    var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), refs = [], re = /<script src="([^"]+)"><\/script>/g, m;
    while ((m = re.exec(html))) refs.push(m[1]);
    fs.readdirSync(path.join(ROOT, 'js')).forEach(function (f) { assert.strictEqual(refs.filter(function (r) { return r === 'js/' + f; }).length, 1, f); });
    refs.forEach(function (r) { assert.ok(fs.existsSync(path.join(ROOT, r)), r); });
    function at(f) { return refs.indexOf('js/' + f); }
    assert.ok(at('ui.js') < at('graph-presets.js') && at('graph-presets.js') < at('graph.js') && at('graph.js') < at('app.js'));
});
test('version is the same in manifest, app.js and main.jsx', function () {
    var v = fs.readFileSync(path.join(ROOT, 'js/app.js'), 'utf8').match(/VERSION = '([\d.]+)'/)[1];
    assert.ok(fs.readFileSync(path.join(ROOT, 'jsx/main.jsx'), 'utf8').indexOf('VERSION: "' + v + '"') >= 0);
    var man = fs.readFileSync(path.join(ROOT, 'CSXS/manifest.xml'), 'utf8'); assert.ok(man.indexOf('ExtensionBundleVersion="' + v + '"') >= 0); assert.ok(man.indexOf('Id="com.zelfxtens.panel.main" Version="' + v + '"') >= 0);
});
test('no external dependencies: scripts, styles and fonts are all local', function () {
    var all = ['index.html', 'css/styles.css'].concat(fs.readdirSync(path.join(ROOT, 'js')).map(function (f) { return 'js/' + f; })).map(function (f) { return fs.readFileSync(path.join(ROOT, f), 'utf8'); }).join('\n');
    assert.ok(!/https?:\/\/(?!localhost)[^\s'"]*\.(js|css|woff2?)/.test(all)); assert.ok(!/@import|<link[^>]+href="https?:/.test(all));
});
