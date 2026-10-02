'use strict';
var assert = require('assert'), E = require('../js/graph-presets.js');

test('categories: Random, Smooth, Circ, Sine, Expo are not categories any more', function () {
    assert.deepStrictEqual(E.CATEGORIES, ['BASIC', 'BACK', 'BOUNCE', 'ELASTIC', 'CUSTOM']);
    assert.ok(E.PRESETS.every(function (p) { return p.cat !== 'SMOOTH'; }));
});
test('registry: no Random preset anywhere (ids, names, kinds)', function () {
    E.PRESETS.forEach(function (p) {
        assert.ok(!/random/i.test(p.id + p.name + p.kind + p.cat), 'found ' + p.id);
        assert.notStrictEqual(p.cat, 'RANDOM');
    });
    assert.strictEqual(E.BY_ID.random, undefined);
    assert.strictEqual(E.BY_ID.randomSmooth, undefined);
});
test('registry: Circ, Sine and Expo presets are kept, as separate presets inside BASIC', function () {
    ['circ', 'circIn', 'circOut', 'circInOut', 'sine', 'sineIn', 'sineOut', 'sineInOut', 'expo', 'expoIn', 'expoOut', 'expoInOut'].forEach(function (id) {
        assert.ok(E.BY_ID[id], id + ' missing'); assert.strictEqual(E.BY_ID[id].cat, 'BASIC', id);
    });
});
test('Smooth presets live inside BASIC as the Smooth sub-group (same ids and curves as before)', function () {
    var g = E.groupsOf('BASIC')[1];
    assert.strictEqual(g.title, 'Smooth');
    assert.deepStrictEqual(g.presets.map(function (p) { return p.id; }), ['smooth', 'softEase', 'strongEase', 'smoothStep']);
    assert.deepStrictEqual(E.BY_ID.smooth.bez, [0.4, 0, 0.2, 1]); assert.strictEqual(E.BY_ID.smoothStep.kind, 'fn');
    g.presets.forEach(function (p) { assert.strictEqual(p.cat, 'BASIC', p.id); });
    assert.strictEqual(E.build(E.stateFor('smooth')).mode, 'native'); assert.strictEqual(E.build(E.stateFor('smoothStep')).mode, 'sampled');
});
test('BASIC is grouped Standard / Smooth / Circ / Sine / Expo, every BASIC preset in exactly one group', function () {
    var g = E.groupsOf('BASIC');
    assert.deepStrictEqual(g.map(function (x) { return x.title; }), ['Standard', 'Smooth', 'Circ', 'Sine', 'Expo']);
    assert.deepStrictEqual(g[0].presets.map(function (p) { return p.id; }), ['linear', 'easeIn', 'easeOut', 'easeInOut', 'step']);
    var n = 0; g.forEach(function (x) { n += x.presets.length; });
    assert.strictEqual(n, E.PRESETS.filter(function (p) { return p.cat === 'BASIC'; }).length);
    assert.deepStrictEqual(g[2].presets.map(function (p) { return p.id; }), ['circ', 'circIn', 'circOut', 'circInOut']);
});
test('no preset is listed in two groups or categories, ids are unique', function () {
    var seen = {};
    E.CATEGORIES.forEach(function (c) { E.groupsOf(c).forEach(function (g) { g.presets.forEach(function (p) { assert.ok(!seen[p.id], 'duplicate ' + p.id); seen[p.id] = c; }); }); });
    assert.strictEqual(Object.keys(seen).length, E.PRESETS.length);
});
test('every preset builds a finite curve (native / sampled / linear)', function () {
    E.PRESETS.forEach(function (p) {
        var c = E.build(E.stateFor(p.id));
        assert.ok(['linear', 'native', 'sampled'].indexOf(c.mode) >= 0, p.id);
        c.preview.forEach(function (pt) { assert.ok(isFinite(pt[0]) && isFinite(pt[1]), p.id); });
        assert.ok(Math.abs(c.preview[c.preview.length - 1][1] - 1) < 1e-9, p.id + ' must end at 1');
    });
});
test('engine state no longer carries random/seed', function () {
    var s = E.stateFor('easeIn'); assert.strictEqual(s.random, undefined); assert.strictEqual(s.seed, undefined);
});
test('native presets keep their bezier handles (regression)', function () {
    var c = E.build(E.stateFor('easeInOut')); assert.strictEqual(c.mode, 'native'); assert.deepStrictEqual(c.bez, [1 / 3, 0, 2 / 3, 1]);
    assert.strictEqual(E.build(E.stateFor('linear')).mode, 'linear');
    assert.strictEqual(E.build(E.stateFor('step')).hold, true);
});

