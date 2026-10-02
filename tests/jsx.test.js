'use strict';
var assert = require('assert'), AE = require('./mock-ae.js');

function eq(a, b, msg) { assert.strictEqual(JSON.stringify(a), JSON.stringify(b), msg); }
function setup() { var m = AE.create(); var comp = m.comp(); return { m: m, comp: comp }; }
function sel(comp, layers) { comp._layers.forEach(function (l) { l.selected = false; }); layers.forEach(function (l) { l.selected = true; }); }
function near(a, b, msg, tol) { assert.ok(Math.abs(a - b) <= (tol || 1e-6), (msg || '') + ' expected ' + b + ' got ' + a); }
function box(m, L) {      // world bounding box of the layer's source rect (corners through the mock transform chain)
    var r = L._rect || [0, 0, L.width, L.height], pts = [[r[0], r[1]], [r[0] + r[2], r[1]], [r[0], r[1] + r[3]], [r[0] + r[2], r[1] + r[3]]];
    var w = pts.map(function (p) { return m.world(L, L.threeDLayer ? [p[0], p[1], 0] : p); });
    var xs = w.map(function (a) { return a[0]; }), ys = w.map(function (a) { return a[1]; });
    return { l: Math.min.apply(null, xs), r: Math.max.apply(null, xs), t: Math.min.apply(null, ys), b: Math.max.apply(null, ys) };
}
var KINDS = [
    ['text', { rect: [-60, -30, 120, 40], pos: [500, 300] }], ['shape', { rect: [-40, -40, 80, 80], pos: [700, 200] }],
    ['solid', { w: 300, h: 200, pos: [960, 540] }], ['null', { w: 100, h: 100, pos: [100, 100] }], ['adjustment', { w: 1920, h: 1080, pos: [960, 540], adj: true }]
];

test('all jsx modules load in the mock (no loadErrors)', function () { eq(setup().m.loadErrors(), []); });

test('mock sanity: text/shape layers are AVLayers, camera/light are not', function () {
    var s = setup(), t = s.m.layer(s.comp, 'text', 'T', {}), c = s.m.layer(s.comp, 'camera', 'C', {});
    assert.ok(s.m.instanceOf(t, 'AVLayer')); assert.ok(!s.m.instanceOf(c, 'AVLayer')); assert.ok(s.m.instanceOf(c, 'CameraLayer'));
});

/* ---------- ANCHOR with ONE selected layer of every type, position compensated */
KINDS.forEach(function (k) {
    [false, true].forEach(function (parented) {
        test('anchor.move: one ' + k[0] + (parented ? ' (under a rotated, scaled parent)' : '') + ' selected -> anchor moves, artwork does not', function () {
            var s = setup(), L = s.m.layer(s.comp, k[0], 'L', k[1]);
            if (parented) { var P = s.m.layer(s.comp, 'null', 'P', { w: 100, h: 100, pos: [800, 400], rot: 30, scale: [150, 80] }); L.parent = P; L._pos._v = [40, 25]; }
            var r0 = L._rect || [0, 0, L.width, L.height], before = box(s.m, L);
            sel(s.comp, [L]);
            [[0.5, 0.5], [0, 0], [1, 1], [0.5, 0]].forEach(function (c) {
                var res = s.m.run('anchor.move', { ax: c[0], ay: c[1], compensate: true });
                assert.strictEqual(res.ok, true, res.msg);
                near(L._anc._v[0], r0[0] + r0[2] * c[0], 'anchor x'); near(L._anc._v[1], r0[1] + r0[3] * c[1], 'anchor y');
                var after = box(s.m, L); ['l', 'r', 't', 'b'].forEach(function (e) { near(after[e], before[e], 'artwork moved (' + e + ')', 1e-6); });
            });
        });
    });
});
test('anchor.move: compensate=false moves only the anchor (artwork shifts), position untouched', function () {
    var s = setup(), L = s.m.layer(s.comp, 'text', 'L', { rect: [-60, -30, 120, 40], pos: [500, 300] }); sel(s.comp, [L]);
    var res = s.m.run('anchor.move', { ax: 0.5, ay: 0.5, compensate: false }); assert.ok(res.ok);
    eq(L._pos._v, [500, 300]);
});
test('anchor.move: animated Position keeps its motion path (every key shifted by the same amount)', function () {
    var s = setup(), L = s.m.layer(s.comp, 'solid', 'L', { w: 200, h: 100, pos: [100, 100] }); sel(s.comp, [L]);
    L._pos.addKey(0, [100, 100]); L._pos.addKey(1, [400, 250]);
    var res = s.m.run('anchor.move', { ax: 0.5, ay: 0.5, compensate: true }); assert.ok(res.ok, res.msg);
    near(L._pos.keyValue(1)[0], 200); near(L._pos.keyValue(1)[1], 150); near(L._pos.keyValue(2)[0], 500); near(L._pos.keyValue(2)[1], 300);
});
test('anchor.move: Position with an expression is not touched', function () {
    var s = setup(), L = s.m.layer(s.comp, 'solid', 'L', { w: 200, h: 100 }); sel(s.comp, [L]); L._pos.expression = 'value'; L._pos.expressionEnabled = true;
    var res = s.m.run('anchor.move', { ax: 0, ay: 0, compensate: true }); assert.strictEqual(res.ok, false); eq(L._anc._v, [0, 0]);
});

