/* Zelf-Xtens | js/app.js : bootstraps the panel. */
(function (root) {
    'use strict';
    var ZX = root.ZX, UI = ZX.UI, el = UI.el;
    var VERSION = '1.3.3', aeInfo = null;

    function renderAbout() {
        var box = UI.$('#about');
        box.textContent = '';
        var dbg = el('input', { type: 'checkbox' }); dbg.checked = !!ZX.debug;
        dbg.addEventListener('change', function () { ZX.debug = dbg.checked; UI.store.set('debug', ZX.debug); });
        var lines = [
            'Zelf-Xtens v' + VERSION,
            aeInfo ? ('After Effects ' + aeInfo.ae + ' \u00B7 script v' + aeInfo.version) : 'After Effects: not connected',
            aeInfo && aeInfo.loadErrors && aeInfo.loadErrors.length ? 'Load errors: ' + aeInfo.loadErrors.join('; ') : 'All modules loaded'
        ];
        box.appendChild(el('div', { class: 'about-card' }, [
            el('strong', { text: lines[0] }), el('div', { text: lines[1] }), el('div', { text: lines[2] }),
            el('label', { class: 'chk' }, [dbg, 'Debug log (browser console / port 8088)']),
            el('div', { class: 'hint', text: 'Every action is one Undo step. Edit > Undo reverts it.' }),
            UI.btn('Close', { onclick: function () { box.hidden = true; } })
        ]));
    }

    function connect() {
        return ZX.Bridge.ping().then(function (r) {
            if (r.ok) {
                aeInfo = r.data;
                UI.$('#ver').textContent = 'AE ' + aeInfo.ae;
                if (aeInfo.loadErrors && aeInfo.loadErrors.length) UI.status('warn', 'Some modules failed to load. See About.');
            } else if (ZX.Bridge.isCEP) {
                UI.status('error', r.msg);
            } else {
                UI.status('warn', 'Preview mode: open this panel inside After Effects.');
            }
        });
    }

    function init() {
        ZX.debug = !!UI.store.get('debug', false);
        var tabs = [ZX.GraphTab, ZX.ShortcutsTab];     // a saved "anchor" tab id falls back to the first tab
        UI.tabs(UI.$('#tabs'), UI.$('#main'), tabs, UI.store.get('tab', 'graph'), function (id) { UI.store.set('tab', id); });
        UI.$('#brand').addEventListener('click', function () { var b = UI.$('#about'); renderAbout(); b.hidden = !b.hidden; });
        connect().then(function () { if (!UI.$('#about').hidden) renderAbout(); });
        // Keep the panel honest when AE switches theme/size: nothing to poll, CSS handles layout.
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(window);
