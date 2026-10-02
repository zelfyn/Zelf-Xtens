/* Zelf-Xtens | jsx/anchor-position.jsx
 * anchor.move    - move Anchor Point to a 3x3 grid location of the layer bounds, Position compensated
 * position.align - align layer bounds to comp bounds / selection bounds (3x3 grid or single axis)
 *
 * Works on ONE selected layer of any type: text, shape, solid, null, adjustment, footage, precomp, camera, light.
 *  - bounds-based layers (everything except camera/light): anchor and position tools both apply
 *  - camera / light have no source bounds and no anchor point (their Point of Interest is something else), so they
 *    are treated as a single point at their world position: Position tools apply, Anchor tools skip them
 *  - ONE selected layer is always enough. "Align to Selection" aligns to the union of the selected layers when there are
 *    2+; with a single layer there is no other layer to align to, so it uses the composition instead (no error)
 */
(function () {

    function isPoint(layer) { return Zelf.isCameraOrLight(layer); }

    /** Layer bounds in layer space. Works for footage, solid, shape, text, precomp, null, adjustment. */
    function layerRect(layer, comp) {
        var r = null;
        if (isPoint(layer)) return null;
        try { r = layer.sourceRectAtTime(comp.time, false); } catch (e) { r = null; }
        if (!r || (r.width === 0 && r.height === 0)) {
            if (layer.width > 0 && layer.height > 0) return { left: 0, top: 0, width: layer.width, height: layer.height };
            return null;
        }
        return r;
    }

    function n(v) { return String(v); }
    function ptSrc(pt, is3D) { return "[" + n(pt[0]) + "," + n(pt[1]) + (is3D ? "," + n(pt[2] || 0) : "") + "]"; }

    /* ------------------------------------------------------------ evaluation
     * AE has no scripting API for "where is this layer point in world space" (toWorld/fromWorld are expression-only),
     * so expressions are evaluated on a temporary probe and removed again (see Zelf.Probe in main.jsx).
     * Camera and light layers cannot hold effects: they are measured through a temporary null in the same comp,
     * referenced by index. Both are cleaned up inside the command's single undo group.
     */
    function withTempNull(comp, fn) {
        var keep = [], i, nl = null, sel = comp.selectedLayers;
        for (i = 0; i < sel.length; i++) keep.push(sel[i].index);
        try {
            nl = comp.layers.addNull(comp.duration);
            nl.name = "zx_probe_host";
            return Zelf.withProbe(nl, fn);
        } finally {
            if (nl) { try { nl.remove(); } catch (e) { } }
            try {
                for (i = 1; i <= comp.numLayers; i++) {
                    var on = false, k;
                    for (k = 0; k < keep.length; k++) if (keep[k] === i) on = true;
                    comp.layer(i).selected = on;
                }
            } catch (e2) { }
        }
    }

    /** makers: functions (ref) -> expression text, where ref is how the expression refers to `layer`. -> [[x,y,z]...] */
    function evalMany(comp, layer, makers) {
        function runWith(pr, ref) {
            var out = [], i;
            for (i = 0; i < makers.length; i++) out.push(pr.eval(makers[i](ref)));
            return out;
        }
        if (!isPoint(layer)) {
            try { return Zelf.withProbe(layer, function (pr) { return runWith(pr, "thisLayer"); }); } catch (e) { }
        }
        return withTempNull(comp, function (pr) { return runWith(pr, "thisComp.layer(" + layer.index + ")"); });
    }

    /* layer-space point -> world space */
    function worldMaker(pt, is3D) {
        return function (ref) { return "var w=" + ref + ".toWorld(" + ptSrc(pt, is3D) + ");[w[0],w[1],(w.length>2?w[2]:0)]"; };
    }
    /* layer-space point -> the Position value (parent space) that would put that point exactly where it is now + delta */
    function parentSpaceMaker(pt, is3D, dx, dy) {
        return function (ref) {
            return "var w=" + ref + ".toWorld(" + ptSrc(pt, is3D) + ");w=[w[0]+" + n(dx) + ",w[1]+" + n(dy) + ",(w.length>2?w[2]:0)];" +
                "" + ref + ".hasParent?" + ref + ".parent.fromWorld(w):w";
        };
    }

    /** Math fallback (2D, ignores parents) used only if the probe cannot run. */
    function fallbackPoint(layer, src) {
        var tr = layer.property("ADBE Transform Group");
        var p = Zelf.readPos(layer);
        if (isPoint(layer)) return [p[0], p[1], p[2] || 0];
        var a = Zelf.arr(tr.property("ADBE Anchor Point").value);
        var s = Zelf.arr(tr.property("ADBE Scale").value);
        var rz = Zelf.num(tr.property("ADBE Rotate Z").value, 0) * Math.PI / 180;
        var dx = (src[0] - a[0]) * (s[0] / 100), dy = (src[1] - a[1]) * ((s[1] === undefined ? s[0] : s[1]) / 100);
        return [p[0] + dx * Math.cos(rz) - dy * Math.sin(rz), p[1] + dx * Math.sin(rz) + dy * Math.cos(rz), p[2] || 0];
    }

    /** Position value (parent space) that puts layer-space point `src` where it currently is. */
    function parentSpacePoint(comp, layer, src) {
        try {
            return evalMany(comp, layer, [parentSpaceMaker(src, Zelf.is3D(layer), 0, 0)])[0];
        } catch (e) {
            return fallbackPoint(layer, src);
        }
    }

    /** World-space box of the layer: bounds corners for normal layers, a zero-size box at the position for camera/light. */
    function worldBox(layer, comp) {
        var out = [], i, w, l = 1e12, t = 1e12, rr = -1e12, b = -1e12, r, pts, makers = [];
        if (isPoint(layer)) {
            try { out = evalMany(comp, layer, [worldMaker([0, 0, 0], true)]); }
            catch (e) { out = [fallbackPoint(layer, [0, 0, 0])]; }
        } else {
            r = layerRect(layer, comp);
            if (!r) return null;
            pts = [[r.left, r.top], [r.left + r.width, r.top], [r.left, r.top + r.height], [r.left + r.width, r.top + r.height]];
            for (i = 0; i < 4; i++) makers.push(worldMaker(pts[i], layer.threeDLayer));
            try { out = evalMany(comp, layer, makers); }
            catch (e2) { out = []; for (i = 0; i < 4; i++) out.push(fallbackPoint(layer, pts[i])); }
        }
        for (i = 0; i < out.length; i++) {
            w = out[i];
            if (w[0] < l) l = w[0]; if (w[0] > rr) rr = w[0];
            if (w[1] < t) t = w[1]; if (w[1] > b) b = w[1];
        }
        return { l: l, t: t, r: rr, b: b, w: rr - l, h: b - t };
    }

    /* ---------------------------------------------------------- anchor */
    function moveAnchor(layer, comp, ax, ay, compensate) {
        var tr = layer.property("ADBE Transform Group");
        var anchor = tr.property("ADBE Anchor Point");
        var r = layerRect(layer, comp);
        if (!r) return "empty";
        var cur = Zelf.arr(anchor.value);
        var na = [r.left + r.width * ax, r.top + r.height * ay];
        if (cur.length > 2) na.push(cur[2]);

        var newPos = null, pos0 = null;
        if (compensate) {
            if (Zelf.hasPositionExpression(layer)) return "expr";
            pos0 = Zelf.readPos(layer);
            newPos = parentSpacePoint(comp, layer, [na[0], na[1], na.length > 2 ? na[2] : 0]);   // measured BEFORE the anchor changes
        }
        var v = (na.length === 2) ? na : [na[0], na[1], na[2]];
        if (anchor.numKeys > 0) anchor.setValueAtTime(comp.time, v); else anchor.setValue(v);

        if (compensate) {
            Zelf.shiftPosition(layer, [newPos[0] - pos0[0], newPos[1] - pos0[1], layer.threeDLayer ? newPos[2] - pos0[2] : 0]);
        }
        return "ok";
    }

    Zelf.register("anchor.move", function (a) {
        var comp = Zelf.getComp();
        var sel = Zelf.selectedLayers(comp), layers = [], points = 0, i;
        for (i = 0; i < sel.layers.length; i++) { if (isPoint(sel.layers[i])) points++; else layers.push(sel.layers[i]); }
        if (!layers.length) {
            if (points) Zelf.fail("Camera and Light layers have no anchor bounds. Use Position mode for them.");
            Zelf.fail(sel.locked ? "Selected layers are locked." : "Select a layer.");
        }
        var ax = Zelf.clamp(Zelf.num(a.ax, 0.5), 0, 1), ay = Zelf.clamp(Zelf.num(a.ay, 0.5), 0, 1);
        var compensate = a.compensate !== false;
        var res = { ok: 0, skip: sel.locked + points, expr: 0 }, st;
        Zelf.undo("Anchor Point", function () {
            for (i = 0; i < layers.length; i++) {
                try {
                    st = moveAnchor(layers[i], comp, ax, ay, compensate);
                    if (st === "ok") res.ok++; else if (st === "expr") res.expr++; else res.skip++;
                } catch (e) { res.skip++; res.last = e.message; }
            }
        });
        if (!res.ok) Zelf.fail(res.expr ? "Position has an expression; anchor not moved." : "Nothing changed" + (res.last ? ": " + res.last : "."));
        var msg = "Anchor moved on " + Zelf.plural(res.ok, "layer", "layers");
        if (res.skip || res.expr) msg += " (" + (res.skip + res.expr) + " skipped)";
        return { ok: true, msg: msg };
    });

    /* -------------------------------------------------------- position */
    Zelf.register("position.align", function (a) {
        var comp = Zelf.getComp();
        var sel = Zelf.selectedLayers(comp);
        if (!sel.layers.length) Zelf.fail(sel.locked ? "Selected layers are locked." : "Select a layer.");
        var ax = (a.ax === null || a.ax === undefined) ? null : Zelf.clamp(Zelf.num(a.ax, 0.5), 0, 1);
        var ay = (a.ay === null || a.ay === undefined) ? null : Zelf.clamp(Zelf.num(a.ay, 0.5), 0, 1);
        if (ax === null && ay === null) Zelf.fail("Choose an alignment.");
        var wantSel = a.target === "selection", toSel = wantSel && sel.layers.length >= 2;
        var fellBack = wantSel && !toSel;      // one layer + Selection: align to the composition instead of failing

        var moved = 0, skipped = sel.locked;
        Zelf.undo("Align Position", function () {
            var infos = [], i, L, box, T, dx, dy, u = null, info, np, p0;
            for (i = 0; i < sel.layers.length; i++) {
                L = sel.layers[i];
                try { box = worldBox(L, comp); } catch (e) { box = null; }
                if (box && !Zelf.hasPositionExpression(L)) infos.push({ layer: L, box: box }); else skipped++;
            }
            if (!infos.length) return;
            if (toSel) {
                u = { l: 1e12, t: 1e12, r: -1e12, b: -1e12 };
                for (i = 0; i < infos.length; i++) {
                    box = infos[i].box;
                    if (box.l < u.l) u.l = box.l; if (box.t < u.t) u.t = box.t;
                    if (box.r > u.r) u.r = box.r; if (box.b > u.b) u.b = box.b;
                }
                T = { l: u.l, t: u.t, w: u.r - u.l, h: u.b - u.t };
            } else {
                T = { l: 0, t: 0, w: comp.width, h: comp.height };
            }
            for (i = 0; i < infos.length; i++) {
                info = infos[i]; box = info.box; L = info.layer;
                dx = (ax === null) ? 0 : (T.l + ax * T.w) - (box.l + ax * box.w);
                dy = (ay === null) ? 0 : (T.t + ay * T.h) - (box.t + ay * box.h);
                if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) { moved++; continue; }
                try {
                    p0 = Zelf.readPos(L);
                    // world delta -> Position delta (parent space), measured with the layer's own transform chain
                    np = null;
                    try {
                        np = evalMany(comp, L, [(function (layer) {
                            return function (ref) {
                                var origin = isPoint(layer) ? "[0,0,0]" : ref + ".transform.anchorPoint";
                                return "var w=" + ref + ".toWorld(" + origin + ");w=[w[0]+" + n(dx) + ",w[1]+" + n(dy) + ",(w.length>2?w[2]:0)];" +
                                    ref + ".hasParent?" + ref + ".parent.fromWorld(w):w";
                            };
                        })(L)])[0];
                    } catch (e2) { np = [p0[0] + dx, p0[1] + dy, p0[2]]; }
                    Zelf.shiftPosition(L, [np[0] - p0[0], np[1] - p0[1], Zelf.is3D(L) ? np[2] - p0[2] : 0]);
                    moved++;
                } catch (e3) { skipped++; }
            }
        });
        if (!moved) Zelf.fail("Nothing moved (layers empty or Position has an expression).");
        return { ok: true, msg: "Aligned " + Zelf.plural(moved, "layer", "layers") + (fellBack ? " to the composition" : "") + (skipped ? " (" + skipped + " skipped)" : "") };
    });
})();
