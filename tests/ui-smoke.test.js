'use strict';
/* UI smoke test: the real panel (index.html + js/*.js) runs in jsdom with a fake CEP bridge that records every
 * ExtendScript call. Needs the dev-only `jsdom` package; skipped when it is not installed. */
var fs = require('fs'), path = require('path'), assert = require('assert'), JSDOM = null;
try { JSDOM = require('jsdom').JSDOM; } catch (e) { JSDOM = null; }
var ROOT = path.join(__dirname, '..');
function eq(a, b, m) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), m); }
function neq(a, b, m) { assert.notStrictEqual(JSON.stringify(a), JSON.stringify(b), m); }
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function boot(opts) {
    if (!JSDOM) skip('jsdom not installed (npm i jsdom --no-save)');
    opts = opts || {};
    var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8').replace(/<script[^>]*><\/script>/g, '');
    var calls = [], errors = [];
    var dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
    var w = dom.window;
    if (opts.store) Object.keys(opts.store).forEach(function (k) { w.localStorage.setItem('zx.' + k, JSON.stringify(opts.store[k])); });
    w.HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: function (t, k) { return k === 'measureText' ? function () { return { width: 0 }; } : function () { }; }, set: function () { return true; } }); };
    w.HTMLElement.prototype.getBoundingClientRect = function () { return this.id === 'gc' ? { left: 0, top: 0, width: 300, height: 300, right: 300, bottom: 300 } : { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; };
    w.document.execCommand = function () { return true; };
    w.__adobe_cep__ = {
        getSystemPath: function () { return 'file:///C:/ext'; },
        evalScript: function (script, cb) {
            if (/\$\.evalFile/.test(script)) return cb('loaded');
            var out = (new Function('Zelf', 'return ' + script))({ run: function (cmd, json) {
                var params = JSON.parse(json); calls.push({ cmd: cmd, params: params });
                if (cmd === 'ping') return JSON.stringify({ ok: true, data: { ae: '17.0', version: '1.3.3', loadErrors: [] } });
                return JSON.stringify({ ok: true, msg: 'mock ok' });
            } });
            setTimeout(function () { cb(out); }, 0);
        }
    };
    w.addEventListener('error', function (e) { errors.push(e.message); });
    ['ui', 'bridge', 'graph-presets', 'graph', 'anchor-position', 'shortcuts', 'app'].forEach(function (f) {
        w.eval(fs.readFileSync(path.join(ROOT, 'js', f + '.js'), 'utf8') + '\n//# sourceURL=' + f + '.js');
    });
    await sleep(60);
    var d = w.document, ctx = {
        w: w, d: d, calls: calls, errors: errors,
        $: function (s, c) { return (c || d).querySelector(s); }, $$: function (s, c) { return Array.prototype.slice.call((c || d).querySelectorAll(s)); },
        btn: function (text, c) { return ctx.$$('button', c).filter(function (b) { return b.textContent.replace(/\s+/g, ' ').trim() === text; })[0]; },
        click: function (el) { assert.ok(el, 'element to click not found'); el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })); },
        tab: async function (label) { ctx.click(ctx.btn(label)); await sleep(60); },
        mouse: function (type, x, y, target) { (target || w).dispatchEvent(new w.MouseEvent(type, { clientX: x, clientY: y, bubbles: true, cancelable: true })); },
        set: function (el, v) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); },
        last: function (cmd) { return calls.filter(function (c) { return c.cmd === cmd; }).pop(); },
        sleep: sleep
    };
    ctx.pane = function (id) { return ctx.$$('.pane')[{ graph: 0, shortcuts: 1 }[id]]; };
    return ctx;
}
async function openGraph(o) { var u = await boot(o); await u.sleep(30); u.w.ZX.GraphTab._test.redraw(); await u.sleep(40); return u; }
function tilesOf(u) { return u.$$('.tile span', u.pane('graph')).map(function (s) { return s.textContent; }); }
function pickTile(u, name) { var t = u.$$('.tile', u.pane('graph')).filter(function (x) { return x.textContent === name; })[0]; u.click(t); }
async function drag(u, idx, dx, dy) {
    var T = u.w.ZX.GraphTab._test, h = T.handlePx()[idx], canvas = u.$('#gc');
    u.mouse('mousedown', h.x, h.y, canvas); u.mouse('mousemove', h.x + dx / 2, h.y + dy / 2); u.mouse('mousemove', h.x + dx, h.y + dy); u.mouse('mouseup', h.x + dx, h.y + dy); await u.sleep(30);
}

