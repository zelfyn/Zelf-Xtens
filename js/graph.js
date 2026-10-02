/* Zelf-Xtens | js/graph.js : GRAPH tab (square curve editor + preset tiles with curve thumbnails). */
(function (root) {
    'use strict';
    var ZX = root.ZX, UI = ZX.UI, Engine = ZX.Engine, Bridge = ZX.Bridge;

    var yMin = -0.15, yMax = 1.15, PAD = { l: 26, r: 10, t: 8, b: 16 };
    var COL = { ac: '#00e676', bg: '#020403', grid: '#15201a', gridHi: '#2a3a30', axis: '#3e5246', label: '#8a9a90', tx: '#f4f8f5', warn: '#ff5252' };
    var st = null, curve = null, custom = [], activeCustom = null;
    var canvas, ctx, W = 0, H = 0, dpr = 1, drag = -1, playT = -1, playStart = 0;
    var ui = {}, catId = 'BASIC', query = '', thumbCache = {}, overMode = false;   // overMode: bezier handles may leave 0..100%
    var KNOWN_KEYS = ['preset', 'bez', 'overshoot', 'bounce', 'smoothing', 'samples', 'steps', 'replace'];

    /** Keep only keys the engine still knows (drops stale ones such as the removed Random settings). */
    function cleanSnap(snap) {
        var o = {}, i, k;
        for (i = 0; i < KNOWN_KEYS.length; i++) { k = KNOWN_KEYS[i]; if (snap && snap[k] !== undefined) o[k] = snap[k]; }
        if (!(o.bez && o.bez.length === 4)) delete o.bez;
        if (o.preset !== 'custom' && !Engine.BY_ID[o.preset]) { o.preset = 'custom'; }   // removed preset (Random): keep its bezier as a custom curve
        return o;
    }
    function loadState() {
        var saved = UI.store.get('graph', null), k, snap;
        st = Engine.stateFor('easeInOut');
        if (saved && Engine.BY_ID[saved.preset]) { snap = cleanSnap(saved); for (k in snap) if (snap.hasOwnProperty(k)) st[k] = snap[k]; }
        custom = UI.store.get('graph.custom', []).map(function (c) { c.snap = cleanSnap(c.snap); return c; });
        overMode = !!UI.store.get('graph.over', false);
        catId = UI.store.get('graph.cat', 'BASIC');
        if (Engine.CATEGORIES.indexOf(catId) < 0) catId = 'BASIC';          // category no longer exists (e.g. SMOOTH, EXPO, RANDOM)
    }
    var persist = UI.debounce(function () { UI.store.set('graph', st); }, 400);

    /* ------------------------------------------------------- coordinates */
    function px(x) { return PAD.l + x * (W - PAD.l - PAD.r); }
    function py(y) { return PAD.t + (yMax - y) / (yMax - yMin) * (H - PAD.t - PAD.b); }
    function ix(X) { return (X - PAD.l) / (W - PAD.l - PAD.r); }
    function iy(Y) { return yMax - (Y - PAD.t) / (H - PAD.t - PAD.b) * (yMax - yMin); }
    function isBez() { var p = Engine.BY_ID[st.preset]; return !!p && (p.kind === 'bez' || p.kind === 'linear'); }
    /** Bezier curve whose two handles the user can drag (Basic curves). */
    function bezEditable() { return isBez() && !!curve && curve.mode !== 'sampled'; }
    function bezOutside() { var b = st.bez; return !!b && (b[1] < 0 || b[1] > 1 || b[3] < 0 || b[3] > 1); }
    function setMode(over) {
        overMode = !!over; UI.store.set('graph.over', overMode);
        if (!overMode && isBez() && bezOutside()) {                           // back to Normal: pull the handles into 0..100%
            st.bez[1] = Math.min(1, Math.max(0, st.bez[1])); st.bez[3] = Math.min(1, Math.max(0, st.bez[3])); activeCustom = null;
            curve = Engine.build(st); paintPresets();
        }
        if (ui.mode) ui.mode.set(overMode ? 'over' : 'normal');
        recompute();
    }
    function round(v) { return Math.round(v * 1000) / 1000; }
    function readTheme() {
        var cs = root.getComputedStyle(root.document.documentElement), k, map = { ac: '--ac', bg: '--cv-bg', grid: '--cv-grid', gridHi: '--cv-grid-hi', axis: '--cv-axis', label: '--cv-label', tx: '--tx', warn: '--err' };
        for (k in map) { var v = (cs.getPropertyValue(map[k]) || '').trim(); if (v) COL[k] = v; }
    }
    /** Vertical range follows the curve (overshoot / elastic can leave 0..1). Frozen while a handle is dragged. */
    function computeRange() {
        var pv = curve.preview, lo = 0, hi = 1, i;
        for (i = 0; i < pv.length; i++) { if (pv[i][1] < lo) lo = pv[i][1]; if (pv[i][1] > hi) hi = pv[i][1]; }
        yMin = Math.min(-0.15, lo - 0.1); yMax = Math.max(1.15, hi + 0.1);
        if (bezEditable() && overMode) { yMin = Math.min(-0.6, lo - 0.2); yMax = Math.max(1.6, hi + 0.2); }   // room to drag past 0% / 100%
    }
    /** Handles currently editable on the canvas: bezier control points, or the on-curve handles of Back / Bounce / Elastic. */
    function handleList() {
        if (isBez() && curve.mode !== 'sampled') { var b = st.bez; return [{ x: b[0], y: b[1] }, { x: b[2], y: b[3] }]; }
        return Engine.handlesOf(st);
    }
    function readout() {
        var f = Engine.familyOf(st);
        if (f === 'back') return 'Overshoot ' + Math.round(st.overshoot) + '%';
        if (f === 'bounce') return 'Bounce ' + Math.round(st.bounce) + '%';
        if (f === 'elastic') return 'Amplitude ' + Math.round(st.overshoot) + '%  Frequency ' + Math.round(st.bounce) + '%';
        return '';
    }

    /* ---------------------------------------------------------- drawing */
    var draw = UI.raf(function () {
        if (!ctx || !W) return;
        var c = ctx, i, hl, fam = Engine.familyOf(st);
        c.setTransform(dpr, 0, 0, dpr, 0, 0);
        c.clearRect(0, 0, W, H);
        c.font = '10px Segoe UI, Arial, sans-serif';
        c.lineWidth = 1;
        for (i = 0; i <= 4; i++) {
            c.strokeStyle = (i === 0 || i === 4) ? COL.gridHi : COL.grid;
            c.beginPath(); c.moveTo(Math.round(px(i / 4)) + 0.5, PAD.t); c.lineTo(Math.round(px(i / 4)) + 0.5, H - PAD.b); c.stroke();
        }
        [0, 0.5, 1].forEach(function (y) {
            c.strokeStyle = (y === 0 || y === 1) ? COL.axis : COL.grid;
            c.beginPath(); c.moveTo(PAD.l, Math.round(py(y)) + 0.5); c.lineTo(W - PAD.r, Math.round(py(y)) + 0.5); c.stroke();
        });
        c.fillStyle = COL.label; c.textAlign = 'right';
        [0, 50, 100].forEach(function (v) { c.fillText(v + '%', PAD.l - 4, py(v / 100) + 3); });
        c.textAlign = 'center';
        c.fillText('start', px(0) + 8, H - 4); c.fillText('time', px(0.5), H - 4); c.fillText('end', px(1) - 8, H - 4);

        var pv = curve.preview;
        hl = handleList();
        if (fam && hl.length) {                                               // dashed level lines through the handles
            c.save(); c.setLineDash([4, 4]); c.strokeStyle = COL.axis; c.lineWidth = 1;
            hl.forEach(function (h) { c.beginPath(); c.moveTo(PAD.l, Math.round(py(h.y)) + 0.5); c.lineTo(W - PAD.r, Math.round(py(h.y)) + 0.5); c.stroke(); });
            c.restore();
        }
        c.strokeStyle = COL.ac; c.lineWidth = 2.2; c.lineJoin = 'round';
        c.beginPath();
        for (i = 0; i < pv.length; i++) { if (i === 0) c.moveTo(px(pv[i][0]), py(pv[i][1])); else c.lineTo(px(pv[i][0]), py(pv[i][1])); }
        c.stroke();
        if (curve.mode === 'sampled' && !curve.hold) {                       // the keys that will be created
            c.fillStyle = COL.ac;
            for (i = 1; i < pv.length - 1; i++) c.fillRect(px(pv[i][0]) - 1.5, py(pv[i][1]) - 1.5, 3, 3);
        }
        if (isBez() && curve.mode !== 'sampled') {                            // bezier control lines
            var b = st.bez;
            c.lineWidth = 1; c.strokeStyle = COL.axis;
            c.beginPath(); c.moveTo(px(0), py(0)); c.lineTo(px(b[0]), py(b[1])); c.moveTo(px(1), py(1)); c.lineTo(px(b[2]), py(b[3])); c.stroke();
        }
        hl.forEach(function (h, k) {                                          // draggable handles (all families)
            c.beginPath(); c.arc(px(h.x), py(h.y), 6, 0, 6.2832);
            c.fillStyle = (drag === k) ? COL.ac : '#ffffff'; c.fill();
            c.lineWidth = 2; c.strokeStyle = (drag === k) ? '#ffffff' : COL.ac; c.stroke();
        });
        [[0, 0], [1, 1]].forEach(function (e) {
            c.beginPath(); c.arc(px(e[0]), py(e[1]), 4, 0, 6.2832); c.fillStyle = COL.tx; c.fill();
        });
        if (drag >= 0 && fam) { c.fillStyle = COL.tx; c.textAlign = 'left'; c.fillText(readout(), PAD.l + 6, PAD.t + 10); }
        if (playT >= 0) {
            var y = valueAt(playT);
            c.beginPath(); c.arc(px(playT), py(y), 5, 0, 6.2832); c.fillStyle = COL.warn; c.fill();
            c.fillStyle = COL.tx; c.textAlign = 'left';
            c.fillText(Math.round(playT * 100) + '% time  ' + Math.round(y * 100) + '% value', PAD.l + 6, PAD.t + 10);
        }
    });

    function valueAt(t) {
        var pv = curve.preview, i;
        if (curve.hold) { var v = 0; for (i = 0; i < pv.length; i++) { if (pv[i][0] <= t + 1e-9) v = pv[i][1]; } return v; }
        for (i = 1; i < pv.length; i++) {
            if (pv[i][0] >= t) { var a = pv[i - 1], b = pv[i], w = (b[0] - a[0]) < 1e-9 ? 0 : (t - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * w; }
        }
        return 1;
    }

    /** The editor is always a square: height follows the available width. */
    function resize() {
        canvas.style.height = '';
        var r = canvas.getBoundingClientRect();
        if (!r.width) return;
        dpr = root.devicePixelRatio || 1;
        W = Math.round(r.width); H = W;
        canvas.style.height = H + 'px';
        canvas.width = W * dpr; canvas.height = H * dpr;
        readTheme(); draw();
    }

    /* ------------------------------------------------------------ state */
    function recompute() {
        curve = Engine.build(st);
        if (!overMode && bezEditable() && bezOutside()) { overMode = true; UI.store.set('graph.over', true); }   // a curve that already leaves 0..100% (saved / custom) is shown, never cut
        if (ui.mode) { ui.mode.set(overMode ? 'over' : 'normal'); ui.mode.el.hidden = !bezEditable(); }
        computeRange(); draw(); persist();
    }
    function syncUI() {
        var f = Engine.familyOf(st), p = Engine.BY_ID[st.preset], sampled = !!p && (p.kind === 'fn' || p.kind === 'step');
        ui.replace.checked = !!st.replace;
        ui.sOver.el.hidden = f !== 'back'; ui.sBounce.el.hidden = f !== 'bounce';
        ui.sAmp.el.hidden = f !== 'elastic'; ui.sFreq.el.hidden = f !== 'elastic';
        ui.sKeys.el.hidden = !(p && p.kind === 'fn');
        ui.sSteps.el.hidden = !(p && p.kind === 'step');
        ui.shape.hidden = !(f || sampled);
        if (ui.mode) ui.mode.el.hidden = !bezEditable();
        ui.hint.textContent = (p && p.kind === 'step') ? 'Use the Steps slider to set how many steps the curve has.' : f ? 'Drag the white handle on the curve, or use the sliders. Both stay in sync.' :
            (isBez() ? (overMode ? 'Overshoot: the handles can go past 0% and 100%.' : 'Drag the two white handles (kept between 0% and 100%). Use Overshoot to go beyond.') : '');
        ui.over.set(st.overshoot); ui.bounce.set(st.bounce); ui.amp.set(st.overshoot); ui.freq.set(st.bounce); ui.keys.set(st.samples); ui.steps.set(st.steps);
    }
    function selectPreset(id) {
        var keepRep = st.replace;
        st = Engine.stateFor(id); st.replace = keepRep;
        activeCustom = null;
        paintPresets(); syncUI(); recompute();
    }
    function selectCustom(c) {
        var k, s = Engine.stateFor(c.snap.preset);
        for (k in c.snap) if (c.snap.hasOwnProperty(k)) s[k] = c.snap[k];
        s.bez = (c.snap.bez || s.bez).slice(0); st = s; activeCustom = c.id;
        paintPresets(); syncUI(); recompute();
    }
    /** A slider moved: write the value, redraw the curve (handles follow), drop the "saved preset" selection. */
    function setParam(key, v) { st[key] = v; activeCustom = null; syncUI(); recompute(); }

    /* ---------------------------------------------------------- presets UI */
    function thumbOf(id) {
        if (!thumbCache[id]) { var c = Engine.build(Engine.stateFor(id)); thumbCache[id] = c.preview; }
        return thumbCache[id];
    }
    function tile(label, pts, on, extra, handler) {
        return UI.el('button', { type: 'button', class: 'tile' + (on ? ' on' : '') + (extra ? ' ' + extra : ''), title: label, onclick: handler },
            [UI.thumb([{ pts: pts, cls: 'tl' }], { ymin: -0.35, ymax: 1.35, guides: true }), UI.el('span', { text: label })]);
    }
    function paintPresets() {
        var box = ui.presets, list, q = query.toLowerCase(), grid;
        box.textContent = '';
        ui.cats.forEach(function (c) { c.b.classList.toggle('on', c.id === catId && !q); c.b.setAttribute('aria-pressed', c.id === catId && !q ? 'true' : 'false'); });
        function tileFor(p) { return tile(p.name, thumbOf(p.id), st.preset === p.id && !activeCustom, '', function () { selectPreset(p.id); }); }
        if (!q && catId !== 'CUSTOM') {
            Engine.groupsOf(catId).forEach(function (g) {
                if (g.title) box.appendChild(UI.el('div', { class: 'subhead', text: g.title }));
                grid = UI.el('div', { class: 'tiles' });
                g.presets.forEach(function (p) { grid.appendChild(tileFor(p)); });
                box.appendChild(grid);
            });
            return;
        }
        grid = UI.el('div', { class: 'tiles' }); box.appendChild(grid);
        list = q ? Engine.PRESETS.filter(function (p) { return p.name.toLowerCase().indexOf(q) >= 0; }) : [];
        list.forEach(function (p) { grid.appendChild(tileFor(p)); });
        custom.filter(function (c) { return !q || c.name.toLowerCase().indexOf(q) >= 0; }).forEach(function (c) {
            grid.appendChild(tile(c.name, Engine.build(c.snap).preview, activeCustom === c.id, 'cust', function () { selectCustom(c); }));
        });
        if (catId === 'CUSTOM' && !custom.length && !q) grid.appendChild(UI.el('span', { class: 'hint wide', text: 'No saved presets yet. Shape a curve, name it, press Save.' }));
    }

    /* ------------------------------------------------------------- actions */
    function apply() {
        var c = Engine.build(st), payload = { mode: c.mode, replace: !!st.replace };
        if (c.mode === 'native') payload.bez = c.bez;
        if (c.mode === 'sampled') { payload.times = c.times; payload.values = c.values; payload.hold = c.hold; }
        UI.status('busy', 'Applying...');
        Bridge.call('graph.apply', payload).then(function (r) {
            if (r && r.ok && c.mode === 'sampled') r.msg += ' (' + c.info.replace('Sampled: ', '') + ')';
            UI.report(r, 'Applied');
        });
    }

    function play() {
        playStart = 0;
        function step(ts) {
            if (!playStart) playStart = ts;
            playT = Math.min(1, (ts - playStart) / 1000);
            draw();
            if (playT < 1) root.requestAnimationFrame(step);
            else setTimeout(function () { playT = -1; draw(); }, 500);
        }
        root.requestAnimationFrame(step);
    }

    function saveCustom() {
        var name = (ui.name.value || '').replace(/^\s+|\s+$/g, '');
        if (!name) return UI.status('warn', 'Type a name for the preset.');
        var snap = JSON.parse(JSON.stringify(st));
        var found = custom.filter(function (c) { return c.name === name; })[0];
        if (found) found.snap = snap; else custom.push({ id: 'c' + Date.now(), name: name, snap: snap });
        UI.store.set('graph.custom', custom);
        ui.name.value = ''; catId = 'CUSTOM'; UI.store.set('graph.cat', catId);
        paintPresets(); UI.status('ok', 'Saved preset "' + name + '"');
    }
    function deleteCustom() {
        if (!activeCustom) return UI.status('warn', 'Select a saved preset to delete.');
        custom = custom.filter(function (c) { return c.id !== activeCustom; });
        UI.store.set('graph.custom', custom); activeCustom = null;
        paintPresets(); UI.status('ok', 'Preset deleted');
    }

    /* ------------------------------------------------------------ pointer */
    function pos(e) { var r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
    function hit(p) {
        var hs = handleList(), i, best = -1, bd = 169;                         // 13px radius: generous target
        for (i = 0; i < hs.length; i++) { var dx = px(hs[i].x) - p.x, dy = py(hs[i].y) - p.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } }
        return best;
    }
    function onDown(e) {
        var h = hit(pos(e));
        if (h < 0) return;
        drag = h; e.preventDefault();
        root.addEventListener('mousemove', onMove); root.addEventListener('mouseup', onUp);
        draw();
    }
    function onMove(e) {
        if (drag < 0) return;
        var p = pos(e), x = Math.min(1, Math.max(0, ix(p.x)));
        if (isBez() && curve.mode !== 'sampled') {
            var y = overMode ? Math.min(1.5, Math.max(-0.5, iy(p.y))) : Math.min(1, Math.max(0, iy(p.y)));
            st.bez[drag * 2] = round(x); st.bez[drag * 2 + 1] = round(y);
            st.preset = 'custom';
        } else {
            Engine.dragHandle(st, drag, x, Math.min(yMax - 0.02, Math.max(yMin + 0.02, iy(p.y))));
            syncUI();
        }
        activeCustom = null;
        curve = Engine.build(st); draw();
    }
    function onUp() {
        drag = -1; root.removeEventListener('mousemove', onMove); root.removeEventListener('mouseup', onUp);
        computeRange(); paintPresets(); persist(); draw();
    }

    /* --------------------------------------------------------------- build */
    function build(pane) {
        loadState();
        var el = UI.el;
        ui.search = el('input', { type: 'search', placeholder: 'Search presets', class: 'search', 'aria-label': 'Search presets' });
        ui.search.addEventListener('input', function () { query = ui.search.value; paintPresets(); });
        ui.cats = Engine.CATEGORIES.map(function (id) {
            var b = el('button', { type: 'button', class: 'cat', onclick: function () { catId = id; UI.store.set('graph.cat', id); ui.search.value = ''; query = ''; paintPresets(); } }, [id]);
            return { id: id, b: b };
        });
        ui.presets = el('div', { class: 'groups' });
        var s1 = UI.section('Presets');
        s1.body.appendChild(ui.search);
        s1.body.appendChild(el('div', { class: 'cats' }, ui.cats.map(function (c) { return c.b; })));
        s1.body.appendChild(ui.presets);

        canvas = el('canvas', { id: 'gc', 'aria-label': 'Curve editor (drag the white handles)' });
        ctx = canvas.getContext('2d');
        canvas.addEventListener('mousedown', onDown);
        canvas.addEventListener('mousemove', function (e) { if (drag < 0) canvas.style.cursor = hit(pos(e)) >= 0 ? 'grab' : 'default'; });
        ui.mode = UI.seg([
            { v: 'normal', label: 'Normal', title: 'Handles stay between 0% and 100%' },
            { v: 'over', label: 'Overshoot', title: 'Handles can go past 0% and 100% (curve overshoots the keyframe values)' }
        ], overMode ? 'over' : 'normal', function (v) { setMode(v === 'over'); });
        var s2 = UI.section('Curve', ui.mode.el);
        s2.body.appendChild(canvas);
        ui.hint = el('div', { class: 'hint' });
        s2.body.appendChild(ui.hint);

        // sliders mirror the handles; each writes the same engine parameter the handle writes
        ui.over = UI.slider({ label: 'Overshoot', min: 0, max: 300, step: 1, value: st.overshoot, unit: '%', title: 'How far the curve passes the end value', oninput: function (v) { setParam('overshoot', v); } });
        ui.bounce = UI.slider({ label: 'Bounce', min: 0, max: 100, step: 1, value: st.bounce, unit: '%', title: 'Bounciness (rebound height)', oninput: function (v) { setParam('bounce', v); } });
        ui.amp = UI.slider({ label: 'Amplitude', min: 0, max: 300, step: 1, value: st.overshoot, unit: '%', title: 'Size of the elastic swing', oninput: function (v) { setParam('overshoot', v); } });
        ui.freq = UI.slider({ label: 'Frequency', min: 0, max: 100, step: 1, value: st.bounce, unit: '%', title: 'How fast the elastic swing oscillates', oninput: function (v) { setParam('bounce', v); } });
        ui.keys = UI.slider({ label: 'Keys', min: 4, max: 120, step: 1, value: st.samples, title: 'Keyframes created along the curve (more = smoother, heavier)', oninput: function (v) { setParam('samples', v); } });
        ui.steps = UI.slider({ label: 'Steps', min: 2, max: 40, step: 1, value: st.steps, title: 'Number of steps (stairs) in the curve', oninput: function (v) { setParam('steps', v); } });
        ui.sOver = ui.over; ui.sSteps = ui.steps; ui.sBounce = ui.bounce; ui.sAmp = ui.amp; ui.sFreq = ui.freq; ui.sKeys = ui.keys;
        ui.shape = el('div', { class: 'shape' }, [ui.over.el, ui.bounce.el, ui.amp.el, ui.freq.el, ui.keys.el, ui.steps.el]);
        s2.body.appendChild(ui.shape);

        ui.replace = el('input', { type: 'checkbox' });
        ui.replace.addEventListener('change', function () { st.replace = ui.replace.checked; persist(); });
        ui.name = el('input', { type: 'text', placeholder: 'Preset name', maxlength: 24, 'aria-label': 'Preset name' });
        ui.name.addEventListener('keydown', function (e) { if (e.key === 'Enter') saveCustom(); });
        var s3 = UI.section('Actions');
        s3.body.appendChild(el('div', { class: 'g3' }, [
            UI.btn('Reset', { title: 'Reset to the current preset defaults', onclick: function () { selectPreset(st.preset === 'custom' ? 'easeInOut' : st.preset); } }),
            UI.btn('Preview', { title: 'Play the curve in the panel (does not touch After Effects)', onclick: play }),
            UI.btn('Apply', { cls: 'pri', title: 'Apply to the 2 selected keyframes (one Undo step)', onclick: apply })
        ]));
        s3.body.appendChild(el('label', { class: 'chk', title: 'Delete keyframes between the two selected keys so a curve can be applied again' }, [ui.replace, 'Replace in-between keys']));
        s3.body.appendChild(el('div', { class: 'row' }, [ui.name,
            UI.btn('Save', { title: 'Save current curve as a preset', onclick: saveCustom }),
            UI.btn('Delete', { title: 'Delete the selected saved preset', onclick: deleteCustom })]));

        // order: Curve, Actions, then Presets underneath
        [s2, s3, s1].forEach(function (s) { pane.appendChild(s.el); });
        curve = Engine.build(st); computeRange();
        paintPresets(); syncUI();
        root.addEventListener('resize', UI.debounce(resize, 120));
    }

    // read-only hooks used by tests/ui-smoke.test.js
    var testHooks = {
        state: function () { return st; },
        mode: function () { return overMode ? 'over' : 'normal'; },
        handlePx: function () { return handleList().map(function (h) { return { x: px(h.x), y: py(h.y) }; }); },
        redraw: resize
    };

    ZX.GraphTab = { id: 'graph', label: 'GRAPH', title: 'Graph editor: easing for 2 selected keyframes', build: build, onshow: function () { if (canvas) setTimeout(resize, 0); }, _test: testHooks };
})(window);
