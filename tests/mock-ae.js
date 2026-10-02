/* Zelf-Xtens | tests/mock-ae.js : a small stand-in for After Effects' scripting DOM, enough to run jsx/*.jsx in Node.
 * It models 2D/3D transforms with parents (toWorld / fromWorld), effects + expressions (the probe), selection,
 * layer indices, text documents and undo groups. It is NOT After Effects: anything it cannot prove is listed in
 * README-TESTS.md as "verify in real After Effects".
 */
'use strict';
var vm = require('vm'), fs = require('fs'), path = require('path');

var MOCK_SRC = String.raw`
function clone(v) { return Array.isArray(v) ? v.slice() : (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v); }
var PI = Math.PI;
var PropertyType = { PROPERTY: 1, INDEXED_GROUP: 2, NAMED_GROUP: 3 };
var PropertyValueType = { OneD: 1, TwoD: 2, ThreeD: 3, TwoD_SPATIAL: 4, ThreeD_SPATIAL: 5, COLOR: 6, NO_VALUE: 9 };
var KeyframeInterpolationType = { LINEAR: 1, BEZIER: 2, HOLD: 3 };
function KeyframeEase(s, i) { this.speed = s; this.influence = i; }
var ParagraphJustification = { CENTER_JUSTIFY: 'center' };
var LightType = { POINT: 'point' };
var __undo = { begin: 0, end: 0, names: [] };
var app = { version: '17.0', project: { activeItem: null, selection: [], numItems: 0 },
    beginUndoGroup: function (n) { __undo.begin++; __undo.names.push(n); }, endUndoGroup: function () { __undo.end++; } };
function timeToCurrentFormat(t) { return String(t); }

function Prop(name, val, opts) {
    opts = opts || {};
    this.name = name; this._v = clone(val); this._keys = []; this.expression = ''; this.expressionEnabled = false; this.expressionError = '';
    this.dimensionsSeparated = false; this.canSetExpression = opts.canSetExpression !== false; this.propertyType = PropertyType.PROPERTY;
    this.propertyValueType = opts.type || PropertyValueType.OneD; this.propertyDepth = 1; this._owner = opts.owner || null; this._eval = opts.evalFn || null;
    this.isSpatial = false;
}
Object.defineProperty(Prop.prototype, 'numKeys', { get: function () { return this._keys.length; } });
Object.defineProperty(Prop.prototype, 'value', { get: function () {
    if (this.expression && this._eval) { var r = this._eval(this.expression); this.expressionError = ''; return r; }
    return this._keys.length ? clone(this._keys[0].v) : clone(this._v);
} });
Prop.prototype.setValue = function (v) { this._v = clone(v); };
Prop.prototype.setValueAtTime = function (t, v) { this._v = clone(v); };
Prop.prototype.keyValue = function (k) { return clone(this._keys[k - 1].v); };
Prop.prototype.keyTime = function (k) { return this._keys[k - 1].t; };
Prop.prototype.setValueAtKey = function (k, v) { this._keys[k - 1].v = clone(v); };
Prop.prototype.valueAtTime = function (t, pre) { return clone(this._valueFn ? this._valueFn(t) : this._v); };
Prop.prototype.propertyGroup = function () { return this._owner; };
Prop.prototype.addKey = function (t, v) { this._keys.push({ t: t, v: clone(v) }); };

function Group(map) { this._m = map; }
Group.prototype.property = function (n) { return this._m[n] || null; };

function Effect(layer) {
    var self = this, comp = layer._comp; this.name = ''; this._layer = layer;
    this._p = new Prop('Point', [0, 0, 0], { evalFn: function (expr) { return __evalExpr(expr, layer); } });
    this._p.propertyValueType = PropertyValueType.ThreeD;
    this.property = function () { return self._p; };
    this.remove = function () { var i = layer._fx.indexOf(self); if (i >= 0) layer._fx.splice(i, 1); };
}

function Layer(kind, name, o) {
    o = o || {};
    this._kind = kind; this.name = name; this.locked = false; this.selected = false; this.parent = null; this._comp = null;
    this.threeDLayer = !!o.threeD; this.width = o.w || 0; this.height = o.h || 0; this._rect = o.rect || null; this._fx = [];
    this.isPoint = kind === 'camera' || kind === 'light';
    var is3 = this.isPoint || this.threeDLayer, self = this;
    var pos = is3 ? [960, 540, o.z === undefined ? -1000 : o.z] : [960, 540];
    var anc = is3 ? [0, 0, 0] : [0, 0];
    this._pos = new Prop('Position', o.pos || pos, { owner: null }); this._anc = new Prop('Anchor Point', o.anchor || anc);
    this._scl = new Prop('Scale', o.scale || (is3 ? [100, 100, 100] : [100, 100])); this._rot = new Prop('Rotation', o.rot || 0);
    this._tg = new Group({ 'ADBE Position': this._pos, 'ADBE Anchor Point': this._anc, 'ADBE Scale': this._scl, 'ADBE Rotate Z': this._rot });
    this._pos._owner = this; this._pos.propertyDepth = 0;
    this._inOff = 0; this._len = 10; this.startTime = 0;   // inPoint / outPoint follow startTime like in AE
    if (!this.isPoint) { this.adjustmentLayer = !!o.adj; }
}
Object.defineProperty(Layer.prototype, 'index', { get: function () { return this._comp ? this._comp._layers.indexOf(this) + 1 : 0; } });
Object.defineProperty(Layer.prototype, 'inPoint', { get: function () { return this.startTime + this._inOff; }, set: function (v) { this._len -= v - this.inPoint; this._inOff = v - this.startTime; } });
Object.defineProperty(Layer.prototype, 'outPoint', { get: function () { return this.startTime + this._inOff + this._len; }, set: function (v) { this._len = v - this.inPoint; } });
Object.defineProperty(Layer.prototype, 'hasParent', { get: function () { return !!this.parent; } });
Layer.prototype.property = function (n) {
    if (n === 'ADBE Transform Group') return this._tg;
    if (n === 'ADBE Effect Parade') { if (this.isPoint) return null; var self = this; return { addProperty: function () { var fx = new Effect(self); self._fx.push(fx); return fx; } }; }
    if (n === 'ADBE Text Properties' && this._textDoc) return new Group({ 'ADBE Text Document': this._textDoc });
    if (n === 'ADBE Camera Options Group' && this._camGroup) return this._camGroup;
    return null;
};
Layer.prototype.sourceRectAtTime = function () {
    if (this.isPoint) throw new Error('no source rect');
    return this._rect ? { left: this._rect[0], top: this._rect[1], width: this._rect[2], height: this._rect[3] } : { left: 0, top: 0, width: this.width, height: this.height };
};
Layer.prototype.remove = function () { var i = this._comp._layers.indexOf(this); if (i >= 0) this._comp._layers.splice(i, 1); };
Layer.prototype.moveBefore = function () {};
function AVLayer() {} function CameraLayer() {} function LightLayer() {} function TextLayer() {} function ShapeLayer() {}
function FootageItem() {}
// text/shape are AVLayer subclasses in AE; camera/light are plain Layers
TextLayer.prototype = Object.create(AVLayer.prototype); ShapeLayer.prototype = Object.create(AVLayer.prototype);

function mathAnchor(L) { return L.isPoint ? [0, 0, 0] : L._anc._v; }
function toParent(L, p) {
    var a = mathAnchor(L), s = L._scl._v, rz = L._rot._v * PI / 180, pos = L._pos._v, c = Math.cos(rz), sn = Math.sin(rz);
    var dx = (p[0] - a[0]) * s[0] / 100, dy = (p[1] - a[1]) * s[1] / 100;
    return [pos[0] + dx * c - dy * sn, pos[1] + dx * sn + dy * c, (pos[2] || 0) + ((p[2] || 0) - (a[2] || 0))];
}
function toWorld(L, p) { var q = toParent(L, p); return L.parent ? toWorld(L.parent, q) : q; }
function fromWorld(L, w) {
    var q = L.parent ? fromWorld(L.parent, w) : w, a = mathAnchor(L), s = L._scl._v, rz = L._rot._v * PI / 180, pos = L._pos._v, c = Math.cos(rz), sn = Math.sin(rz);
    var dx = q[0] - pos[0], dy = q[1] - pos[1], ux = dx * c + dy * sn, uy = -dx * sn + dy * c;
    return [a[0] + ux / (s[0] / 100), a[1] + uy / (s[1] / 100), (q[2] - (pos[2] || 0)) + (a[2] || 0)];
}
function wrap(L) {
    return { toWorld: function (p) { return toWorld(L, p); }, fromWorld: function (w) { return fromWorld(L, w); },
        hasParent: !!L.parent, get parent() { return L.parent ? wrap(L.parent) : null; }, transform: { anchorPoint: mathAnchor(L).slice() } };
}
function __evalExpr(expr, layer) {
    var comp = layer._comp, thisComp = { layer: function (i) { return wrap(comp._layers[i - 1]); } };
    var r = (new Function('thisLayer', 'thisComp', 'return eval(' + JSON.stringify(expr) + ')'))(wrap(layer), thisComp);
    r = r.slice(); while (r.length < 3) r.push(0); return r;
}
function __worldOf(L, p) { return toWorld(L, p); }

function CompItem(w, h) {
    this.width = w || 1920; this.height = h || 1080; this.time = 0; this.duration = 10; this.frameDuration = 1 / 30; this.pixelAspect = 1;
    this._layers = []; this.selectedProperties = [];
    var self = this;
    function add(kind, name, o) { var L = new Layer(kind, name, o); L._comp = self; self._layers.unshift(L); return L; }
    function make(kind, name, o, Ctor) { var L = add(kind, name, o); Object.setPrototypeOf(L, Ctor.prototype); Object.getOwnPropertyNames(Layer.prototype).forEach(function (k) { if (!(k in Ctor.prototype) || Ctor.prototype[k] === undefined) {} }); return L; }
    this.layers = {
        addNull: function () { return make('null', 'Null', { w: 100, h: 100 }, AVLayer); },
        addSolid: function (c, name, w, h) { var L = make('solid', name, { w: w, h: h }, AVLayer); L._color = c; return L; },
        addText: function (txt) {
            var L = make('text', 'Text', { rect: [-60, -30, 120, 40] }, TextLayer);
            var doc = { text: txt, font: 'MyriadPro-Regular', fillColor: [0, 0, 0], applyFill: false, justification: 'left', fontSize: 50 };
            L._textDoc = { get value() { return JSON.parse(JSON.stringify(doc)); }, setValue: function (td) {
                var next = JSON.parse(JSON.stringify(td));
                if (next.font !== doc.font && !(__fonts.installed.indexOf(next.font) >= 0)) {
                    if (__fonts.mode === 'throw') throw new Error('font failed');
                    next.font = doc.font;                    // AE keeps the old font
                }
                doc = next;
            } };
            return L;
        },
        addLight: function (name, pt) { var L = make('light', name, {}, LightLayer); L._pos._v = [pt[0], pt[1], 0]; return L; },
        addCamera: function (name, pt) {
            var L = make('camera', name, {}, CameraLayer); L._pos._v = [pt[0], pt[1], 0];
            L._zoom = new Prop('Zoom', 1000); L._camGroup = new Group({ 'ADBE Camera Zoom': L._zoom });
            return L;
        },
        // precompose(indices, name, moveAll): the chosen layers move into a new comp, one precomp layer takes the top-most slot
        precompose: function (idx, name, moveAll) {
            if (!Array.isArray(idx) || !idx.length) throw new Error('no indices');
            if (typeof moveAll !== 'boolean') throw new Error('moveAllAttributes must be boolean');
            var inner = new CompItem(self.width, self.height), moved = [], i, top = 1e9, L;
            idx.forEach(function (n) { L = self._layers[n - 1]; if (!L) throw new Error('bad index ' + n); if (L.isPoint) throw new Error('cannot precompose ' + L._kind); moved.push(L); top = Math.min(top, n); });
            moved.forEach(function (l) { self._layers.splice(self._layers.indexOf(l), 1); l._comp = inner; inner._layers.push(l); });
            inner.name = name; inner.__movedAll = moveAll;
            var pl = make('solid', name, { w: self.width, h: self.height }, AVLayer);          // add() put it on top; move to the top-most original slot
            self._layers.shift(); self._layers.splice(top - 1, 0, pl); pl.source = inner; pl.selected = true;
            self.__lastPrecomp = inner; app.project.numItems++;
            return inner;
        }
    };
}
Object.defineProperty(CompItem.prototype, 'numLayers', { get: function () { return this._layers.length; } });
Object.defineProperty(CompItem.prototype, 'selectedLayers', { get: function () { return this._layers.filter(function (l) { return l.selected; }); } });
CompItem.prototype.layer = function (i) { return this._layers[i - 1]; };
var __fonts = { installed: ['ArialMT', 'Impact'], mode: 'keep' };

// factories used by tests: real AE class membership (instanceof) and layer geometry
function __mk(kind, name, o) {
    var C = { text: TextLayer, shape: ShapeLayer, solid: AVLayer, null: AVLayer, adjustment: AVLayer, footage: AVLayer, camera: CameraLayer, light: LightLayer }[kind];
    var L = new Layer(kind === 'adjustment' ? 'solid' : kind, name, o); Object.setPrototypeOf(L, C.prototype); L._comp = null; return L;
}
`;

