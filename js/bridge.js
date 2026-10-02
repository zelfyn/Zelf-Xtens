/* Zelf-Xtens | js/bridge.js : the ONLY place that talks to ExtendScript.
 *
 *   UI  ->  Bridge.call(cmd, params)  ->  evalScript("Zelf.run(...)")  ->  After Effects  ->  {ok,msg,data}  ->  UI status
 *
 * - talks to CEP directly via window.__adobe_cep__ (no CSInterface.js needed)
 * - params travel as ONE JSON string embedded as an ASCII-only JS string literal, so expression code with
 *   quotes / newlines / unicode cannot break the script
 * - result is always {ok:boolean, kind?:'invalid'|'error'|'busy', msg?:string, data?:any}
 */
(function (root) {
    'use strict';
    var ZX = root.ZX = root.ZX || {};
    var cep = root.__adobe_cep__ || null;
    var loaded = false, loading = null, pending = 0, extDir = '';

    /* ---- optional debug log (toggle in the About box; also console) ---- */
    ZX.debug = false;
    ZX.log = function (level, obj) {
        if (!ZX.debug && level !== 'error') return;
        try { root.console[level === 'error' ? 'error' : 'log']('[Zelf-Xtens]', obj); } catch (e) { }
    };

    /** Safe JS string literal: ASCII only (\uXXXX for everything else, incl. U+2028/2029). */
    function lit(s) {
        return JSON.stringify(String(s)).replace(/[\u007f-\uffff]/g, function (c) {
            return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        });
    }

    function extensionPath() {
        if (extDir) return extDir;
        var p = decodeURI(cep.getSystemPath('extension'));
        if (/Win/i.test(root.navigator.userAgent)) p = p.replace('file:///', ''); else p = p.replace('file://', '');
        extDir = p.replace(/\/+$/, '');
        return extDir;
    }

    function evalRaw(script) {
        return new Promise(function (resolve) {
            try { cep.evalScript(script, function (r) { resolve(r); }); }
            catch (e) { resolve('EvalScript error: ' + e.message); }
        });
    }

    /** Load jsx/main.jsx into AE's persistent ExtendScript engine (once per panel load, again if it went missing). */
    function ensureLoaded(force) {
        if (loaded && !force) return Promise.resolve(true);
        if (loading && !force) return loading;
        var dir = extensionPath() + '/jsx';
        var s = '$.global.ZELF_DIR=' + lit(dir) + ';$.evalFile(new File(' + lit(dir + '/main.jsx') + '));"loaded"';
        loading = evalRaw(s).then(function (r) {
            loading = null;
            loaded = (r === 'loaded');
            if (!loaded) ZX.log('error', 'Could not load main.jsx: ' + r);
            return loaded;
        });
        return loading;
    }

    function parse(raw) {
        if (raw === undefined || raw === null || raw === '') return { ok: false, kind: 'error', msg: 'Empty response from After Effects.' };
        if (typeof raw === 'string' && raw.charAt(0) === '{') {
            try { return JSON.parse(raw); } catch (e) { return { ok: false, kind: 'error', msg: 'Unreadable response.' }; }
        }
        return { ok: false, kind: 'error', msg: String(raw) };
    }

    function runOnce(cmd, params) {
        var s = 'Zelf.run(' + lit(cmd) + ',' + lit(JSON.stringify(params || {})) + ')';
        return evalRaw(s).then(parse);
    }

    var Bridge = ZX.Bridge = {
        isCEP: !!cep,

        /** Call an ExtendScript command. opts.parallel = allow while another call is running. */
        call: function (cmd, params, opts) {
            opts = opts || {};
            if (!cep) return Promise.resolve({ ok: false, kind: 'error', msg: 'Not running inside After Effects.' });
            if (pending > 0 && !opts.parallel) return Promise.resolve({ ok: false, kind: 'busy' });
            pending++;
            ZX.log('log', ['>>', cmd, params]);
            return ensureLoaded(false).then(function (ok) {
                if (!ok) return { ok: false, kind: 'error', msg: 'Could not load the After Effects script (jsx/main.jsx).' };
                return runOnce(cmd, params).then(function (res) {
                    // engine restarted / main.jsx missing -> reload once and retry
                    if (!res.ok && /Zelf is undefined|EvalScript error/i.test(res.msg || '')) {
                        return ensureLoaded(true).then(function (ok2) { return ok2 ? runOnce(cmd, params) : res; });
                    }
                    return res;
                });
            }).then(function (res) {
                pending--; ZX.log('log', ['<<', cmd, res]); return res;
            }, function (err) {
                pending--; return { ok: false, kind: 'error', msg: String(err && err.message || err) };
            });
        },

        /** Ping AE (version + load errors). */
        ping: function () { return Bridge.call('ping', {}, { parallel: true }); }
    };
})(window);