test('panel boots: 2 tabs (GRAPH, SHORTCUTS), no script errors, AE ping answered', async function () {
    var u = await boot();
    eq(u.$$('.tab').map(function (t) { return t.textContent; }), ['GRAPH', 'SHORTCUTS']);
    eq(u.errors, []); assert.ok(u.last('ping'));
    for (var t of ['SHORTCUTS', 'GRAPH']) { await u.tab(t); assert.ok(u.$('.pane:not([hidden]) .sec'), t + ' rendered'); }
    eq(u.errors, []);
});

/* ---- 1 + 2 + 4: presets */
test('GRAPH: sections are Curve, Actions, Presets (Presets underneath Actions)', async function () {
    var u = await openGraph();
    eq(u.$$('.sec-head > span:first-child', u.pane('graph')).map(function (h) { return h.textContent; }), ['Curve', 'Actions', 'Presets']);
});
test('GRAPH: 5 categories (no SMOOTH/RANDOM/CIRC/SINE/EXPO); BASIC shows Standard / Smooth / Circ / Sine / Expo sub-titles', async function () {
    var u = await openGraph();
    eq(u.$$('.cat').map(function (b) { return b.textContent; }), ['BASIC', 'BACK', 'BOUNCE', 'ELASTIC', 'CUSTOM']);
    eq(u.$$('.subhead').map(function (b) { return b.textContent; }), ['Standard', 'Smooth', 'Circ', 'Sine', 'Expo']);
    assert.strictEqual(u.$$('.tiles').length, 5);
    var names = tilesOf(u); ['Linear', 'Ease In', 'Smooth', 'Soft Ease', 'Strong Ease', 'Smooth Step', 'Circ', 'Circ In Out', 'Sine', 'Expo Out'].forEach(function (n) { assert.ok(names.indexOf(n) >= 0, n); });
    assert.ok(!names.some(function (n) { return /random/i.test(n); }));
    assert.strictEqual(u.$$('button', u.pane('graph')).filter(function (b) { return /reseed|random/i.test(b.textContent + b.title); }).length, 0, 'no random controls');
});
test('GRAPH: search for "random" finds nothing; selected tile and category are visibly marked', async function () {
    var u = await openGraph(); var s = u.$('.search', u.pane('graph')); u.set(s, 'random'); await u.sleep(20);
    assert.strictEqual(u.$$('.tile', u.pane('graph')).length, 0); u.set(s, 'circ'); await u.sleep(20);
    assert.strictEqual(tilesOf(u).length, 4); u.set(s, ''); await u.sleep(20);
    assert.ok(u.$('.cat.on').textContent === 'BASIC'); pickTile(u, 'Expo'); assert.strictEqual(u.$$('.tile.on').length, 1); assert.strictEqual(u.$('.tile.on').textContent, 'Expo');
});
test('GRAPH: a saved category "SMOOTH" (removed in 1.2.0) falls back to BASIC and the Smooth presets are still selectable', async function () {
    var u = await openGraph({ store: { 'graph.cat': 'SMOOTH', graph: { preset: 'softEase', bez: [0.25, 0.1, 0.25, 1] } } });
    eq(u.errors, []); assert.strictEqual(u.$('.cat.on').textContent, 'BASIC'); assert.strictEqual(u.w.ZX.GraphTab._test.state().preset, 'softEase');
    assert.strictEqual(u.$('.tile.on').textContent, 'Soft Ease');
});
test('GRAPH: stale saved state (preset "random", category "EXPO") falls back safely; saved customs survive', async function () {
    var snap = { preset: 'random', bez: [0.3, 0.2, 0.6, 0.9], random: 40, seed: 7, samples: 18, overshoot: 100, bounce: 50 };
    var u = await openGraph({ store: { graph: snap, 'graph.cat': 'EXPO', 'graph.custom': [{ id: 'c1', name: 'Old', snap: snap }] } });
    eq(u.errors, []); assert.strictEqual(u.$('.cat.on').textContent, 'BASIC'); assert.strictEqual(u.w.ZX.GraphTab._test.state().preset, 'easeInOut');
    u.click(u.btn('CUSTOM')); await u.sleep(20); eq(tilesOf(u), ['Old']);
    u.click(u.$('.tile', u.pane('graph'))); await u.sleep(20);
    var st = u.w.ZX.GraphTab._test.state(); assert.strictEqual(st.preset, 'custom'); assert.strictEqual(st.random, undefined); eq(st.bez, [0.3, 0.2, 0.6, 0.9]);
});