/* -------- direct manipulation: handle -> parameter -> curve, for Overshoot / Bounce / Elastic */
var FAMILIES = {
    back: ['overshoot', 'back', 'backIn', 'backOut', 'backInOut'],
    bounce: ['bounce', 'bounceIn', 'bounceOut', 'bounceInOut'],
    elastic: ['elastic', 'elasticIn', 'elasticOut', 'elasticInOut']
};
Object.keys(FAMILIES).forEach(function (fam) {
    FAMILIES[fam].forEach(function (id) {
        test(fam + ': ' + id + ' has handles that lie on the curve', function () {
            var st = E.stateFor(id), hs = E.handlesOf(st), fn = E.E[E.BY_ID[id].fn];
            assert.strictEqual(E.familyOf(st), fam); assert.ok(hs.length >= 1);
            var opts = { s: 1.70158 * st.overshoot / 100, a: st.overshoot / 100, e: 0.1 + 0.8 * st.bounce / 100, p: Math.max(0.05, 0.6 * (1 - st.bounce / 100)) };
            hs.forEach(function (h) { assert.ok(Math.abs(fn(h.x, opts) - h.y) < 0.02, id + ' handle off curve: ' + JSON.stringify(h) + ' vs ' + fn(h.x, opts)); });
        });
        test(fam + ': dragging a ' + id + ' handle changes the parameter and the generated keyframes', function () {
            var st = E.stateFor(id), before = JSON.stringify(E.build(st).values), hs = E.handlesOf(st), p0 = [st.overshoot, st.bounce];
            // move handle 0 clearly away from where it is
            var tgt = fam === 'back' ? { x: hs[0].x, y: hs[0].y + (hs[0].y > 0.5 ? 0.12 : -0.12) } :
                fam === 'bounce' ? { x: hs[0].x, y: hs[0].y + (hs[0].y > 0.5 ? -0.1 : 0.1) } : { x: hs[0].x * 0.7, y: hs[0].y + (hs[0].y > 0.5 ? 0.25 : -0.25) };
            assert.ok(E.dragHandle(st, 0, tgt.x, tgt.y));
            assert.notDeepStrictEqual([st.overshoot, st.bounce], p0, 'parameters unchanged');
            assert.notStrictEqual(JSON.stringify(E.build(st).values), before, 'keyframes unchanged');
        });
        test(fam + ': ' + id + ' handle round-trips (drag to where it already is = no change)', function () {
            var st = E.stateFor(id), hs = E.handlesOf(st), p0 = [st.overshoot, st.bounce];
            hs.forEach(function (h, i) { E.dragHandle(st, i, h.x, h.y); });
            assert.ok(Math.abs(st.overshoot - p0[0]) < 0.6 && Math.abs(st.bounce - p0[1]) < 0.6, id + ' drifted: ' + [st.overshoot, st.bounce] + ' vs ' + p0);
        });
    });
});
test('back: dragging the peak up/down monotonically increases/decreases overshoot, clamped to 0..300', function () {
    var st = E.stateFor('overshoot'), last = -1, y;
    for (y = 1.0; y <= 1.5; y += 0.05) { E.dragHandle(st, 0, 0.5, y); assert.ok(st.overshoot >= last); last = st.overshoot; }
    E.dragHandle(st, 0, 0.5, 5); assert.strictEqual(st.overshoot, 300);
    E.dragHandle(st, 0, 0.5, 0); assert.strictEqual(st.overshoot, 0);
});
test('elastic: horizontal drag changes frequency, vertical drag changes amplitude', function () {
    var st = E.stateFor('elastic'), h = E.handlesOf(st)[0], b0 = st.bounce, o0 = st.overshoot;
    E.dragHandle(st, 0, h.x * 0.5, h.y); assert.ok(st.bounce > b0, 'closer to start = faster oscillation'); assert.ok(Math.abs(st.overshoot - o0) < 40);
    var st2 = E.stateFor('elastic'), h2 = E.handlesOf(st2)[0];
    E.dragHandle(st2, 0, h2.x, 1 + (h2.y - 1) * 2); assert.ok(st2.overshoot > o0); assert.ok(Math.abs(st2.bounce - b0) < 1);
});
test('presets without handles (bezier, step, smoothStep) report none', function () {
    ['easeIn', 'step', 'smoothStep', 'expo', 'linear'].forEach(function (id) { assert.deepStrictEqual(E.handlesOf(E.stateFor(id)), [], id); assert.strictEqual(E.familyOf(E.stateFor(id)), null); });
    assert.strictEqual(E.dragHandle(E.stateFor('easeIn'), 0, 0.5, 0.5), false);
});

test('Step preset: the steps parameter sets how many stairs the curve has', function () {
    var E = require('../js/graph-presets.js'); E = E.Engine || E;
    [3, 5, 12].forEach(function (n) { var st = E.stateFor('step'); st.steps = n; var c = E.build(st); assert.strictEqual(c.times.length, n - 1, n + ' steps'); });
});