function create() {
    var sandbox = {};
    var ctx = vm.createContext(sandbox);
    vm.runInContext(MOCK_SRC, ctx, { filename: 'mock-ae-src' });
    // ExtendScript globals
    sandbox.$ = { global: sandbox, evalFile: function (f) { vm.runInContext(fs.readFileSync(f.fsName, 'utf8'), ctx, { filename: f.fsName }); }, fileName: '' };
    sandbox.File = function (p) { this.fsName = p; this.parent = { fsName: path.dirname(p) }; };
    sandbox.ZELF_DIR = path.join(__dirname, '..', 'jsx');
    // restore Layer prototype methods onto subclass prototypes (instances created by __mk inherit via Object.setPrototypeOf)
    vm.runInContext('[AVLayer, CameraLayer, LightLayer].forEach(function (C) { Object.getOwnPropertyNames(Layer.prototype).forEach(function (k) { if (k !== "constructor") Object.defineProperty(C.prototype, k, Object.getOwnPropertyDescriptor(Layer.prototype, k)); }); });', ctx);
    vm.runInContext('$.global.ZELF_DIR = ' + JSON.stringify(sandbox.ZELF_DIR) + ';', ctx);
    vm.runInContext('$.evalFile(new File(' + JSON.stringify(path.join(sandbox.ZELF_DIR, 'main.jsx')) + '));', ctx);

    var api = {
        ctx: sandbox,
        run: function (cmd, params) { return JSON.parse(vm.runInContext('Zelf.run(' + JSON.stringify(cmd) + ',' + JSON.stringify(JSON.stringify(params || {})) + ')', ctx)); },
        comp: function (w, h) { var c = vm.runInContext('new CompItem(' + (w || 1920) + ',' + (h || 1080) + ')', ctx); sandbox.app.project.activeItem = c; return c; },
        layer: function (comp, kind, name, o) {
            sandbox.__tmp = o || {}; var L = vm.runInContext('__mk(' + JSON.stringify(kind) + ',' + JSON.stringify(name) + ',__tmp)', ctx);
            L._comp = comp; comp._layers.unshift(L); return L;
        },
        world: function (L, p) { sandbox.__a = L; sandbox.__b = p; return vm.runInContext('__worldOf(__a, __b)', ctx); },
        undo: function () { return sandbox.__undo; },
        fonts: function () { return sandbox.__fonts; },
        loadErrors: function () { return vm.runInContext('Zelf.loadErrors.slice()', ctx); },
        instanceOf: function (L, name) { sandbox.__a = L; return vm.runInContext('__a instanceof ' + name, ctx); }
    };
    return api;
}
module.exports = { create: create };
