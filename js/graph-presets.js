/* Zelf-Xtens | js/graph-presets.js : easing engine + preset registry.
 * Pure functions, no DOM: usable in the panel (window.ZX.Engine) and in Node tests (module.exports).
 *
 * Every curve is normalised:  t 0..1  ->  value 0..1  (may leave 0..1 for overshoot).
 * The panel turns a curve into one of three AE strategies (see build()):
 *   linear  : both keys LINEAR
 *   native  : cubic-bezier(x1,y1,x2,y2) -> speed/influence on the 2 keys  (no extra keyframes)
 *   sampled : intermediate keyframes (bounce, elastic, back, step, anything post-processed)
 */
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else { root.ZX = root.ZX || {}; root.ZX.Engine = api; }
})(this, function () {
    'use strict';
    var PI = Math.PI, pow = Math.pow, sin = Math.sin, cos = Math.cos, sqrt = Math.sqrt;
    function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

    /* ---------------------------------------------------- easing functions */
    function mirrorIn(out) { return function (t, o) { return 1 - out(1 - t, o); }; }
    function mirrorInOut(out) { return function (t, o) { return t < 0.5 ? (1 - out(1 - 2 * t, o)) / 2 : (1 + out(2 * t - 1, o)) / 2; }; }
    function num(o, k, d) { return (o && o[k] !== undefined && o[k] !== null) ? o[k] : d; }

    var E = {};
    E.linear = function (t) { return t; };
    E.easeIn = function (t) { return t * t; };
    E.easeOut = function (t) { return 1 - (1 - t) * (1 - t); };
    E.easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - pow(-2 * t + 2, 2) / 2; };
    E.smoothStep = function (t) { return t * t * (3 - 2 * t); };

    // Back: o.s = overshoot constant (1.70158 = classic)
    E.backIn = function (t, o) { var s = num(o, 's', 1.70158); return (s + 1) * t * t * t - s * t * t; };
    E.backOut = function (t, o) { var s = num(o, 's', 1.70158), u = t - 1; return 1 + (s + 1) * u * u * u + s * u * u; };
    E.backInOut = function (t, o) {
        var s = num(o, 's', 1.70158) * 1.525, u = t * 2;
        return u < 1 ? (u * u * ((s + 1) * u - s)) / 2 : ((u - 2) * (u - 2) * ((s + 1) * (u - 2) + s) + 2) / 2;
    };

    // Bounce: a ball dropped on the target. o.e = restitution (0.5 reproduces the classic easings.net curve).
    // Fall time 1, bounce k lasts 2*e^k and peaks at e^(2k); 4 bounces, normalised to t 0..1.
    E.bounceOut = function (t, o) {
        var e = clamp(num(o, 'e', 0.5), 0.05, 0.9), n = 4, T = 1, k, x, c, d, u;
        for (k = 1; k <= n; k++) T += 2 * pow(e, k);
        x = t * T;
        if (x <= 1) return x * x;
        c = 1;
        for (k = 1; k <= n; k++) {
            d = 2 * pow(e, k);
            if (x <= c + d) { u = (x - c) / pow(e, k) - 1; return 1 - pow(e, 2 * k) * (1 - u * u); }
            c += d;
        }
        return 1;
    };
    E.bounceIn = mirrorIn(E.bounceOut);
    E.bounceInOut = mirrorInOut(E.bounceOut);

    // Elastic: o.a amplitude (1 = classic), o.p period (0.3 = classic)
    E.elasticOut = function (t, o) {
        if (t <= 0) return 0; if (t >= 1) return 1;
        var a = num(o, 'a', 1), p = num(o, 'p', 0.3);
        return a * pow(2, -10 * t) * sin((t - p / 4) * 2 * PI / p) + 1;
    };
    E.elasticIn = mirrorIn(E.elasticOut);
    E.elasticInOut = mirrorInOut(E.elasticOut);

    E.expoIn = function (t) { return t <= 0 ? 0 : pow(2, 10 * t - 10); };
    E.expoOut = function (t) { return t >= 1 ? 1 : 1 - pow(2, -10 * t); };
    E.expoInOut = function (t) { return t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? pow(2, 20 * t - 10) / 2 : (2 - pow(2, -20 * t + 10)) / 2; };
    E.sineIn = function (t) { return 1 - cos(t * PI / 2); };
    E.sineOut = function (t) { return sin(t * PI / 2); };
    E.sineInOut = function (t) { return -(cos(PI * t) - 1) / 2; };
    E.circIn = function (t) { return 1 - sqrt(1 - t * t); };
    E.circOut = function (t) { return sqrt(1 - (t - 1) * (t - 1)); };
    E.circInOut = function (t) { return t < 0.5 ? (1 - sqrt(1 - 4 * t * t)) / 2 : (sqrt(1 - pow(-2 * t + 2, 2)) + 1) / 2; };

    /* ------------------------------------------------------------ cubic bezier */
    /** y for a given x on cubic-bezier(x1,y1,x2,y2) (control points P0=(0,0), P3=(1,1)). */
    function bezierY(b, x) {
        if (x <= 0) return 0;
        if (x >= 1) return 1;
        var lo = 0, hi = 1, u = x, i, m;
        for (i = 0; i < 26; i++) {
            m = 1 - u;
            var cx = 3 * m * m * u * b[0] + 3 * m * u * u * b[2] + u * u * u;
            if (cx < x) lo = u; else hi = u;
            u = (lo + hi) / 2;
        }
        m = 1 - u;
        return 3 * m * m * u * b[1] + 3 * m * u * u * b[3] + u * u * u;
    }

    /* ---------------------------------------------------------------- presets
     * kind: 'linear' | 'bez' (native cubic-bezier) | 'fn' (function, sampled) | 'step'
     * defaults: slider/setting values applied when the preset is chosen
     */
    // Smooth / Circ / Sine / Expo live inside BASIC as sub-groups (see SUBS); there is no separate category for them.
    var CATEGORIES = ['BASIC', 'BACK', 'BOUNCE', 'ELASTIC', 'CUSTOM'];
    var SUBS = { BASIC: ['Standard', 'Smooth', 'Circ', 'Sine', 'Expo'] };
    var PRESETS = [];
    function P(id, name, cat, kind, extra) {
        var o = { id: id, name: name, cat: cat, kind: kind }, k;
        if (extra) for (k in extra) o[k] = extra[k];
        PRESETS.push(o);
    }
    P('linear', 'Linear', 'BASIC', 'linear', { sub: 'Standard', bez: [1 / 3, 1 / 3, 2 / 3, 2 / 3] });
    P('easeIn', 'Ease In', 'BASIC', 'bez', { sub: 'Standard', bez: [0.42, 0, 1, 1] });
    P('easeOut', 'Ease Out', 'BASIC', 'bez', { sub: 'Standard', bez: [0, 0, 0.58, 1] });
    P('easeInOut', 'Ease In Out', 'BASIC', 'bez', { sub: 'Standard', bez: [1 / 3, 0, 2 / 3, 1] });     // = AE "Easy Ease"
    P('step', 'Step', 'BASIC', 'step', { sub: 'Standard', defaults: { steps: 5 } });

    P('smooth', 'Smooth', 'BASIC', 'bez', { sub: 'Smooth', bez: [0.4, 0, 0.2, 1] });
    P('softEase', 'Soft Ease', 'BASIC', 'bez', { sub: 'Smooth', bez: [0.25, 0.1, 0.25, 1] });
    P('strongEase', 'Strong Ease', 'BASIC', 'bez', { sub: 'Smooth', bez: [0.8, 0, 0.2, 1] });
    P('smoothStep', 'Smooth Step', 'BASIC', 'fn', { sub: 'Smooth', fn: 'smoothStep', defaults: { samples: 12 } });

    P('circ', 'Circ', 'BASIC', 'bez', { sub: 'Circ', bez: [0.785, 0.135, 0.15, 0.86] });
    P('circIn', 'Circ In', 'BASIC', 'bez', { sub: 'Circ', bez: [0.55, 0, 1, 0.45] });
    P('circOut', 'Circ Out', 'BASIC', 'bez', { sub: 'Circ', bez: [0, 0.55, 0.45, 1] });
    P('circInOut', 'Circ In Out', 'BASIC', 'bez', { sub: 'Circ', bez: [0.85, 0, 0.15, 1] });

    P('sine', 'Sine', 'BASIC', 'bez', { sub: 'Sine', bez: [0.445, 0.05, 0.55, 0.95] });
    P('sineIn', 'Sine In', 'BASIC', 'bez', { sub: 'Sine', bez: [0.12, 0, 0.39, 0] });
    P('sineOut', 'Sine Out', 'BASIC', 'bez', { sub: 'Sine', bez: [0.61, 1, 0.88, 1] });
    P('sineInOut', 'Sine In Out', 'BASIC', 'bez', { sub: 'Sine', bez: [0.37, 0, 0.63, 1] });

    P('expo', 'Expo', 'BASIC', 'bez', { sub: 'Expo', bez: [1, 0, 0, 1] });
    P('expoIn', 'Expo In', 'BASIC', 'bez', { sub: 'Expo', bez: [0.7, 0, 0.84, 0] });
    P('expoOut', 'Expo Out', 'BASIC', 'bez', { sub: 'Expo', bez: [0.16, 1, 0.3, 1] });
    P('expoInOut', 'Expo In Out', 'BASIC', 'bez', { sub: 'Expo', bez: [0.87, 0, 0.13, 1] });

    P('overshoot', 'Overshoot', 'BACK', 'fn', { fn: 'backOut', defaults: { overshoot: 160, samples: 16 } });
    P('back', 'Back', 'BACK', 'fn', { fn: 'backInOut', defaults: { overshoot: 70, samples: 20 } });
    P('backIn', 'Back In', 'BACK', 'fn', { fn: 'backIn', defaults: { samples: 16 } });
    P('backOut', 'Back Out', 'BACK', 'fn', { fn: 'backOut', defaults: { samples: 16 } });
    P('backInOut', 'Back In Out', 'BACK', 'fn', { fn: 'backInOut', defaults: { samples: 20 } });

    P('bounce', 'Bounce', 'BOUNCE', 'fn', { fn: 'bounceOut', defaults: { bounce: 62, samples: 36 } });
    P('bounceIn', 'Bounce In', 'BOUNCE', 'fn', { fn: 'bounceIn', defaults: { samples: 32 } });
    P('bounceOut', 'Bounce Out', 'BOUNCE', 'fn', { fn: 'bounceOut', defaults: { samples: 32 } });
    P('bounceInOut', 'Bounce In Out', 'BOUNCE', 'fn', { fn: 'bounceInOut', defaults: { samples: 40 } });

    P('elastic', 'Elastic', 'ELASTIC', 'fn', { fn: 'elasticOut', defaults: { bounce: 62, overshoot: 120, samples: 40 } });
    P('elasticIn', 'Elastic In', 'ELASTIC', 'fn', { fn: 'elasticIn', defaults: { samples: 36 } });
    P('elasticOut', 'Elastic Out', 'ELASTIC', 'fn', { fn: 'elasticOut', defaults: { samples: 36 } });
    P('elasticInOut', 'Elastic In Out', 'ELASTIC', 'fn', { fn: 'elasticInOut', defaults: { samples: 44 } });

    /** Presets of a category as display groups: [{title|null, presets}]. BASIC is split by SUBS. */
    function groupsOf(cat) {
        var list = PRESETS.filter(function (p) { return p.cat === cat; }), subs = SUBS[cat];
        if (!subs) return [{ title: null, presets: list }];
        return subs.map(function (s) { return { title: s, presets: list.filter(function (p) { return p.sub === s; }) }; });
    }

    var BY_ID = {};
    PRESETS.forEach(function (p) { BY_ID[p.id] = p; });
    var CUSTOM = { id: 'custom', name: 'Custom', cat: 'CUSTOM', kind: 'bez', bez: [0.42, 0, 0.58, 1] };
    BY_ID.custom = CUSTOM;

    /* ----------------------------------------------------------------- state */
    var BASE = { overshoot: 100, bounce: 50, smoothing: 0, samples: 24, steps: 5, replace: false };

    /** Fresh state for a preset id (preset defaults on top of BASE). */
    function stateFor(id) {
        var p = BY_ID[id] || BY_ID.easeInOut, s = {}, k;
        for (k in BASE) s[k] = BASE[k];
        if (p.defaults) for (k in p.defaults) s[k] = p.defaults[k];
        s.preset = p.id;
        s.bez = (p.bez || CUSTOM.bez).slice(0);
        return s;
    }

    /* ----------------------------------------------------------------- build */
    function optsFrom(st) {
        var b = clamp(st.bounce, 0, 100), ov = clamp(st.overshoot, 0, 300);
        return { s: 1.70158 * ov / 100, a: ov / 100, e: 0.1 + 0.8 * b / 100, p: Math.max(0.05, 0.6 * (1 - b / 100)) };
    }

    function smoothPass(ys, radius) {
        var n = ys.length, out = ys.slice(0), i, j, s, c;
        for (i = 1; i < n - 1; i++) {
            s = 0; c = 0;
            for (j = -radius; j <= radius; j++) { var k = i + j; if (k >= 0 && k < n) { s += ys[k]; c++; } }
            out[i] = s / c;
        }
        return out;
    }

    /**
     * Build the curve for a state.
     * -> { mode:'linear'|'native'|'sampled', bez?, times?, values?, hold?, preview:[[x,y]...], info:string }
     * times/values are the INTERIOR points only (AE already has the start/end keyframes).
     */
    function build(st) {
        var p = BY_ID[st.preset] || CUSTOM, kind = p.kind, opts = optsFrom(st), i, t;
        var wantsMods = st.smoothing > 0;

        if (kind === 'linear' && !wantsMods) return { mode: 'linear', preview: [[0, 0], [1, 1]], info: 'Linear: 2 keys, no extra keyframes' };

        if ((kind === 'bez' || kind === 'linear') && !wantsMods) {
            var pv = [];
            for (i = 0; i <= 64; i++) pv.push([i / 64, bezierY(st.bez, i / 64)]);
            return { mode: 'native', bez: st.bez.slice(0), preview: pv, info: 'Native ease: 2 keys, no extra keyframes' };
        }

        // ---- sampled ----
        var N, xs = [], ys = [], hold = false, base;
        if (kind === 'step') {
            var steps = Math.max(2, Math.round(st.steps));
            hold = true; N = steps;
            for (i = 0; i <= steps; i++) { xs.push(i / steps); ys.push(i >= steps ? 1 : Math.min(1, i / (steps - 1))); }
        } else {
            N = clamp(Math.round(st.samples), 2, 200);
            for (i = 0; i <= N; i++) {
                t = i / N;
                if (kind === 'fn') base = E[p.fn](t, opts);
                else if (kind === 'bez' || kind === 'linear') base = bezierY(st.bez, t);
                else base = t;
                xs.push(t); ys.push(base);
            }
            ys[0] = 0; ys[N] = 1;
            if (st.smoothing > 0) {
                var radius = Math.max(1, Math.round(clamp(st.smoothing, 0, 100) / 100 * N / 6));
                ys = smoothPass(ys, radius); ys[0] = 0; ys[N] = 1;
            }
        }
        var times = [], values = [], prev = [];
        for (i = 1; i < N; i++) { times.push(xs[i]); values.push(ys[i]); }
        if (hold) { for (i = 0; i < N; i++) { prev.push([xs[i], ys[i]]); prev.push([xs[i + 1], ys[i]]); } prev.push([1, 1]); }
        else for (i = 0; i <= N; i++) prev.push([xs[i], ys[i]]);
        return { mode: 'sampled', times: times, values: values, hold: hold, preview: prev, info: 'Sampled: ' + (N - 1) + ' extra keyframes' };
    }

    /* ------------------------------------------------------ direct-manipulation handles
     * Overshoot (Back), Bounce and Elastic curves expose draggable handles that sit ON the curve.
     * handlesOf(st) -> [{x,y}] in curve space; dragHandle(st, i, x, y) writes the matching parameters
     * (st.overshoot 0..300, st.bounce 0..100) so graph, sliders and the generated keyframes stay in sync.
     *   back    : handle on each extremum, vertical drag = overshoot amount
     *   bounce  : handle on the first (largest) rebound, vertical drag = restitution (bounce %)
     *   elastic : handle on the first swing, horizontal drag = period (frequency), vertical = amplitude
     */
    var FAMILY = {
        backIn: 'back', backOut: 'back', backInOut: 'back',
        bounceIn: 'bounce', bounceOut: 'bounce', bounceInOut: 'bounce',
        elasticIn: 'elastic', elasticOut: 'elastic', elasticInOut: 'elastic'
    };
    var BACK_H = {
        backOut: [{ up: true, lo: 0, hi: 1 }],
        backIn: [{ up: false, lo: 0, hi: 1 }],
        backInOut: [{ up: false, lo: 0, hi: 0.5 }, { up: true, lo: 0.5, hi: 1 }]
    };
    function fnOf(st) { var p = BY_ID[st.preset]; return (p && p.kind === 'fn') ? p.fn : null; }
    function familyOf(st) { var f = fnOf(st); return (f && FAMILY[f]) ? FAMILY[f] : null; }

    function backScan(fn, ov, h) {
        var o = { s: 1.70158 * ov / 100 }, n = 200, i, t, v, bx = h.hi, by = E[fn](h.hi, o);
        for (i = 0; i <= n; i++) {
            t = h.lo + (h.hi - h.lo) * i / n; v = E[fn](t, o);
            if (h.up ? v > by : v < by) { by = v; bx = t; }
        }
        return { x: bx, y: by };
    }
    function bounceGeom(st) {
        var e = optsFrom(st).e, T = 1, k;
        for (k = 1; k <= 4; k++) T += 2 * pow(e, k);
        return { e: e, to: (1 + e) / T };
    }
    function elasticGeom(st) {
        var o = optsFrom(st), A = o.a * pow(2, -5 * o.p);
        return { p: o.p, A: A };
    }
    function pctFromE(e) { return clamp((e - 0.1) / 0.8 * 100, 0, 100); }

    function handlesOf(st) {
        var fam = familyOf(st), fn = fnOf(st), out = [], g, i, hs, r;
        if (!fam) return out;
        if (fam === 'back') {
            hs = BACK_H[fn];
            for (i = 0; i < hs.length; i++) { r = backScan(fn, clamp(st.overshoot, 0, 300), hs[i]); out.push({ x: r.x, y: r.y }); }
        } else if (fam === 'bounce') {
            g = bounceGeom(st);
            if (fn === 'bounceOut') out.push({ x: g.to, y: 1 - g.e * g.e });
            else if (fn === 'bounceIn') out.push({ x: 1 - g.to, y: g.e * g.e });
            else { out.push({ x: (1 - g.to) / 2, y: g.e * g.e / 2 }); out.push({ x: (1 + g.to) / 2, y: 1 - g.e * g.e / 2 }); }
        } else {
            g = elasticGeom(st);
            if (fn === 'elasticOut') out.push({ x: g.p / 2, y: 1 + g.A });
            else if (fn === 'elasticIn') out.push({ x: 1 - g.p / 2, y: -g.A });
            else { out.push({ x: (1 - g.p / 2) / 2, y: -g.A / 2 }); out.push({ x: (1 + g.p / 2) / 2, y: 1 + g.A / 2 }); }
        }
        return out;
    }

    /** Move handle i to curve-space (x,y). Mutates st; returns true when a parameter was written. */
    function dragHandle(st, i, x, y) {
        var fam = familyOf(st), fn = fnOf(st), h, lo, hi, m, it, d, base, e, p, A, a;
        if (!fam) return false;
        if (fam === 'back') {
            h = BACK_H[fn][i]; if (!h) return false;
            base = h.up ? 1 : 0;
            d = Math.max(0, h.up ? y - 1 : -y);
            lo = 0; hi = 300;
            if (d >= Math.abs(backScan(fn, hi, h).y - base)) { st.overshoot = hi; return true; }
            for (it = 0; it < 28; it++) {
                m = (lo + hi) / 2;
                if (Math.abs(backScan(fn, m, h).y - base) < d) lo = m; else hi = m;
            }
            st.overshoot = Math.round((lo + hi) / 2 * 10) / 10;
            return true;
        }
        if (fam === 'bounce') {
            if (fn === 'bounceOut') e = sqrt(clamp(1 - y, 0, 1));
            else if (fn === 'bounceIn') e = sqrt(clamp(y, 0, 1));
            else e = (i === 0) ? sqrt(clamp(2 * y, 0, 1)) : sqrt(clamp(2 * (1 - y), 0, 1));
            st.bounce = Math.round(pctFromE(e) * 10) / 10;
            return true;
        }
        // elastic
        if (fn === 'elasticOut') { p = 2 * x; A = y - 1; }
        else if (fn === 'elasticIn') { p = 2 * (1 - x); A = -y; }
        else if (i === 0) { p = 2 * (1 - 2 * x); A = -2 * y; }
        else { p = 2 * (2 * x - 1); A = 2 * (y - 1); }
        p = clamp(p, 0.05, 0.6); A = Math.max(0, A);
        a = A * pow(2, 5 * p);
        st.overshoot = Math.round(clamp(a * 100, 0, 300) * 10) / 10;
        st.bounce = Math.round(clamp(100 * (1 - p / 0.6), 0, 100) * 10) / 10;
        return true;
    }

    return {
        E: E, PRESETS: PRESETS, CATEGORIES: CATEGORIES, SUBS: SUBS, BY_ID: BY_ID, CUSTOM: CUSTOM, BASE: BASE,
        stateFor: stateFor, build: build, bezierY: bezierY, groupsOf: groupsOf,
        familyOf: familyOf, handlesOf: handlesOf, dragHandle: dragHandle
    };
});
