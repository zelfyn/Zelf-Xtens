/* Zelf-Xtens | js/ui.js : tiny UI toolkit (no dependencies). Namespace: ZX.UI */
(function (root) {
    'use strict';
    var ZX = root.ZX = root.ZX || {};
    var UI = ZX.UI = {};

    /* ---------------------------------------------------------------- DOM */
    UI.$ = function (sel, ctx) { return (ctx || document).querySelector(sel); };

    /** el('button', {class:'btn', title:'x', onclick:fn}, ['label', childNode]) */
    UI.el = function (tag, attrs, kids) {
        var n = document.createElement(tag), k, v, i, c;
        if (attrs) {
            for (k in attrs) {
                if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
                v = attrs[k];
                if (v === false || v === null || v === undefined) continue;
                if (k === 'class') n.className = v;
                else if (k === 'text') n.textContent = v;
                else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
                else n.setAttribute(k, v === true ? '' : v);
            }
        }
        if (kids) {
            if (!Array.isArray(kids)) kids = [kids];
            for (i = 0; i < kids.length; i++) {
                c = kids[i];
                if (c === null || c === undefined || c === false) continue;
                n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
            }
        }
        return n;
    };

    /* ------------------------------------------------------------ storage */
    UI.store = {
        get: function (k, d) {
            try { var v = root.localStorage.getItem('zx.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; }
        },
        set: function (k, v) { try { root.localStorage.setItem('zx.' + k, JSON.stringify(v)); } catch (e) { } }
    };

    /* ----------------------------------------------------------- timing */
    UI.debounce = function (fn, ms) {
        var t = null;
        return function () {
            var a = arguments, self = this;
            if (t) clearTimeout(t);
            t = setTimeout(function () { t = null; fn.apply(self, a); }, ms);
        };
    };
    /** Coalesce many calls into one per animation frame (used for canvas redraw). */
    UI.raf = function (fn) {
        var pending = false;
        return function () {
            if (pending) return;
            pending = true;
            root.requestAnimationFrame(function () { pending = false; fn(); });
        };
    };

    /* ------------------------------------------------------------- status */
    var stTimer = null;
    UI.status = function (kind, msg) {
        var dot = UI.$('#sdot'), txt = UI.$('#stext');
        if (!dot || !txt) return;
        dot.className = 's-' + kind;
        txt.textContent = msg;
        txt.title = msg;
        if (stTimer) clearTimeout(stTimer);
        if (kind !== 'ready') stTimer = setTimeout(function () { UI.status('ready', 'Ready'); }, kind === 'error' ? 12000 : 6000);
    };
    /** Turn a bridge result into the status line. */
    UI.report = function (res, okMsg) {
        if (!res) return UI.status('error', 'No response from After Effects.');
        if (res.ok) return UI.status('ok', res.msg || okMsg || 'Done');
        if (res.kind === 'busy') return;
        UI.status(res.kind === 'invalid' ? 'warn' : 'error', res.msg || 'Error');
        if (res.kind === 'error' && ZX.log) ZX.log('error', res);
    };

    /* --------------------------------------------------------- components */
    UI.btn = function (label, opts) {
        opts = opts || {};
        return UI.el('button', {
            type: 'button', class: 'btn' + (opts.cls ? ' ' + opts.cls : ''), title: opts.title || label, onclick: opts.onclick
        }, [label]);
    };

    UI.section = function (title, extra) {
        var body = UI.el('div', { class: 'sec-body' });
        var head = UI.el('div', { class: 'sec-head' }, [UI.el('span', { text: title })].concat(extra ? [extra] : []));
        return { el: UI.el('section', { class: 'sec' }, [head, body]), body: body };
    };

    /** Segmented control. options: [{v,label,title}] -> {el,get,set} */
    UI.seg = function (options, value, onchange) {
        var cur = value, wrap = UI.el('div', { class: 'seg', role: 'group' }), btns = [];
        function paint() { for (var i = 0; i < btns.length; i++) btns[i].b.classList.toggle('on', btns[i].v === cur); }
        options.forEach(function (o) {
            var b = UI.el('button', {
                type: 'button', class: 'segb', title: o.title || o.label, 'aria-pressed': 'false',
                onclick: function () { if (cur === o.v) return; cur = o.v; paint(); if (onchange) onchange(cur); }
            }, [o.label]);
            btns.push({ v: o.v, b: b });
            wrap.appendChild(b);
        });
        paint();
        return { el: wrap, get: function () { return cur; }, set: function (v) { cur = v; paint(); } };
    };

    /** Labelled numeric input -> {el,input,get,set}. */
    UI.num = function (o) {
        var input = UI.el('input', {
            type: 'number', min: o.min, max: o.max, step: o.step || 1, value: o.value, title: o.title || o.label, 'aria-label': o.label
        });
        function clampVal() {
            var v = parseFloat(input.value);
            if (isNaN(v)) v = o.value;
            if (o.min !== undefined && v < o.min) v = o.min;
            if (o.max !== undefined && v > o.max) v = o.max;
            return v;
        }
        input.addEventListener('input', function () { if (o.oninput) o.oninput(clampVal()); });
        input.addEventListener('change', function () { var v = clampVal(); input.value = v; if (o.onchange) o.onchange(v); });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });
        var wrap = UI.el('label', { class: 'fld' }, [UI.el('span', { text: o.label }), input]);
        return { el: wrap, input: input, get: clampVal, set: function (v) { input.value = v; } };
    };

    /** Labelled slider with live readout -> {el,get,set}. */
    UI.slider = function (o) {
        var out = UI.el('output', { text: o.value + (o.unit || '') });
        var input = UI.el('input', { type: 'range', min: o.min, max: o.max, step: o.step || 1, value: o.value, title: o.title || o.label, 'aria-label': o.label });
        input.addEventListener('input', function () {
            out.textContent = input.value + (o.unit || '');
            if (o.oninput) o.oninput(parseFloat(input.value));
        });
        var wrap = UI.el('label', { class: 'sld' }, [UI.el('span', { text: o.label }), input, out]);
        return {
            el: wrap, get: function () { return parseFloat(input.value); },
            set: function (v) { input.value = v; out.textContent = input.value + (o.unit || ''); }
        };
    };


    /* ------------------------------------------------------- colour picker
     * One custom picker window shared by every colour field (no native <input type=color>):
     *   Saturation/Brightness square + Hue slider + HEX + R/G/B inputs + swatches + recent colours.
     * UI.pickColor({title, value:'#rrggbb', onapply(hex)}) opens it; OK applies, Cancel / Esc / click outside discards.
     */
    var C = UI.color = {
        clamp: function (v, a, b) { return v < a ? a : (v > b ? b : v); },
        isHex: function (v) { return /^#[0-9a-f]{6}$/i.test(String(v || '')); },
        /** '#abc' / 'abc' / '#aabbcc' -> '#aabbcc' (lower case) or null */
        norm: function (v) {
            v = String(v || '').replace(/^\s+|\s+$/g, '').replace(/^#/, '').toLowerCase();
            if (/^[0-9a-f]{3}$/.test(v)) v = v.charAt(0) + v.charAt(0) + v.charAt(1) + v.charAt(1) + v.charAt(2) + v.charAt(2);
            return /^[0-9a-f]{6}$/.test(v) ? '#' + v : null;
        },
        toRgb: function (hex) { var h = C.norm(hex) || '#000000'; return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; },
        toHex: function (r, g, b) {
            function c(x) { x = Math.round(C.clamp(Number(x) || 0, 0, 255)); return (x < 16 ? '0' : '') + x.toString(16); }
            return '#' + c(r) + c(g) + c(b);
        },
        /** r,g,b 0..255 -> {h 0..360, s 0..1, v 0..1} */
        rgbToHsv: function (r, g, b) {
            r /= 255; g /= 255; b /= 255;
            var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
            if (d > 0) {
                if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
                h *= 60; if (h < 0) h += 360;
            }
            return { h: h, s: mx === 0 ? 0 : d / mx, v: mx };
        },
        /** h 0..360, s,v 0..1 -> [r,g,b] 0..255 */
        hsvToRgb: function (h, s, v) {
            var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r = 0, g = 0, b = 0;
            if (h < 60) { r = c; g = x; } else if (h < 120) { r = x; g = c; } else if (h < 180) { g = c; b = x; }
            else if (h < 240) { g = x; b = c; } else if (h < 300) { r = x; b = c; } else { r = c; b = x; }
            return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
        }
    };
    UI.PALETTE = [
        '#ffffff', '#d9d9d9', '#a6a6a6', '#737373', '#404040', '#000000',
        '#ff3b30', '#ff6b35', '#ff9500', '#ffcc00', '#80deea', '#c6e03a',
        '#34c759', '#00e676', '#00c2a8', '#00b8d4', '#0a84ff', '#3f51ff',
        '#5e5ce6', '#bf5af2', '#ff2d92', '#ff6482', '#a2845e', '#7a4a21'
    ];

    var picker = null;
    function buildPicker() {
        var el = UI.el, st = { h: 0, s: 1, v: 1 }, orig = '#ffffff', cb = null, drag = null, sw = [];
        var svW = el('div', { class: 'cp-sv-w' }), svB = el('div', { class: 'cp-sv-b' }), svKnob = el('i', { class: 'cp-knob' });
        var sv = el('div', { class: 'cp-sv', role: 'slider', 'aria-label': 'Saturation and brightness' }, [svW, svB, svKnob]);
        var hueKnob = el('i', { class: 'cp-knob cp-knob-h' });
        var hue = el('div', { class: 'cp-hue', role: 'slider', 'aria-label': 'Hue' }, [hueKnob]);
        var cNew = el('span', { class: 'cp-new', title: 'New colour' }), cOld = el('span', { class: 'cp-old', title: 'Current colour (click to go back)' });
        var hexIn = el('input', { type: 'text', maxlength: 7, spellcheck: 'false', 'aria-label': 'Hex colour', title: 'Hex colour, e.g. #00e676' });
        var rgbIn = ['R', 'G', 'B'].map(function (n) { return el('input', { type: 'number', min: 0, max: 255, step: 1, value: 0, 'aria-label': n, title: n + ' (0-255)' }); });
        var pal = el('div', { class: 'cp-pal', role: 'group', 'aria-label': 'Swatches' });
        var rec = el('div', { class: 'cp-pal', role: 'group', 'aria-label': 'Recent colours' });
        var recLbl = el('span', { class: 'lbl', text: 'Recent' });
        var title = el('strong', { class: 'cp-title', text: 'Colour' });
        var closeB = el('button', { type: 'button', class: 'cp-x', title: 'Close', 'aria-label': 'Close' }, ['\u00D7']);
        var okB = UI.btn('OK', { cls: 'pri', title: 'Use this colour' }), cancelB = UI.btn('Cancel', { title: 'Close without changing' });
        var card = el('div', { class: 'cp-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Colour picker' }, [
            el('div', { class: 'cp-head' }, [title, closeB]),
            sv, hue,
            el('div', { class: 'cp-cur' }, [el('div', { class: 'cp-cmp' }, [cNew, cOld]), el('label', { class: 'fld grow' }, [el('span', { text: 'Hex' }), hexIn])]),
            el('div', { class: 'g3' }, rgbIn.map(function (inp, i) { return el('label', { class: 'fld' }, [el('span', { text: ['Red', 'Green', 'Blue'][i] }), inp]); })),
            el('span', { class: 'lbl', text: 'Swatches' }), pal, recLbl, rec,
            el('div', { class: 'g2' }, [cancelB, okB])
        ]);
        var root_ = el('div', { class: 'cp', hidden: true }, [card]);

        function hexNow() { var c = C.hsvToRgb(st.h, st.s, st.v); return C.toHex(c[0], c[1], c[2]); }
        function paint(skipHex) {
            var hex = hexNow(), c = C.toRgb(hex), i, pure = C.hsvToRgb(st.h, 1, 1);
            sv.style.background = 'rgb(' + pure.join(',') + ')';
            svKnob.style.left = (st.s * 100) + '%'; svKnob.style.top = ((1 - st.v) * 100) + '%';
            hueKnob.style.left = (st.h / 360 * 100) + '%';
            cNew.style.background = hex; cOld.style.background = orig;
            if (!skipHex) hexIn.value = hex.toUpperCase();
            for (i = 0; i < 3; i++) rgbIn[i].value = c[i];
            for (i = 0; i < sw.length; i++) sw[i].b.classList.toggle('on', sw[i].c === hex);
        }
        function setHex(hex, keepText) {
            var n = C.norm(hex); if (!n) return false;
            var c = C.toRgb(n), t = C.rgbToHsv(c[0], c[1], c[2]);
            st.s = t.s; st.v = t.v; if (t.s > 0 && t.v > 0) st.h = t.h;      // keep the hue when the colour is grey / black
            paint(keepText); return true;
        }
        function swatchBtn(c) { return el('button', { type: 'button', class: 'pal-c', title: c.toUpperCase(), 'aria-label': c.toUpperCase(), style: 'background:' + c, onclick: function () { setHex(c); } }); }
        function fillPalette() {
            pal.textContent = ''; sw = [];
            UI.PALETTE.forEach(function (c) { var b = swatchBtn(c); sw.push({ c: c.toLowerCase(), b: b }); pal.appendChild(b); });
        }
        function fillRecent() {
            var list = UI.store.get('colors.recent', []);
            rec.textContent = '';
            if (!Array.isArray(list)) list = [];
            list = list.filter(C.isHex);
            recLbl.hidden = rec.hidden = !list.length;
            list.forEach(function (c) { var b = swatchBtn(c); sw.push({ c: c.toLowerCase(), b: b }); rec.appendChild(b); });
        }
        function pos(e, node) {
            var r = node.getBoundingClientRect();
            return { x: C.clamp(r.width ? (e.clientX - r.left) / r.width : 0, 0, 1), y: C.clamp(r.height ? (e.clientY - r.top) / r.height : 0, 0, 1) };
        }
        function onMove(e) {
            if (!drag) return;
            var p = pos(e, drag === 'sv' ? sv : hue);
            if (drag === 'sv') { st.s = p.x; st.v = 1 - p.y; } else st.h = Math.min(359.999, p.x * 360);
            paint();
        }
        function onUp() { drag = null; root.removeEventListener('mousemove', onMove); root.removeEventListener('mouseup', onUp); }
        function startDrag(kind, node) {
            return function (e) { e.preventDefault(); drag = kind; root.addEventListener('mousemove', onMove); root.addEventListener('mouseup', onUp); onMove(e); };
        }
        sv.addEventListener('mousedown', startDrag('sv', sv));
        hue.addEventListener('mousedown', startDrag('hue', hue));
        // arrow keys nudge the focused slider
        sv.tabIndex = 0; hue.tabIndex = 0;
        sv.addEventListener('keydown', function (e) {
            var d = e.shiftKey ? 0.1 : 0.01, k = e.key;
            if (k === 'ArrowLeft') st.s = C.clamp(st.s - d, 0, 1); else if (k === 'ArrowRight') st.s = C.clamp(st.s + d, 0, 1);
            else if (k === 'ArrowUp') st.v = C.clamp(st.v + d, 0, 1); else if (k === 'ArrowDown') st.v = C.clamp(st.v - d, 0, 1); else return;
            e.preventDefault(); paint();
        });
        hue.addEventListener('keydown', function (e) {
            var d = e.shiftKey ? 20 : 2;
            if (e.key === 'ArrowLeft') st.h = C.clamp(st.h - d, 0, 359.999); else if (e.key === 'ArrowRight') st.h = C.clamp(st.h + d, 0, 359.999); else return;
            e.preventDefault(); paint();
        });
        hexIn.addEventListener('input', function () { setHex(hexIn.value, true); });      // typing never rewrites the text field
        hexIn.addEventListener('blur', function () { paint(); });
        hexIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
        rgbIn.forEach(function (inp) {
            function fromRgb() { var h = C.toHex(rgbIn[0].value, rgbIn[1].value, rgbIn[2].value); setHex(h, false); }
            inp.addEventListener('input', fromRgb);
            inp.addEventListener('change', function () { fromRgb(); paint(); });
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
        });
        cOld.addEventListener('click', function () { setHex(orig); });

        function close() { onUp(); root_.hidden = true; var f = cb; cb = null; if (picker && picker.returnFocus) { try { picker.returnFocus.focus(); } catch (e) { } } return f; }
        function apply() {
            var hex = hexNow(), f = cb, list = UI.store.get('colors.recent', []);
            if (!Array.isArray(list)) list = [];
            list = [hex].concat(list.filter(function (c) { return c !== hex && C.isHex(c); })).slice(0, 12);
            UI.store.set('colors.recent', list);
            close();
            if (f) f(hex);
        }
        okB.addEventListener('click', apply);
        cancelB.addEventListener('click', close); closeB.addEventListener('click', close);
        root_.addEventListener('mousedown', function (e) { if (e.target === root_) close(); });
        root_.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
        fillPalette();

        picker = {
            el: root_, returnFocus: null,
            open: function (o) {
                o = o || {};
                cb = o.onapply || null; orig = C.norm(o.value) || '#ffffff';
                title.textContent = o.title || 'Colour';
                fillPalette(); fillRecent();
                setHex(orig); paint();
                root_.hidden = false;
                try { hexIn.focus(); hexIn.select(); } catch (e) { }
            },
            current: hexNow, set: setHex, apply: apply, close: close
        };
        document.body.appendChild(root_);
        return picker;
    }
    UI.pickColor = function (o) {
        var p = picker || buildPicker();
        p.returnFocus = document.activeElement;
        p.open(o);
        return p;
    };
    UI._picker = function () { return picker; };

    /**
     * Colour field: one big swatch button (opens the picker window) showing the colour and its hex value.
     * o: {label, value:'#rrggbb', onchange?(hex)} -> {el, get, set}
     */
    UI.colorField = function (o) {
        var cur = C.norm(o.value) || '#ffffff';
        var chip = UI.el('span', { class: 'swatch-chip' });
        var hex = UI.el('span', { class: 'swatch-hex' });
        function paint() { chip.style.background = cur; hex.textContent = cur.toUpperCase(); }
        function set(v, fire) {
            var n = C.norm(v); if (!n) return;
            cur = n; paint();
            if (fire && o.onchange) o.onchange(cur);
        }
        var btn = UI.el('button', {
            type: 'button', class: 'swatch', title: o.label + ': click to choose a colour', 'aria-label': o.label + ' colour, ' + cur,
            onclick: function () { UI.pickColor({ title: o.label, value: cur, onapply: function (h) { set(h, true); } }); }
        }, [chip, hex, UI.el('span', { class: 'swatch-act', text: 'Pick' })]);
        paint();
        var wrap = UI.el('div', { class: 'cfield' }, [UI.el('span', { class: 'lbl', text: o.label }), btn]);
        return { el: wrap, button: btn, get: function () { return cur; }, set: function (v) { set(v, false); } };
    };

    /* ---------------------------------------------------------- thumbnails */
    UI.svg = function (tag, attrs) {
        var n = document.createElementNS('http://www.w3.org/2000/svg', tag), k;
        for (k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
        return n;
    };
    /**
     * Tiny SVG line chart. layers: [{pts:[[x 0..1, y]...], cls:'tl'|'td'|'tg'}]
     * opts: ymin/ymax (data range, default 0..1), guides (draw y=0 / y=1 lines), w/h (viewBox)
     */
    UI.thumb = function (layers, o) {
        o = o || {};
        var W = o.w || 48, H = o.h || 32, pad = 4, y0 = o.ymin === undefined ? 0 : o.ymin, y1 = o.ymax === undefined ? 1 : o.ymax;
        var svg = UI.svg('svg', { viewBox: '0 0 ' + W + ' ' + H, 'class': o.cls || 'thumb', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
        function fx(x) { return (pad + x * (W - 2 * pad)).toFixed(2); }
        function fy(y) { return (pad + (y1 - y) / (y1 - y0) * (H - 2 * pad)).toFixed(2); }
        if (o.guides) [0, 1].forEach(function (g) { svg.appendChild(UI.svg('path', { 'class': 'tg', d: 'M' + fx(0) + ' ' + fy(g) + 'L' + fx(1) + ' ' + fy(g) })); });
        layers.forEach(function (l) {
            var d = '', i;
            for (i = 0; i < l.pts.length; i++) d += (i ? 'L' : 'M') + fx(l.pts[i][0]) + ' ' + fy(l.pts[i][1]);
            svg.appendChild(UI.svg('path', { 'class': l.cls || 'tl', d: d }));
        });
        return svg;
    };

    /* -------------------------------------------------------------- tabs */
    /** tabs: [{id,label,title,build(bodyEl)}]. Builds each tab lazily on first open. */
    UI.tabs = function (nav, main, tabs, activeId, onchange) {
        var map = {};
        function show(id) {
            var t = map[id]; if (!t) { id = tabs[0].id; t = map[id]; }
            tabs.forEach(function (x) {
                var on = x.id === id;
                map[x.id].btn.classList.toggle('on', on);
                map[x.id].btn.setAttribute('aria-selected', on ? 'true' : 'false');
                map[x.id].pane.hidden = !on;
            });
            if (!t.built) { t.built = true; try { t.def.build(t.pane); } catch (e) { t.pane.textContent = 'Failed to build tab: ' + e.message; if (ZX.log) ZX.log('error', e); } }
            if (t.def.onshow) t.def.onshow();
            if (onchange) onchange(id);
        }
        tabs.forEach(function (d, i) {
            var btn = UI.el('button', {
                type: 'button', class: 'tab', role: 'tab', title: d.title || d.label, 'aria-selected': 'false',
                onclick: function () { show(d.id); },
                onkeydown: function (e) {
                    var j = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : -1;
                    if (j >= 0 && j < tabs.length) { show(tabs[j].id); map[tabs[j].id].btn.focus(); }
                }
            }, [d.label]);
            var pane = UI.el('div', { class: 'pane', role: 'tabpanel', hidden: true });
            nav.appendChild(btn); main.appendChild(pane);
            map[d.id] = { def: d, btn: btn, pane: pane, built: false };
        });
        show(activeId);
        return { show: show };
    };
})(window);
