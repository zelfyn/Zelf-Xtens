/* Zelf-Xtens | jsx/main.jsx
 * Namespace, JSON, command dispatcher and helpers shared by every module.
 *
 * ExtendScript rules followed in ALL .jsx files (After Effects 2020 = ES3 + a few extras):
 *  - no let/const/arrow functions/template strings/trailing commas
 *  - no Array.prototype.forEach/map/filter/indexOf, no Object.keys, no native JSON
 *  - every AE-modifying command runs inside one undo group (Zelf.undo)
 */
var Zelf = { VERSION: "1.3.3", commands: {}, loadErrors: [] };
$.global.ZelfState = $.global.ZelfState || {};   // survives re-loading of this file

/* ------------------------------------------------------------------ JSON */
Zelf.json = (function () {
    function quote(s) {
        return '"' + s.replace(/[\\"\u0000-\u001f\u007f-\uffff]/g, function (c) {
            switch (c) {
                case '"': return '\\"';
                case "\\": return "\\\\";
                case "\n": return "\\n";
                case "\r": return "\\r";
                case "\t": return "\\t";
            }
            return "\\u" + ("0000" + c.charCodeAt(0).toString(16)).slice(-4);
        }) + '"';
    }
    function isArr(v) { return Object.prototype.toString.call(v) === "[object Array]"; }
    function str(v) {
        var t = typeof v, i, out, k;
        if (v === null || v === undefined) return "null";
        if (t === "number") return isFinite(v) ? String(v) : "null";
        if (t === "boolean") return v ? "true" : "false";
        if (t === "string") return quote(v);
        if (isArr(v)) {
            out = [];
            for (i = 0; i < v.length; i++) out.push(str(v[i]));
            return "[" + out.join(",") + "]";
        }
        if (t === "object") {
            out = [];
            for (k in v) {
                if (v.hasOwnProperty(k) && typeof v[k] !== "function" && v[k] !== undefined) {
                    out.push(quote(k) + ":" + str(v[k]));
                }
            }
            return "{" + out.join(",") + "}";
        }
        return "null";
    }
    function parse(s) {
        // Same safety check json2.js uses before eval() - input only comes from our own panel.
        var probe = s.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, "@")
            .replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, "]")
            .replace(/(?:^|:|,)(?:\s*\[)+/g, "");
        if (!/^[\],:{}\s]*$/.test(probe)) throw new Error("Bad JSON from panel");
        return eval("(" + s + ")");
    }
    return { stringify: str, parse: parse };
})();

/* --------------------------------------------------------------- helpers */
Zelf.isArray = function (v) { return Object.prototype.toString.call(v) === "[object Array]"; };
Zelf.arr = function (v) {
    var o = [], i;
    if (Zelf.isArray(v)) { for (i = 0; i < v.length; i++) o.push(v[i]); return o; }
    return [v];
};
Zelf.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
Zelf.num = function (v, def) { v = Number(v); return isNaN(v) ? def : v; };

/** Throw a user-level (validation) error: shown as a soft warning in the panel. */
Zelf.fail = function (msg) { var e = new Error(msg); e.zelfUser = true; throw e; };

Zelf.errorResult = function (e) {
    if (e && e.zelfUser) return { ok: false, kind: "invalid", msg: String(e.message) };
    var m = (e && e.message) ? e.message : String(e);
    if (e && e.line) m += " (line " + e.line + ")";
    return { ok: false, kind: "error", msg: m, file: (e && e.fileName) ? String(e.fileName).replace(/^.*[\/\\]/, "") : "" };
};

Zelf.register = function (name, fn) { Zelf.commands[name] = fn; };

/** Entry point called by the panel:  Zelf.run("cmd", "{json}")  ->  JSON string. */
Zelf.run = function (cmd, argJson) {
    var res;
    try {
        var fn = Zelf.commands[cmd];
        if (!fn) throw new Error("Unknown command: " + cmd);
        var args = argJson ? Zelf.json.parse(argJson) : {};
        var out = fn(args);
        res = (out && out.ok !== undefined) ? out : { ok: true, data: out };
    } catch (e) {
        res = Zelf.errorResult(e);
    }
    try { return Zelf.json.stringify(res); }
    catch (e2) { return '{"ok":false,"kind":"error","msg":"Result serialisation failed"}'; }
};

/** One clean Undo step per button press. */
Zelf.undo = function (name, fn) {
    app.beginUndoGroup("Zelf-Xtens: " + name);
    try { return fn(); } finally { app.endUndoGroup(); }
};

/* ------------------------------------------------------- selection utils */
Zelf.getComp = function () {
    var c = null;
    try { c = app.project.activeItem; } catch (e) { c = null; }
    if (!c || !(c instanceof CompItem)) Zelf.fail("Select a composition.");
    return c;
};

Zelf.isCameraOrLight = function (l) { return (l instanceof CameraLayer) || (l instanceof LightLayer); };

/** Selected layers usable for 2D-style operations. Returns {layers, skipped}. */
Zelf.selectedAV = function (comp) {
    var sel = comp.selectedLayers, out = [], skipped = 0, i;
    for (i = 0; i < sel.length; i++) {
        if ((sel[i] instanceof AVLayer) && !sel[i].locked) out.push(sel[i]); else skipped++;
    }
    return { layers: out, skipped: skipped };
};