/* ---------- POSITION with ONE selected layer of every type */
KINDS.forEach(function (k) {
    test('position.align: one ' + k[0] + ' selected -> Center X/Y, Top, Bottom, Left, Right, grid corner vs composition', function () {
        var s = setup(), L = s.m.layer(s.comp, k[0], 'L', k[1]); sel(s.comp, [L]);
        function go(ax, ay) { var r = s.m.run('position.align', { ax: ax, ay: ay, target: 'comp' }); assert.strictEqual(r.ok, true, r.msg); return box(s.m, L); }
        var b = go(0.5, null); near((b.l + b.r) / 2, 960, 'center X');
        b = go(null, 0.5); near((b.t + b.b) / 2, 540, 'center Y');
        b = go(null, 0); near(b.t, 0, 'top'); b = go(null, 1); near(b.b, 1080, 'bottom');
        b = go(0, null); near(b.l, 0, 'left'); b = go(1, null); near(b.r, 1920, 'right');
        b = go(0, 0); near(b.l, 0); near(b.t, 0); b = go(0.5, 0.5); near((b.l + b.r) / 2, 960); near((b.t + b.b) / 2, 540);
    });
});
test('position.align: layer under a rotated parent still lands on the composition edge', function () {
    var s = setup(), P = s.m.layer(s.comp, 'null', 'P', { w: 100, h: 100, pos: [800, 400], rot: 20, scale: [120, 120] });
    var L = s.m.layer(s.comp, 'shape', 'L', { rect: [-40, -40, 80, 80], pos: [30, 10] }); L.parent = P; sel(s.comp, [L]);
    assert.ok(s.m.run('position.align', { ax: 0, ay: null, target: 'comp' }).ok); near(box(s.m, L).l, 0, 'left edge', 1e-6);
});
test('position.align: Position keyframes are all shifted, path shape preserved', function () {
    var s = setup(), L = s.m.layer(s.comp, 'solid', 'L', { w: 200, h: 100, pos: [300, 200] }); sel(s.comp, [L]);
    L._pos.addKey(0, [300, 200]); L._pos.addKey(1, [700, 500]);
    assert.ok(s.m.run('position.align', { ax: 0, ay: null, target: 'comp' }).ok);
    near(L._pos.keyValue(2)[0] - L._pos.keyValue(1)[0], 400); near(L._pos.keyValue(2)[1] - L._pos.keyValue(1)[1], 300);
});

