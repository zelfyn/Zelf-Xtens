/* Zelf-Xtens | jsx/graph.jsx
 * graph.apply   - applies the curve chosen in the panel to exactly 2 selected keyframes
 * graph.inspect - reports what is selected (called on demand, never polled)
 *
 * The easing MATH lives in the panel (js/graph-presets.js) so preview == result. This file only maps
 * a normalised curve (0..1) onto real AE keyframes:
 *   mode "native"  : cubic-bezier(x1,y1,x2,y2) -> KeyframeEase speed/influence on the two keys (2 keys only)
 *   mode "linear"  : both keys LINEAR
 *   mode "sampled" : intermediate keyframes at the given normalised times/values (bounce, elastic, random...)
 * Spatial (motion-path) properties keep their path: sampled points are taken along the Bezier path by arc length.
 */
(function () {
    var PVT = PropertyValueType, KIT = KeyframeInterpolationType;

    function supported(p) {
        var t = p.propertyValueType;
        return t === PVT.OneD || t === PVT.TwoD || t === PVT.ThreeD || t === PVT.TwoD_SPATIAL || t === PVT.ThreeD_SPATIAL || t === PVT.COLOR;
    }
    function dimsOf(p) {
        if (p.isSpatial) return 1;
        var t = p.propertyValueType;
        if (t === PVT.TwoD) return 2;
        if (t === PVT.ThreeD) return 3;
        if (t === PVT.COLOR) return 4;
        return 1;
    }

    /** Find every selected property that has exactly 2 selected keyframes. */
    function collect(comp) {
        var sp = comp.selectedProperties, out = [], info = { withKeys: 0, unsupported: 0, locked: 0, targets: out }, i, p, sk, lay;
        for (i = 0; i < sp.length; i++) {
            p = sp[i];
            if (p.propertyType !== PropertyType.PROPERTY || p.numKeys < 1) continue;
            info.withKeys++;
            sk = p.selectedKeys;
            if (sk.length !== 2) continue;
            if (!supported(p)) { info.unsupported++; continue; }
            lay = Zelf.layerOfProp(p);
            if (lay && lay.locked) { info.locked++; continue; }
            out.push({ prop: p, k1: Math.min(sk[0], sk[1]), k2: Math.max(sk[0], sk[1]) });
        }
        return info;
    }

    /* ------------------------------------------------ spatial path model */
    function bez3(P, u) {
        var o = [], d, m = 1 - u;
        for (d = 0; d < P[0].length; d++) {
            o.push(m * m * m * P[0][d] + 3 * m * m * u * P[1][d] + 3 * m * u * u * P[2][d] + u * u * u * P[3][d]);
        }
        return o;
    }
    function dist(a, b) { var s = 0, i; for (i = 0; i < a.length; i++) s += (a[i] - b[i]) * (a[i] - b[i]); return Math.sqrt(s); }
    function unit(a, b) {   // unit vector a->b, or null if degenerate
        var l = dist(a, b), o = [], i;
        if (l < 1e-9) return null;
        for (i = 0; i < a.length; i++) o.push((b[i] - a[i]) / l);
        return o;
    }

    /** Motion-path model between two spatial keys: total length + point at arc-length fraction f (extrapolates outside 0..1). */
    function pathModel(p, k1, k2) {
        var s = Zelf.arr(p.keyValue(k1)), e = Zelf.arr(p.keyValue(k2));
        var ot = Zelf.arr(p.keyOutSpatialTangent(k1)), it = Zelf.arr(p.keyInSpatialTangent(k2));
        var P = [s, [], [], e], d, N = 64, pts = [], lens = [0], j;
        for (d = 0; d < s.length; d++) { P[1][d] = s[d] + (ot[d] || 0); P[2][d] = e[d] + (it[d] || 0); }
        for (j = 0; j <= N; j++) {
            pts.push(bez3(P, j / N));
            if (j > 0) lens.push(lens[j - 1] + dist(pts[j - 1], pts[j]));
        }
        var total = lens[N];
        var d0 = unit(s, P[1]) || unit(s, e), d1 = unit(P[2], e) || unit(s, e);
        function at(f) {
            var o = [], i, tgt, lo, hi, mid, w;
            if (total < 1e-9) return s.slice(0);
            if (f <= 0) { for (i = 0; i < s.length; i++) o.push(s[i] + (d0 ? d0[i] * f * total : 0)); return o; }
            if (f >= 1) { for (i = 0; i < e.length; i++) o.push(e[i] + (d1 ? d1[i] * (f - 1) * total : 0)); return o; }
            tgt = f * total; lo = 0; hi = N;
            while (hi - lo > 1) { mid = (lo + hi) >> 1; if (lens[mid] <= tgt) lo = mid; else hi = mid; }
            w = (lens[hi] - lens[lo]) < 1e-12 ? 0 : (tgt - lens[lo]) / (lens[hi] - lens[lo]);
            for (i = 0; i < s.length; i++) o.push(pts[lo][i] + (pts[hi][i] - pts[lo][i]) * w);
            return o;
        }
        return { length: total, at: at };
    }

    /* Some AE versions reset spatial tangents when interpolation types change, so we snapshot/restore them. */
    function snapSpatial(p, k) {
        if (!p.isSpatial) return null;
        try {
            return { auto: p.keySpatialAutoBezier(k), cont: p.keySpatialContinuous(k), i: p.keyInSpatialTangent(k), o: p.keyOutSpatialTangent(k) };
        } catch (e) { return null; }
    }
    function restoreSpatial(p, k, s) {
        if (!s) return;
        try {
            if (s.auto) p.setSpatialAutoBezierAtKey(k, true);
            else { p.setSpatialTangentsAtKey(k, s.i, s.o); p.setSpatialContinuousAtKey(k, s.cont); }
        } catch (e) { }
    }

    function easeOrDefault(p, list, dims) {
        var o = [], i;
        try { if (list && list.length === dims) return list; } catch (e) { }
        for (i = 0; i < dims; i++) o.push(new KeyframeEase(0, 16.6667));
        return o;
    }

    function unroveAndDecouple(p, k) {
        try { if (p.isSpatial && p.keyRoving(k)) p.setRovingAtKey(k, false); } catch (e) { }
        try { p.setTemporalAutoBezierAtKey(k, false); } catch (e2) { }
        try { p.setTemporalContinuousAtKey(k, false); } catch (e3) { }
    }

    /* -------------------------------------------------------- native */
    function applyNative(t, bz) {
        var p = t.prop, k1 = t.k1, k2 = t.k2, dims = dimsOf(p), dt = p.keyTime(k2) - p.keyTime(k1);
        if (dt <= 0) throw new Error("Keyframes share the same time.");
        var s = Zelf.arr(p.keyValue(k1)), e = Zelf.arr(p.keyValue(k2)), dv = [], d;
        if (p.isSpatial) dv.push(pathModel(p, k1, k2).length);
        else for (d = 0; d < dims; d++) dv.push((e[d] || 0) - (s[d] || 0));

        var infl1 = Zelf.clamp(bz[0] * 100, 0.1, 100), x1 = infl1 / 100;
        var infl2 = Zelf.clamp((1 - bz[2]) * 100, 0.1, 100), x2 = infl2 / 100;
        var outEase = [], inEase = [];
        for (d = 0; d < dims; d++) {
            outEase.push(new KeyframeEase(bz[1] * dv[d] / (x1 * dt), infl1));
            inEase.push(new KeyframeEase(dv[d] * (1 - bz[3]) / (x2 * dt), infl2));
        }
        var sA = snapSpatial(p, k1), sB = snapSpatial(p, k2);
        var inA = p.keyInInterpolationType(k1), outB = p.keyOutInterpolationType(k2);
        var keepInA = easeOrDefault(p, p.keyInTemporalEase(k1), dims), keepOutB = easeOrDefault(p, p.keyOutTemporalEase(k2), dims);
        unroveAndDecouple(p, k1); unroveAndDecouple(p, k2);
        p.setInterpolationTypeAtKey(k1, inA, KIT.BEZIER);
        p.setInterpolationTypeAtKey(k2, KIT.BEZIER, outB);
        p.setTemporalEaseAtKey(k1, keepInA, outEase);
        p.setTemporalEaseAtKey(k2, inEase, keepOutB);
        restoreSpatial(p, k1, sA); restoreSpatial(p, k2, sB);
        return 0;
    }

    function applyLinear(t) {
        var p = t.prop, sA = snapSpatial(p, t.k1), sB = snapSpatial(p, t.k2);
        unroveAndDecouple(p, t.k1); unroveAndDecouple(p, t.k2);
        p.setInterpolationTypeAtKey(t.k1, p.keyInInterpolationType(t.k1), KIT.LINEAR);
        p.setInterpolationTypeAtKey(t.k2, KIT.LINEAR, p.keyOutInterpolationType(t.k2));
        restoreSpatial(p, t.k1, sA); restoreSpatial(p, t.k2, sB);
        return 0;
    }

    /* ------------------------------------------------------- sampled */
    function applySampled(t, curve) {
        var p = t.prop, k1 = t.k1, k2 = t.k2;
        var t1 = p.keyTime(k1), t2 = p.keyTime(k2), dt = t2 - t1;
        if (dt <= 0) throw new Error("Keyframes share the same time.");
        var s = Zelf.arr(p.keyValue(k1)), e = Zelf.arr(p.keyValue(k2));
        var model = p.isSpatial ? pathModel(p, k1, k2) : null;
        var sA = snapSpatial(p, k1), sB = snapSpatial(p, k2);
        var inA = p.keyInInterpolationType(k1), outB = p.keyOutInterpolationType(k2);
        var cnt = curve.times.length, i, d, tm = [], vals = [], f, v;

        for (i = 0; i < cnt; i++) {
            f = curve.values[i];
            tm.push(t1 + curve.times[i] * dt);
            if (model) v = model.at(f);
            else if (s.length === 1) v = s[0] + (e[0] - s[0]) * f;
            else { v = []; for (d = 0; d < s.length; d++) v.push(s[d] + (e[d] - s[d]) * f); }
            vals.push(v);
        }
        unroveAndDecouple(p, k1); unroveAndDecouple(p, k2);
        for (i = 0; i < cnt; i++) p.setValueAtTime(tm[i], vals[i]);

        var mid = curve.hold ? KIT.HOLD : KIT.LINEAR, idx;
        for (i = 0; i < cnt; i++) {
            idx = p.nearestKeyIndex(tm[i]);
            p.setInterpolationTypeAtKey(idx, mid, mid);
        }
        p.setInterpolationTypeAtKey(k1, inA, mid);
        var ke = p.nearestKeyIndex(t2);                      // end key moved because keys were inserted before it
        p.setInterpolationTypeAtKey(ke, curve.hold ? p.keyInInterpolationType(ke) : KIT.LINEAR, outB);
        restoreSpatial(p, k1, sA); restoreSpatial(p, ke, sB);
        try { p.setSelectedAtKey(k1, true); p.setSelectedAtKey(ke, true); } catch (e2) { }   // keep the outer pair selected
        return cnt;
    }

    /* --------------------------------------------------------- commands */
    Zelf.register("graph.apply", function (a) {
        var comp = Zelf.getComp();
        var info = collect(comp);
        if (info.withKeys === 0) Zelf.fail("Select a property with keyframes.");
        if (!info.targets.length) {
            if (info.unsupported) Zelf.fail("This property type is not supported.");
            if (info.locked) Zelf.fail("Layer is locked.");
            Zelf.fail("Select 2 keyframes.");
        }
        var mode = a.mode;
        if (mode !== "native" && mode !== "linear" && mode !== "sampled") Zelf.fail("Unknown graph mode.");
        if (mode === "native" && !(Zelf.isArray(a.bez) && a.bez.length === 4)) Zelf.fail("Curve data missing.");
        if (mode === "sampled" && !(Zelf.isArray(a.times) && Zelf.isArray(a.values) && a.times.length === a.values.length)) Zelf.fail("Curve data missing.");

        var done = 0, skipped = 0, added = 0, i, t, last = "";
        Zelf.undo("Graph", function () {
            for (i = 0; i < info.targets.length; i++) {
                t = info.targets[i];
                try {
                    if (t.k2 - t.k1 > 1) {
                        if (!a.replace) { skipped++; last = "Keys exist between the selection. Enable 'Replace in-between' or pick adjacent keys."; continue; }
                        var kk; for (kk = t.k2 - 1; kk > t.k1; kk--) t.prop.removeKey(kk);
                        t.k2 = t.k1 + 1;
                    }
                    if (mode === "native") applyNative(t, a.bez);
                    else if (mode === "linear") applyLinear(t);
                    else added += applySampled(t, { times: a.times, values: a.values, hold: !!a.hold });
                    done++;
                } catch (e) { skipped++; last = e.message; }
            }
        });
        if (!done) Zelf.fail(last || "Nothing applied.");
        var msg = "Applied to " + Zelf.plural(done, "property", "properties");
        if (added) msg += " (+" + added + " keys)";
        if (skipped) msg += ", " + skipped + " skipped";
        return { ok: true, msg: msg };
    });

    Zelf.register("graph.inspect", function () {
        var comp = Zelf.getComp(), sp = comp.selectedProperties, out = [], i, p, txt;
        for (i = 0; i < sp.length && out.length < 3; i++) {
            p = sp[i];
            if (p.propertyType === PropertyType.PROPERTY && p.numKeys > 0) out.push(p.name + ": " + p.selectedKeys.length + "/" + p.numKeys + " keys");
        }
        if (!out.length) Zelf.fail("Select a property with keyframes.");
        return { ok: true, msg: out.join(" | ") };
    });
})();