/* ---- 3: direct graph adjustment */
test('GRAPH: bezier handles still drag (Basic regression) and Apply sends native mode', async function () {
    var u = await openGraph(); pickTile(u, 'Ease In Out'); await u.sleep(20);
    var b0 = u.w.ZX.GraphTab._test.state().bez.slice(); assert.strictEqual(u.w.ZX.GraphTab._test.handlePx().length, 2);
    await drag(u, 0, 40, -30); var st = u.w.ZX.GraphTab._test.state();
    assert.strictEqual(st.preset, 'custom'); neq(st.bez, b0); assert.ok(st.bez[0] > b0[0]);
    u.click(u.btn('Apply')); await u.sleep(20); var c = u.last('graph.apply'); assert.strictEqual(c.params.mode, 'native'); eq(c.params.bez, st.bez);
    u.click(u.btn('Reset')); await u.sleep(20); assert.strictEqual(u.w.ZX.GraphTab._test.state().preset, 'easeInOut');
});
[['BACK', 'Overshoot', 'overshoot', -40, 'Overshoot'], ['BOUNCE', 'Bounce', 'bounce', -40, 'Bounce'], ['ELASTIC', 'Elastic', 'overshoot', -30, 'Amplitude']].forEach(function (c) {
    test('GRAPH: ' + c[1] + ' graph is adjustable by dragging its handle; sliders and Apply payload follow', async function () {
        var u = await openGraph(); u.click(u.btn(c[0])); await u.sleep(20); pickTile(u, c[1]); await u.sleep(20);
        var T = u.w.ZX.GraphTab._test, key = c[2], v0 = T.state()[key], hx = T.handlePx();
        assert.ok(hx.length >= 1, 'handle present'); assert.ok(u.$('.shape', u.pane('graph')).hidden === false, 'shape sliders visible');
        var sl = u.$$('.sld', u.pane('graph')).filter(function (s) { return !s.hidden && s.textContent.indexOf(c[4]) === 0; })[0]; assert.ok(sl, 'slider "' + c[4] + '" visible');
        var out0 = sl.querySelector('output').textContent;
        var vals0 = JSON.stringify(require('../js/graph-presets.js').build(T.state()).values);
        await drag(u, 0, 0, c[3]);
        var st = T.state(); assert.notStrictEqual(st[key], v0, 'parameter must change'); assert.strictEqual(st.preset, c[1].toLowerCase());
        assert.notStrictEqual(sl.querySelector('output').textContent, out0, 'slider readout follows the drag');
        assert.ok(Math.abs(parseFloat(sl.querySelector('input').value) - st[key]) <= 0.5, 'slider value == parameter (slider step is 1)');
        u.click(u.btn('Apply')); await u.sleep(20); var call = u.last('graph.apply');
        assert.strictEqual(call.params.mode, 'sampled'); assert.notStrictEqual(JSON.stringify(call.params.values), vals0, 'generated keyframes reflect the drag');
        assert.strictEqual(JSON.stringify(call.params.values), JSON.stringify(require('../js/graph-presets.js').build(st).values), 'payload == engine for the dragged state');
    });
    test('GRAPH: moving the ' + c[1] + ' slider moves the handle (two-way sync)', async function () {
        var u = await openGraph(); u.click(u.btn(c[0])); await u.sleep(20); pickTile(u, c[1]); await u.sleep(20);
        var T = u.w.ZX.GraphTab._test, h0 = T.handlePx()[0];
        var sl = u.$$('.sld', u.pane('graph')).filter(function (s) { return !s.hidden && s.textContent.indexOf(c[4]) === 0; })[0], inp = sl.querySelector('input');
        u.set(inp, String(parseFloat(inp.value) > 50 ? 20 : 90)); await u.sleep(40);
        var h1 = T.handlePx()[0]; assert.ok(Math.abs(h1.x - h0.x) + Math.abs(h1.y - h0.y) > 1, 'handle did not move');
    });
});
test('GRAPH: dragging does not conflict between presets (bezier preset has no on-curve handle logic, sampled-only presets have no handles)', async function () {
    var u = await openGraph(); var T = u.w.ZX.GraphTab._test; pickTile(u, 'Step'); await u.sleep(20); assert.strictEqual(T.handlePx().length, 0);
    pickTile(u, 'Smooth Step'); await u.sleep(20); assert.strictEqual(T.handlePx().length, 0);
    pickTile(u, 'Smooth'); await u.sleep(20); assert.strictEqual(T.handlePx().length, 2);
});
test('GRAPH: custom presets save / select / delete still work for a dragged Bounce curve', async function () {
    var u = await openGraph(); u.click(u.btn('BOUNCE')); await u.sleep(20); pickTile(u, 'Bounce'); await u.sleep(20); await drag(u, 0, 0, -40);
    var b = u.w.ZX.GraphTab._test.state().bounce; u.set(u.$('input[aria-label="Preset name"]'), 'My Bounce'); u.click(u.btn('Save')); await u.sleep(20);
    eq(tilesOf(u), ['My Bounce']); pickTile(u, 'My Bounce'); await u.sleep(20); assert.strictEqual(u.w.ZX.GraphTab._test.state().bounce, b);
    u.click(u.btn('Delete')); await u.sleep(20); eq(tilesOf(u), []);
});