/* ---------- CAMERA / LIGHT */
['camera', 'light'].forEach(function (kind) {
    test('position.align: a single ' + kind + ' selected can be centered / aligned (treated as a point at its position)', function () {
        var s = setup(), C = s.m.layer(s.comp, kind, 'C', { pos: [100, 100, -800] }); sel(s.comp, [C]);
        var r = s.m.run('position.align', { ax: 0.5, ay: null, target: 'comp' }); assert.strictEqual(r.ok, true, r.msg);
        near(C._pos._v[0], 960); near(C._pos._v[1], 100); near(C._pos._v[2], -800, 'z untouched');
        r = s.m.run('position.align', { ax: null, ay: 0.5, target: 'comp' }); assert.ok(r.ok); near(C._pos._v[1], 540);
        r = s.m.run('position.align', { ax: 0, ay: 0, target: 'comp' }); assert.ok(r.ok); near(C._pos._v[0], 0); near(C._pos._v[1], 0);
        assert.strictEqual(s.comp.numLayers, 1, 'temporary probe null must be removed');
        assert.ok(s.comp._layers[0].selected, 'selection restored');
    });
    test('position.align: ' + kind + ' with a parent lands in the right world place', function () {
        var s = setup(), P = s.m.layer(s.comp, 'null', 'P', { w: 100, h: 100, pos: [500, 500], rot: 45, scale: [200, 200] });
        var C = s.m.layer(s.comp, kind, 'C', { pos: [10, 20, 0] }); C.parent = P; sel(s.comp, [C]);
        assert.ok(s.m.run('position.align', { ax: 0.5, ay: 0.5, target: 'comp' }).ok);
        var w = s.m.world(C, [0, 0, 0]); near(w[0], 960, 'world x', 1e-6); near(w[1], 540, 'world y', 1e-6);
    });
    test('anchor.move: a ' + kind + ' alone is reported clearly, nothing changes', function () {
        var s = setup(), C = s.m.layer(s.comp, kind, 'C', {}); sel(s.comp, [C]); var before = JSON.stringify(C._pos._v);
        var r = s.m.run('anchor.move', { ax: 0.5, ay: 0.5, compensate: true }); assert.strictEqual(r.ok, false); assert.strictEqual(r.kind, 'invalid'); assert.ok(/Camera and Light/.test(r.msg));
        assert.strictEqual(JSON.stringify(C._pos._v), before);
    });
});
test('anchor.move: camera + text selected -> text handled, camera skipped', function () {
    var s = setup(), T = s.m.layer(s.comp, 'text', 'T', { rect: [-60, -30, 120, 40], pos: [500, 300] }), C = s.m.layer(s.comp, 'camera', 'C', {}); sel(s.comp, [T, C]);
    var r = s.m.run('anchor.move', { ax: 0.5, ay: 0.5, compensate: true }); assert.ok(r.ok); assert.ok(/1 layer/.test(r.msg) && /1 skipped/.test(r.msg), r.msg);
});

/* ---------- selection rules */
test('Selection target: ONE selected layer is enough (aligns to the composition, no error); 2+ layers align to their combined bounds', function () {
    var s = setup(), A = s.m.layer(s.comp, 'solid', 'A', { w: 100, h: 100, pos: [300, 300] }), B = s.m.layer(s.comp, 'solid', 'B', { w: 100, h: 100, pos: [800, 600] });
    sel(s.comp, [A]); var r = s.m.run('position.align', { ax: 0, ay: null, target: 'selection' });
    assert.strictEqual(r.ok, true, r.msg); assert.ok(!/2 or more/.test(r.msg)); assert.ok(/composition/.test(r.msg), 'says what it aligned to'); near(box(s.m, A).l, 0, 'left edge on the comp edge');
    r = s.m.run('position.align', { ax: 0.5, ay: 0.5, target: 'selection' }); assert.ok(r.ok, r.msg);
    var b = box(s.m, A); near((b.l + b.r) / 2, 960); near((b.t + b.b) / 2, 540);
    assert.ok(s.m.run('position.align', { ax: 0, ay: null, target: 'comp' }).ok);
    A._pos._v = [300, 300]; sel(s.comp, [A, B]);
    r = s.m.run('position.align', { ax: 0, ay: null, target: 'selection' }); assert.ok(r.ok); assert.ok(!/to the composition/.test(r.msg)); near(box(s.m, A).l, box(s.m, B).l, 'left edges aligned');
});
test('anchor.move needs only one selected layer too', function () {
    var s = setup(), A = s.m.layer(s.comp, 'solid', 'A', { w: 100, h: 100, pos: [300, 300] }); sel(s.comp, [A]);
    var r = s.m.run('anchor.move', { ax: 0, ay: 0, compensate: true }); assert.strictEqual(r.ok, true, r.msg); assert.ok(/1 layer/.test(r.msg));
});
test('nothing selected / locked layer give a clear message', function () {
    var s = setup(), L = s.m.layer(s.comp, 'solid', 'L', { w: 100, h: 100 }); sel(s.comp, []);
    assert.ok(/Select a layer/.test(s.m.run('anchor.move', { ax: 0, ay: 0 }).msg)); L.locked = true; sel(s.comp, [L]);
    assert.ok(/locked/.test(s.m.run('position.align', { ax: 0, ay: null, target: 'comp' }).msg));
});