/** Selected unlocked layers of ANY type (text, shape, solid, null, adjustment, footage, precomp, camera, light...).
 *  Deliberately no instanceof AVLayer test: that would silently drop layer types. */
Zelf.selectedLayers = function (comp) {
    var sel = comp.selectedLayers, out = [], locked = 0, i;
    for (i = 0; i < sel.length; i++) { if (sel[i].locked) locked++; else out.push(sel[i]); }
    return { layers: out, locked: locked };
};
/** Camera and light layers: always 3D, have no source bounds and no effects. */
Zelf.is3D = function (layer) { return Zelf.isCameraOrLight(layer) || !!layer.threeDLayer; };

Zelf.layerOfProp = function (p) { return p.propertyGroup(p.propertyDepth); };

Zelf.plural = function (n, one, many) { return n + " " + (n === 1 ? one : many); };

/* --------------------------------------------------- position read/shift */
Zelf.positionProps = function (layer) {
    var tr = layer.property("ADBE Transform Group"), pos = tr.property("ADBE Position"), list = [], i, d, n;
    if (pos && pos.dimensionsSeparated) {
        n = Zelf.is3D(layer) ? 3 : 2;
        for (i = 0; i < n; i++) {
            d = tr.property("ADBE Position_" + i);
            if (d) list.push({ prop: d, dim: i });
        }
        return list;
    }
    return [{ prop: pos, dim: -1 }];
};

Zelf.readPos = function (layer) {
    var list = Zelf.positionProps(layer), out = [0, 0, 0], j, v, i;
    for (j = 0; j < list.length; j++) {
        v = list[j].prop.value;
        if (list[j].dim >= 0) out[list[j].dim] = v;
        else { v = Zelf.arr(v); for (i = 0; i < v.length && i < 3; i++) out[i] = v[i]; }
    }
    return out;
};

Zelf.hasPositionExpression = function (layer) {
    var list = Zelf.positionProps(layer), j;
    for (j = 0; j < list.length; j++) if (list[j].prop.expressionEnabled) return true;
    return false;
};

/** Add a vector to Position. Animated position: every keyframe is offset so the motion path keeps its shape. */
Zelf.shiftPosition = function (layer, delta) {
    var list = Zelf.positionProps(layer), j, k, p, e, v, i, o;
    function addTo(dim, val) {
        if (dim >= 0) return val + (delta[dim] || 0);
        var a = Zelf.arr(val), r = [];
        for (i = 0; i < a.length; i++) r.push(a[i] + (delta[i] || 0));
        return r;
    }
    for (j = 0; j < list.length; j++) {
        e = list[j]; p = e.prop;
        if (p.numKeys > 0) {
            for (k = 1; k <= p.numKeys; k++) p.setValueAtKey(k, addTo(e.dim, p.keyValue(k)));
        } else {
            p.setValue(addTo(e.dim, p.value));
        }
    }
};

/* ----------------------------------------------------------------- probe
 * AE has no scripting API for "where is this layer point in world space" (toWorld/fromWorld are
 * expression-only). A Probe adds ONE temporary 3D Point Control to a layer, evaluates an expression on it,
 * reads the result and removes the effect again. Always used inside an undo group and closed in finally.
 */
Zelf.Probe = function (layer) { this.layer = layer; this.fx = null; this.prop = null; };
Zelf.Probe.prototype.open = function () {
    if (this.fx) return;
    var grp = this.layer.property("ADBE Effect Parade");
    if (!grp) throw new Error("Layer has no effects group");
    this.fx = grp.addProperty("ADBE Point3D Control");
    this.fx.name = "zx_probe";
    this.prop = this.fx.property(1);
};
Zelf.Probe.prototype.eval = function (expr) {
    this.open();
    this.prop.expression = expr;
    var v = this.prop.value, err = this.prop.expressionError;
    if (err) throw new Error("Probe expression error: " + err);
    return [v[0], v[1], v[2]];
};
Zelf.Probe.prototype.close = function () {
    if (this.fx) { try { this.fx.remove(); } catch (e) { } this.fx = null; this.prop = null; }
};
/** Run fn(probe) and always remove the temporary effect. */
Zelf.withProbe = function (layer, fn) {
    var pr = new Zelf.Probe(layer);
    try { return fn(pr); } finally { pr.close(); }
};

/* --------------------------------------------------------- load modules */
(function () {
    var dir = "";
    try { dir = $.global.ZELF_DIR || File($.fileName).parent.fsName; } catch (e) { dir = ""; }
    Zelf.dir = dir;
    var mods = ["anchor-position.jsx", "graph.jsx", "shortcuts.jsx"], i;
    for (i = 0; i < mods.length; i++) {
        try { $.evalFile(new File(dir + "/" + mods[i])); }
        catch (e) { Zelf.loadErrors.push(mods[i] + ": " + (e && e.message ? e.message : e)); }
    }
})();

Zelf.register("ping", function () {
    return { version: Zelf.VERSION, ae: app.version, loadErrors: Zelf.loadErrors, commands: (function () {
        var o = [], k; for (k in Zelf.commands) if (Zelf.commands.hasOwnProperty(k)) o.push(k); return o;
    })() };
});