/* ---- 6: anchor / position */
test('SHORTCUTS: the anchor/position grid is the FIRST section, above MARK NAVIGATION; the ANCHOR/POS tab is gone', async function () {
    var u = await boot(); await u.tab('SHORTCUTS'); var p = u.pane('shortcuts');
    eq(u.$$('.sec-head > span:first-child', p).map(function (h) { return h.textContent; }).slice(0, 2), ['ANCHOR / POSITION', 'MARK NAVIGATION']);
    assert.strictEqual(u.$$('.tab').filter(function (t) { return /ANCHOR/.test(t.textContent); }).length, 0);
    assert.strictEqual(u.$$('.acell', p).length, 9);
    assert.ok(!/single axis|align to/i.test(p.textContent), 'no Single axis / Align-to');
    u.click(u.$('.acell[title="Center"]')); await u.sleep(10); var c = u.last('anchor.move'); eq([c.params.ax, c.params.ay, c.params.compensate], [0.5, 0.5, true]);
    u.click(u.btn('Position', p)); u.click(u.$('.acell[title="Top Right"]')); await u.sleep(10); eq(u.last('position.align').params, { ax: 1, ay: 0, target: 'selection' });
    u.click(u.$('.acell[title="Left"]')); await u.sleep(10); eq(u.last('position.align').params, { ax: 0, ay: 0.5, target: 'selection' });
    assert.ok(/one selected layer/i.test(p.textContent));
});
test('a saved tab id "anchor" (removed tab) opens the first tab without errors', async function () {
    var u = await boot({ store: { tab: 'anchor' } }); eq(u.errors, []); assert.ok(u.$('.tab.on')); assert.strictEqual(u.$('.tab.on').textContent, 'GRAPH');
});