/* ---------- undo: one group per command */
test('every modifying command opens and closes exactly one undo group', function () {
    var s = setup(), L = s.m.layer(s.comp, 'text', 'L', { rect: [-60, -30, 120, 40], pos: [500, 300] }), C = s.m.layer(s.comp, 'camera', 'C', {}); sel(s.comp, [L]);
    var cmds = [['anchor.move', { ax: 0.5, ay: 0.5 }], ['position.align', { ax: 0.5, ay: null, target: 'comp' }], ['text.center', { text: 'x' }], ['solid.create', { color: [1, 0, 0] }], ['adjustment.create', {}], ['light.create', {}], ['camera.create', {}], ['precomp.create', {}]];
    cmds.forEach(function (c) {
        var u = s.m.undo(), b = u.begin, e = u.end; sel(s.comp, [L]);
        var r = s.m.run(c[0], c[1]); assert.ok(r.ok, c[0] + ': ' + r.msg); assert.strictEqual(u.begin - b, 1, c[0]); assert.strictEqual(u.end - e, 1, c[0]);
    });
    sel(s.comp, [C]); var u2 = s.m.undo(), b2 = u2.begin; s.m.run('position.align', { ax: 0.5, ay: null, target: 'comp' }); assert.strictEqual(u2.begin - b2, 1, 'camera path');
});

