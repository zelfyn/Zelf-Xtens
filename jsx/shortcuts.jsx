/* Zelf-Xtens | jsx/shortcuts.jsx
 * marker.prev / marker.next, comp.create, null.parent, adjustment.create, solid.create,
 * text.center, light.create, camera.create, precomp.create, stair.apply, stair.reset
 */
(function () {

    function frames(comp, t) {
        try { return timeToCurrentFormat(t, 1 / comp.frameDuration); } catch (e) { return String(Math.round(t * 100) / 100) + "s"; }
    }

    /** Topmost selected layer index (1 = top), or 0 when nothing is selected. */
    function topSelectedIndex(comp) {
        var sel = comp.selectedLayers, i, m = 0;
        for (i = 0; i < sel.length; i++) if (m === 0 || sel[i].index < m) m = sel[i].index;
        return m;
    }
    function selectOnly(comp, layer) {
        var sel = comp.selectedLayers, i;
        for (i = 0; i < sel.length; i++) sel[i].selected = false;
        layer.selected = true;
    }
    /** Put a new layer just above the current selection (like the AE UI does); default is the top. */
    function placeAbove(comp, layer, topIdx) {
        // new layers are inserted at index 1, so the previously top-selected layer is now at topIdx + 1
        if (topIdx > 0 && topIdx + 1 <= comp.numLayers) { try { layer.moveBefore(comp.layer(topIdx + 1)); } catch (e) { } }
    }

    /* ------------------------------------------------------------ markers */
    function markerTimes(comp) {
        var t = [], mp = null, i, j, lays, L, m;
        try { mp = comp.markerProperty; } catch (e) { mp = null; }
        if (mp) {                                   // composition markers (AE 2020+)
            for (i = 1; i <= mp.numKeys; i++) t.push(mp.keyTime(i));
            return t;
        }
        lays = comp.selectedLayers.length ? comp.selectedLayers : (function () {   // fallback: layer markers
            var o = [], k; for (k = 1; k <= comp.numLayers; k++) o.push(comp.layer(k)); return o;
        })();
        for (i = 0; i < lays.length; i++) {
            L = lays[i]; m = L.property("ADBE Marker");
            if (m) for (j = 1; j <= m.numKeys; j++) t.push(m.keyTime(j) );
        }
        return t;
    }

    function gotoMarker(dir) {
        var comp = Zelf.getComp(), times = markerTimes(comp), tol = comp.frameDuration / 2, cur = comp.time, best = null, i, x;
        for (i = 0; i < times.length; i++) {
            x = times[i];
            if (dir < 0 && x < cur - tol && (best === null || x > best)) best = x;
            if (dir > 0 && x > cur + tol && (best === null || x < best)) best = x;
        }
        if (best === null) Zelf.fail("No marker found.");
        comp.time = Zelf.clamp(best, 0, comp.duration);
        return { ok: true, msg: (dir < 0 ? "Previous" : "Next") + " marker: " + frames(comp, comp.time) };
    }
    Zelf.register("marker.prev", function () { return gotoMarker(-1); });
    Zelf.register("marker.next", function () { return gotoMarker(1); });

    /* --------------------------------------------------------- create comp */
    Zelf.register("comp.create", function () {
        var sel = [], items = app.project.selection, i, it, w = 1920, h = 1080, pa = 1, dur = 10, fps = 30, name, ref = null;
        for (i = 0; i < items.length; i++) {
            it = items[i];
            if ((it instanceof FootageItem || it instanceof CompItem) && it.width > 0 && it.height > 0) sel.push(it);
        }
        var act = app.project.activeItem;
        if (sel.length) ref = sel[0];
        else if (act && (act instanceof CompItem)) ref = act;
        if (ref) {
            w = ref.width; h = ref.height; pa = ref.pixelAspect || 1;
            if (ref.duration > 0) dur = ref.duration;
            if (ref.frameRate > 0) fps = ref.frameRate;
        }
        var made = null;
        Zelf.undo("Create Comp", function () {
            if (sel.length) name = sel[0].name.replace(/\.[^\.]+$/, ""); else name = "Comp " + (app.project.numItems + 1);
            made = app.project.items.addComp(name, w, h, pa, dur, fps);
            for (i = sel.length - 1; i >= 0; i--) made.layers.add(sel[i]);
            made.openInViewer();
        });
        return { ok: true, msg: "Created comp \"" + made.name + "\" " + w + "x" + h };
    });

    /* ----------------------------------------------------------- null parent */
    function worldOrigin(probe, layer) {
        var isCam = (layer instanceof CameraLayer) || (layer instanceof LightLayer);
        var src = isCam ? "[0,0,0]" : "L.transform.anchorPoint";
        return probe.eval("var L=thisComp.layer(" + layer.index + ");var w=L.toWorld(" + src + ");[w[0],w[1],(w.length>2?w[2]:0)]");
    }

    Zelf.register("null.parent", function () {
        var comp = Zelf.getComp(), sel = comp.selectedLayers, kids = [], cams = [], i, L, locked = 0;
        for (i = 0; i < sel.length; i++) {
            L = sel[i];
            if (L.locked) { locked++; continue; }
            if (L instanceof CameraLayer) cams.push(L); else kids.push(L);
        }
        if (!kids.length && !cams.length) Zelf.fail(locked ? "Selected layers are locked." : "Select a layer or a camera.");
        var all = cams.concat(kids), topIdx = topSelectedIndex(comp), warn = "";
        var nl = null;
        Zelf.undo("Null Parent", function () {
            var is3D = cams.length > 0, k;
            if (!is3D) { is3D = true; for (k = 0; k < kids.length; k++) if (!kids[k].threeDLayer) is3D = false; }
            nl = comp.layers.addNull(comp.duration);
            nl.name = cams.length ? "Camera Null" : "Null Parent";
            if (is3D) nl.threeDLayer = true;
            var before = [], j, w, sum = [0, 0, 0], target, np;
            // 1) measure world origin of every future child (through a probe on the null itself)
            var pr = new Zelf.Probe(nl);
            try {
                for (j = 0; j < all.length; j++) { w = worldOrigin(pr, all[j]); before.push(w); }
            } catch (e) { before = null; warn = " (transform not verified)"; }
            // 2) place the null at the camera, or at the centre of the selected layers
            if (before) {
                if (cams.length) target = before[0];
                else {
                    for (j = 0; j < before.length; j++) { sum[0] += before[j][0]; sum[1] += before[j][1]; sum[2] += before[j][2]; }
                    target = [sum[0] / before.length, sum[1] / before.length, sum[2] / before.length];
                }
                nl.property("ADBE Transform Group").property("ADBE Position").setValue(is3D ? target : [target[0], target[1]]);
            }
            // 3) parent, then verify the layer did not move; correct with the null's identity transform if needed
            for (j = 0; j < all.length; j++) {
                all[j].parent = nl;
                if (before) {
                    try {
                        var now = worldOrigin(pr, all[j]), dx = before[j][0] - now[0], dy = before[j][1] - now[1], dz = before[j][2] - now[2];
                        if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dz) > 0.01) {
                            Zelf.shiftPosition(all[j], [dx, dy, all[j].threeDLayer ? dz : 0]);
                        }
                    } catch (e2) { warn = " (transform not verified)"; }
                }
            }
            pr.close();
            placeAbove(comp, nl, topIdx);
            selectOnly(comp, nl);
        });
        return { ok: true, msg: (cams.length ? "Camera parented to null" : "Null parent created for " + Zelf.plural(kids.length, "layer", "layers")) + warn };
    });

    /* ----------------------------------------------------- simple creators */
    Zelf.register("adjustment.create", function () {
        var comp = Zelf.getComp(), topIdx = topSelectedIndex(comp), L;
        Zelf.undo("Adjustment Layer", function () {
            L = comp.layers.addSolid([1, 1, 1], "Adjustment Layer", comp.width, comp.height, comp.pixelAspect, comp.duration);
            L.adjustmentLayer = true;
            placeAbove(comp, L, topIdx);
            selectOnly(comp, L);
        });
        return { ok: true, msg: "Adjustment layer created" };
    });

    Zelf.register("solid.create", function (a) {
        var comp = Zelf.getComp(), topIdx = topSelectedIndex(comp), L;
        var c = (Zelf.isArray(a.color) && a.color.length >= 3) ? [Zelf.clamp(Zelf.num(a.color[0], 0.5), 0, 1), Zelf.clamp(Zelf.num(a.color[1], 0.5), 0, 1), Zelf.clamp(Zelf.num(a.color[2], 0.5), 0, 1)] : [0.5, 0.5, 0.5];
        Zelf.undo("Solid", function () {
            L = comp.layers.addSolid(c, "Solid", comp.width, comp.height, comp.pixelAspect, comp.duration);
            placeAbove(comp, L, topIdx);
            selectOnly(comp, L);
        });
        return { ok: true, msg: "Solid created" };
    });

    function rgb3(c, def) {
        if (!(Zelf.isArray(c) && c.length >= 3)) return def;
        return [Zelf.clamp(Zelf.num(c[0], def[0]), 0, 1), Zelf.clamp(Zelf.num(c[1], def[1]), 0, 1), Zelf.clamp(Zelf.num(c[2], def[2]), 0, 1)];
    }

    /* text.center {text, color?}
     * color : [r,g,b] 0..1 fill colour, default white. Font is left to After Effects (its default / last used font). */
    Zelf.register("text.center", function (a) {
        var comp = Zelf.getComp(), topIdx = topSelectedIndex(comp), L;
        var txt = (a && a.text) ? String(a.text) : "Text";
        var col = rgb3(a ? a.color : null, [1, 1, 1]);
        Zelf.undo("Center Text", function () {
            L = comp.layers.addText(txt);
            var st = L.property("ADBE Text Properties").property("ADBE Text Document"), td = st.value;
            td.justification = ParagraphJustification.CENTER_JUSTIFY;
            td.applyFill = true;
            td.fillColor = col;
            st.setValue(td);
            var r = L.sourceRectAtTime(comp.time, false), tr = L.property("ADBE Transform Group");
            tr.property("ADBE Anchor Point").setValue([r.left + r.width / 2, r.top + r.height / 2]);
            tr.property("ADBE Position").setValue([comp.width / 2, comp.height / 2]);
            placeAbove(comp, L, topIdx);
            selectOnly(comp, L);
        });
        return { ok: true, msg: "Text created (double-click it in the Comp panel to edit)." };
    });

    Zelf.register("light.create", function () {
        var comp = Zelf.getComp(), topIdx = topSelectedIndex(comp), L;
        Zelf.undo("Light", function () {
            L = comp.layers.addLight("Light", [comp.width / 2, comp.height / 2]);
            L.lightType = LightType.POINT;      // only affects 3D layers, so existing 2D renders do not change
            L.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2, -Math.round(comp.width / 2)]);
            placeAbove(comp, L, topIdx);
            selectOnly(comp, L);
        });
        return { ok: true, msg: "Light created" };
    });

    /* camera.create - 50mm camera that frames the comp exactly (zoom = comp width * 50 / 36, z = -zoom), like the AE preset.
     * Only affects 3D layers, so existing 2D renders do not change. */
    Zelf.register("camera.create", function () {
        var comp = Zelf.getComp(), topIdx = topSelectedIndex(comp), L, n = 1, i, zoom = comp.width * 50 / 36;
        for (i = 1; i <= comp.numLayers; i++) if (comp.layer(i) instanceof CameraLayer) n++;
        Zelf.undo("Camera", function () {
            L = comp.layers.addCamera("Camera " + n, [comp.width / 2, comp.height / 2]);
            try { L.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(zoom); } catch (e) { }
            L.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2, -zoom]);
            placeAbove(comp, L, topIdx);
            selectOnly(comp, L);
        });
        return { ok: true, msg: "Camera created (50mm)" };
    });

    /* precomp.create - precompose the selected layers (Move all attributes), like Layer > Pre-compose. */
    Zelf.register("precomp.create", function () {
        var comp = Zelf.getComp(), sel = comp.selectedLayers, idx = [], i, L, locked = 0, points = 0, name, made = null, first = null;
        for (i = 0; i < sel.length; i++) {
            L = sel[i];
            if (L.locked) locked++;
            else if (Zelf.isCameraOrLight(L)) points++;       // camera / light layers cannot be precomposed
            else { idx.push(L.index); if (!first || L.index < first.index) first = L; }
        }
        if (!idx.length) Zelf.fail(locked ? "Selected layers are locked." : (points ? "Camera and light layers cannot be precomposed." : "Select one or more layers to precompose."));
        idx.sort(function (p, q) { return p - q; });
        name = (idx.length === 1) ? (first.name + " Comp") : ("Precomp " + (app.project.numItems + 1));
        Zelf.undo("Precomp", function () { made = comp.layers.precompose(idx, name, true); });
        var skipped = locked + points;
        return { ok: true, msg: "Precomposed " + Zelf.plural(idx.length, "layer", "layers") + " into \"" + (made && made.name ? made.name : name) + "\"" + (skipped ? " (" + skipped + " skipped)" : "") };
    });

    /* ------------------------------------------------------ stair / sequence */
    Zelf.register("stair.apply", function (a) {
        var comp = Zelf.getComp(), sel = Zelf.selectedAV(comp), lays = sel.layers, i;
        var keep = [];
        for (i = 0; i < lays.length; i++) if (!Zelf.isCameraOrLight(lays[i])) keep.push(lays[i]);
        lays = keep;
        if (lays.length < 2) Zelf.fail("Select 2 or more layers.");
        var order = a.order || "top", mode = a.mode || "stair", dir = a.dir || "forward";
        var off = Zelf.num(a.offset, 5) * comp.frameDuration;

        var arr = [];
        for (i = 0; i < lays.length; i++) arr.push(lays[i]);

        arr.sort(function (p, q) {
            if (order === "bottom") return q.index - p.index;
            if (order === "start") { var d = p.inPoint - q.inPoint; return d !== 0 ? d : p.index - q.index; }
            return p.index - q.index;
        });
        if (dir === "backward") arr.reverse();

        var base = 1e12, snap = { comp: comp.id, items: [] };
        for (i = 0; i < arr.length; i++) if (arr[i].inPoint < base) base = arr[i].inPoint;
        for (i = 0; i < arr.length; i++) snap.items.push({ index: arr[i].index, name: arr[i].name, start: arr[i].startTime });

        Zelf.undo("Stair Sequence", function () {
            var cur = base, inP, L;
            for (i = 0; i < arr.length; i++) {
                L = arr[i];
                inP = (mode === "sequence") ? cur : base + i * off;
                L.startTime = L.startTime + (inP - L.inPoint);    // moves the whole layer: trim/duration preserved
                if (mode === "sequence") cur = L.outPoint + off;
            }
        });
        $.global.ZelfState.stair = snap;
        return { ok: true, msg: (mode === "sequence" ? "Sequenced " : "Stair-stepped ") + Zelf.plural(arr.length, "layer", "layers") };
    });

    Zelf.register("stair.reset", function () {
        var comp = Zelf.getComp(), snap = $.global.ZelfState.stair, i, n = 0, it, L;
        if (!snap || snap.comp !== comp.id) Zelf.fail("Nothing to reset in this composition.");
        Zelf.undo("Reset Stair", function () {
            for (i = 0; i < snap.items.length; i++) {
                it = snap.items[i];
                if (it.index > comp.numLayers) continue;
                L = comp.layer(it.index);
                if (L.name !== it.name || L.locked) continue;
                L.startTime = it.start; n++;
            }
        });
        if (!n) Zelf.fail("Layers changed since the last stair; cannot reset.");
        $.global.ZelfState.stair = null;
        return { ok: true, msg: "Restored timing of " + Zelf.plural(n, "layer", "layers") };
    });
})();