test('GRAPH: Normal / Overshoot switch (where Selection was): Normal keeps bezier handles inside 0..100%, Overshoot allows more', async function () {
    var u = await openGraph(); pickTile(u, 'Ease In Out'); await u.sleep(20); var head = u.$('.sec-head', u.pane('graph'));
    assert.ok(!u.btn('Selection', u.pane('graph')), 'Selection button is gone');
    eq(u.$$('.segb', head).map(function (b) { return b.textContent; }), ['Normal', 'Overshoot']);
    var T = u.w.ZX.GraphTab._test; assert.strictEqual(T.mode(), 'normal');
    await drag(u, 1, 0, -400); var b = T.state().bez; assert.ok(b[3] <= 1 && b[3] >= 0, 'Normal: y stays within 0..1, got ' + b[3]);
    await drag(u, 0, 0, 400); b = T.state().bez; assert.ok(b[1] >= 0, 'Normal: y stays >= 0, got ' + b[1]);
    u.click(u.btn('Overshoot', head)); await u.sleep(20); assert.strictEqual(T.mode(), 'over');
    await drag(u, 1, 0, -400); b = T.state().bez; assert.ok(b[3] > 1, 'Overshoot: y goes past 1, got ' + b[3]);
    u.click(u.btn('Normal', head)); await u.sleep(20); assert.strictEqual(T.mode(), 'normal'); assert.ok(T.state().bez[3] <= 1, 'back to Normal pulls the handle into range');
    pickTile(u, 'Step'); await u.sleep(20); assert.ok(u.$('.seg', head).hidden, 'switch is hidden for non-bezier curves');
});