/* ---------- SHORTCUTS: solid, text colour (no font option any more), camera, precomp */
test('solid.create uses the colour sent by the panel', function () {
    var s = setup(); assert.ok(s.m.run('solid.create', { color: [1, 0.5, 0] }).ok);
    eq(s.comp._layers[0]._color, [1, 0.5, 0]);
});
test('text.center applies text and fill colour, centered in the comp; the font is left to After Effects', function () {
    var s = setup(), r = s.m.run('text.center', { text: 'Hello', color: [1, 0, 0.25] }); assert.strictEqual(r.ok, true, r.msg);
    var L = s.comp._layers[0], d = L._textDoc.value;
    assert.strictEqual(d.text, 'Hello'); eq(d.fillColor, [1, 0, 0.25]); assert.strictEqual(d.applyFill, true);
    assert.strictEqual(d.font, 'MyriadPro-Regular', 'default font untouched');
    assert.strictEqual(d.justification, 'center'); eq(L._pos._v, [960, 540]); eq(L._anc._v, [0, -10]);
});
test('text.center ignores a stray font parameter (old saved panel state) and defaults to white', function () {
    var s = setup(), r = s.m.run('text.center', { text: 'Text', font: 'Impact' }); assert.ok(r.ok);
    var d = s.comp._layers[0]._textDoc.value; eq(d.fillColor, [1, 1, 1]); assert.strictEqual(d.font, 'MyriadPro-Regular'); eq(s.comp._layers[0]._pos._v, [960, 540]);
});
test('font section is gone: no font.list command, no font code left in the ExtendScript', function () {
    var m = AE.create(); var r = m.run('font.list'); assert.strictEqual(r.ok, false); assert.ok(/Unknown command/.test(r.msg));
    assert.ok(!/\.font\b/.test(require('fs').readFileSync(require('path').join(__dirname, '..', 'jsx', 'shortcuts.jsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('camera.create: 50mm camera framing the comp, on top of the selection, selected, one undo step', function () {
    var s = setup(), A = s.m.layer(s.comp, 'solid', 'A', { w: 100, h: 100 }), B = s.m.layer(s.comp, 'solid', 'B', { w: 100, h: 100 }); sel(s.comp, [A]);
    var u = s.m.undo(), b = u.begin, r = s.m.run('camera.create', {}); assert.strictEqual(r.ok, true, r.msg); assert.strictEqual(u.begin - b, 1);
    var C = s.comp._layers.filter(function (l) { return l._kind === 'camera'; })[0]; assert.ok(C, 'camera layer exists'); assert.strictEqual(C.name, 'Camera 1');
    var zoom = 1920 * 50 / 36; near(C._zoom._v, zoom, 'zoom'); near(C._pos._v[0], 960); near(C._pos._v[1], 540); near(C._pos._v[2], -zoom, 'z');
    assert.ok(C.selected && s.comp.selectedLayers.length === 1, 'only the new camera is selected');
    assert.strictEqual(s.comp.numLayers, 3);
    sel(s.comp, []); s.m.run('camera.create', {}); assert.ok(s.comp._layers.some(function (l) { return l.name === 'Camera 2'; }), 'second camera is numbered');
});
test('camera.create needs an active composition', function () {
    var m = AE.create(); m.ctx.app.project.activeItem = null; var r = m.run('camera.create', {}); assert.strictEqual(r.ok, false); assert.strictEqual(r.kind, 'invalid');
});

test('precomp.create: the selected layers move into a new comp, one precomp layer is left selected, one undo step', function () {
    var s = setup(), A = s.m.layer(s.comp, 'solid', 'A', { w: 100, h: 100 }), B = s.m.layer(s.comp, 'text', 'B', { rect: [0, 0, 50, 20] }), C = s.m.layer(s.comp, 'solid', 'C', { w: 100, h: 100 });
    // layer order top -> bottom: C, B, A. Select C and A.
    sel(s.comp, [C, A]); var u = s.m.undo(), b = u.begin, r = s.m.run('precomp.create', {}); assert.strictEqual(r.ok, true, r.msg); assert.strictEqual(u.begin - b, 1);
    assert.strictEqual(s.comp.numLayers, 2, 'B + the new precomp layer'); assert.strictEqual(s.comp._layers[0].name.indexOf('Precomp'), 0, 'precomp layer takes the top-most slot');
    assert.strictEqual(s.comp._layers[1], B); assert.ok(s.comp._layers[0].selected); assert.ok(/2 layers/.test(r.msg), r.msg);
    var inner = s.comp.__lastPrecomp; assert.strictEqual(inner._layers.length, 2); assert.strictEqual(inner.__movedAll, true, 'move all attributes');
});
test('precomp.create: a single layer is named after the layer', function () {
    var s = setup(), A = s.m.layer(s.comp, 'solid', 'Hero', { w: 100, h: 100 }); sel(s.comp, [A]);
    var r = s.m.run('precomp.create', {}); assert.ok(r.ok, r.msg); assert.strictEqual(s.comp._layers[0].name, 'Hero Comp'); assert.ok(/1 layer /.test(r.msg));
});
test('precomp.create: locked layers and camera/light are skipped and reported; nothing usable -> clear message', function () {
    var s = setup(), A = s.m.layer(s.comp, 'solid', 'A', { w: 100, h: 100 }), L = s.m.layer(s.comp, 'solid', 'L', { w: 100, h: 100 }), C = s.m.layer(s.comp, 'camera', 'C', {});
    L.locked = true; sel(s.comp, [A, L, C]); var r = s.m.run('precomp.create', {}); assert.ok(r.ok, r.msg); assert.ok(/2 skipped/.test(r.msg), r.msg);
    var s2 = setup(), C2 = s2.m.layer(s2.comp, 'camera', 'C', {}); sel(s2.comp, [C2]); r = s2.m.run('precomp.create', {}); assert.strictEqual(r.ok, false); assert.ok(/Camera and light/.test(r.msg));
    var s3 = setup(); s3.m.layer(s3.comp, 'solid', 'A', { w: 1, h: 1 }); sel(s3.comp, []); r = s3.m.run('precomp.create', {}); assert.strictEqual(r.ok, false); assert.ok(/Select one or more/.test(r.msg));
});