/* ---- 8 + 9: shortcuts */
test('SHORTCUTS: colour fields open a custom picker window (no native colour input); Solid uses the applied colour', async function () {
    var u = await boot(); await u.tab('SHORTCUTS'); var p = u.pane('shortcuts');
    var sw = u.$$('.swatch', p); assert.strictEqual(sw.length, 2); assert.strictEqual(u.$$('input[type=color]').length, 0, 'no native colour input');
    sw.forEach(function (s) { assert.strictEqual(s.tagName, 'BUTTON'); assert.ok(/#[0-9A-F]{6}/.test(s.textContent)); });
    assert.ok(u.$('.cp').hidden, 'picker closed at start');
    u.click(sw[0]); assert.ok(!u.$('.cp').hidden, 'click opens the window');
    var hex = u.$('.cp input[aria-label="Hex colour"]'); assert.strictEqual(hex.value, '#808080');
    u.set(hex, '#ff8000'); eq(['R', 'G', 'B'].map(function (n) { return u.$('.cp input[aria-label="' + n + '"]').value; }), ['255', '128', '0'], 'HEX -> R/G/B');
    u.set(u.$('.cp input[aria-label="G"]'), '0'); assert.strictEqual(hex.value, '#FF0000', 'R/G/B -> HEX');
    u.click(u.btn('Cancel')); assert.ok(u.$('.cp').hidden); assert.ok(/#808080/.test(sw[0].textContent), 'Cancel keeps the old colour');
    u.click(sw[0]); u.set(u.$('.cp input[aria-label="Hex colour"]'), '#ff8000'); u.click(u.btn('OK')); assert.ok(u.$('.cp').hidden);
    assert.ok(/#FF8000/.test(sw[0].textContent)); assert.ok(/#FFFFFF/.test(sw[1].textContent), 'text colour field is independent');
    u.click(u.btn('Create Solid')); await u.sleep(10); eq(u.last('solid.create').params.color.map(function (x) { return Math.round(x * 255); }), [255, 128, 0]);
    assert.strictEqual(JSON.parse(u.w.localStorage.getItem('zx.sc.color')), '#ff8000'); assert.strictEqual(JSON.parse(u.w.localStorage.getItem('zx.colors.recent'))[0], '#ff8000');
    u.click(sw[0]); assert.ok(u.$$('.cp-pal .pal-c').length >= 25, 'swatches + recent colours'); u.click(u.$('.cp-pal .pal-c[title="#FFFFFF"]')); assert.strictEqual(u.$('.cp input[aria-label="Hex colour"]').value, '#FFFFFF');
    u.$('.cp').dispatchEvent(new u.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.ok(u.$('.cp').hidden, 'Esc closes'); assert.ok(/#FF8000/.test(sw[0].textContent));
});
test('SHORTCUTS: there is no Font section; Create Center Text sends text and text colour only', async function () {
    var u = await boot(); await u.tab('SHORTCUTS'); var p = u.pane('shortcuts');
    assert.ok(!/\bFont\b/.test(p.textContent)); assert.strictEqual(u.$$('input[aria-label="Font"], datalist', p).length, 0);
    u.click(u.btn('Create Center Text')); await u.sleep(10); var c = u.last('text.center').params;
    eq(Object.keys(c).sort(), ['color', 'text']); eq([c.text, c.color], ['Text', [1, 1, 1]], 'defaults: "Text", white');
    u.set(u.$('input[aria-label="Center text"]', p), 'Halo'); u.click(u.$$('.swatch', p)[1]); u.set(u.$('.cp input[aria-label="Hex colour"]'), '#00e676'); u.click(u.btn('OK'));
    u.click(u.btn('Create Center Text')); await u.sleep(10); c = u.last('text.center').params;
    assert.strictEqual(c.text, 'Halo'); eq(c.color.map(function (x) { return Math.round(x * 255); }), [0, 230, 118]);
    assert.strictEqual(JSON.parse(u.w.localStorage.getItem('zx.sc.tcolor')), '#00e676');
    assert.ok(!u.calls.some(function (x) { return x.cmd === 'font.list'; }), 'font.list is not called');
});
test('SHORTCUTS: the other buttons still send their commands', async function () {
    var u = await boot(); await u.tab('SHORTCUTS');
    for (var x of [['Create Comp', 'comp.create'], ['Null Parent', 'null.parent'], ['Adjustment Layer', 'adjustment.create'], ['Light', 'light.create'], ['Camera', 'camera.create'], ['Precomp', 'precomp.create']]) { u.click(u.btn(x[0])); await u.sleep(30); assert.ok(u.last(x[1]), x[1]); }
    u.click(u.btn('\u25C0 Previous Marker')); await u.sleep(30); u.click(u.btn('Next Marker \u25B6')); await u.sleep(30); assert.ok(u.last('marker.prev') && u.last('marker.next'));
    u.click(u.btn('Apply', u.pane('shortcuts'))); await u.sleep(10); var s = u.last('stair.apply').params; eq([s.offset, s.mode, s.dir, s.order], [5, 'stair', 'forward', 'top']);
    u.click(u.btn('Sequence', u.pane('shortcuts'))); await u.sleep(10); u.click(u.btn('Apply', u.pane('shortcuts'))); await u.sleep(10); assert.strictEqual(u.last('stair.apply').params.mode, 'sequence');
    u.click(u.btn('Reset', u.pane('shortcuts'))); await u.sleep(10); assert.ok(u.last('stair.reset'));
});

/* ---- 5 + 10: static checks of the stylesheet */
test('theme: deep-black background, green accent, token-based spacing, large hit areas', function () {
    var css = fs.readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
    assert.ok(/--bg:\s*#000000/.test(css), 'background is true black'); assert.ok(/--ac:\s*#00e676/.test(css), 'green accent');
    var sp = css.match(/--sp-\d:\s*\d+px/g); assert.strictEqual(sp.length, 4);
    function lum(h) { var c = [1, 3, 5].map(function (i) { var v = parseInt(h.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
    assert.ok((lum('#00e676') + 0.05) / (lum('#000000') + 0.05) > 7, 'accent contrast on black >= 7:1');
    assert.ok((lum('#f4f8f5') + 0.05) / (lum('#000000') + 0.05) > 15, 'text contrast');
    assert.ok(/--ctl:\s*(2[4-9]|3\d)px/.test(css), 'controls are compact but still >= 24px high');
    assert.ok(/\.cat\s*\{[^}]*min-height:\s*var\(--ctl\)/.test(css), 'category buttons use the control height'); assert.ok(/\.cats\s*\{[^}]*gap:\s*var\(--sp-2\)/.test(css));
    assert.ok(!/#39c5b0|#1a1c21|#22252c/i.test(css), 'old teal/graphite palette fully replaced');
    ['.btn', '.segb', '.chk', '.tab', '.acell', '.swatch', '.pal-c'].forEach(function (s) { assert.ok(css.indexOf(s + ' ') >= 0 || css.indexOf(s + ',') >= 0 || css.indexOf(s + '{') >= 0, s); });
    var js = ['graph.js', 'ui.js'].map(function (f) { return fs.readFileSync(path.join(ROOT, 'js', f), 'utf8'); }).join('');
    assert.ok(!/#39c5b0|#e8b04a/i.test(js), 'no leftover teal / amber handle colours in JS');
});
