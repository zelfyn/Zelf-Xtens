/* Zelf-Xtens | js/anchor-position.js : ANCHOR / POSITION section (one 3x3 grid, two modes).
 * It is no longer a tab: the SHORTCUTS tab shows it at the top (ZX.AnchorPos.section()). */
(function (root) {
    'use strict';
    var ZX = root.ZX, UI = ZX.UI, Bridge = ZX.Bridge, el = UI.el;

    var CELLS = [
        { n: 'Top Left', x: 0, y: 0 }, { n: 'Top', x: 0.5, y: 0 }, { n: 'Top Right', x: 1, y: 0 },
        { n: 'Left', x: 0, y: 0.5 }, { n: 'Center', x: 0.5, y: 0.5 }, { n: 'Right', x: 1, y: 0.5 },
        { n: 'Bottom Left', x: 0, y: 1 }, { n: 'Bottom', x: 0.5, y: 1 }, { n: 'Bottom Right', x: 1, y: 1 }
    ];
    var mode, compensate;

    function run(ax, ay, label) {
        var cmd = mode === 'anchor' ? 'anchor.move' : 'position.align';
        var p = mode === 'anchor' ? { ax: ax === null ? 0.5 : ax, ay: ay === null ? 0.5 : ay, compensate: compensate } : { ax: ax, ay: ay, target: 'selection' };
        UI.status('busy', label + '...');
        Bridge.call(cmd, p).then(function (r) { UI.report(r); });
    }

    /** Builds the ANCHOR / POSITION section: mode switch, 3x3 grid, compensate option, hint. -> {el, body} */
    function section() {
        mode = UI.store.get('ap.mode', 'anchor'); compensate = UI.store.get('ap.comp', true);

        var sec = UI.section('ANCHOR / POSITION');
        var seg = UI.seg([
            { v: 'anchor', label: 'Anchor point', title: 'Move the anchor point; Position is compensated so the layer stays put' },
            { v: 'position', label: 'Position', title: 'Move the layer so its bounds align to the composition (or to the combined bounds of 2+ selected layers)' }
        ], mode, function (v) { mode = v; UI.store.set('ap.mode', v); refresh(); });

        var grid = el('div', { class: 'agrid', role: 'group', 'aria-label': '3 by 3 grid' });
        CELLS.forEach(function (c) {
            var glyph = el('i'); glyph.style.setProperty('--x', c.x); glyph.style.setProperty('--y', c.y);
            grid.appendChild(el('button', {
                type: 'button', class: 'acell', title: c.n, 'aria-label': c.n, onclick: function () { run(c.x, c.y, c.n); }
            }, [glyph]));
        });

        var cb = el('input', { type: 'checkbox' }); cb.checked = !!compensate;
        cb.addEventListener('change', function () { compensate = cb.checked; UI.store.set('ap.comp', compensate); });
        var compRow = el('label', { class: 'chk', title: 'Off = only the anchor moves (layer shifts on screen)' }, [cb, 'Keep layer in place (compensate Position)']);
        var note = el('div', { class: 'hint' });

        function refresh() {
            compRow.hidden = mode !== 'anchor';
            note.textContent = mode === 'anchor'
                ? 'Works with one selected layer (text, shape, solid, null, adjustment...). Moves the anchor to the layer bounds; the artwork does not move. Camera and light have no anchor bounds and are skipped.'
                : 'Works with one selected layer, including camera and light. One layer aligns to the composition; with 2+ layers they align to their combined bounds.';
        }
        [seg.el, grid, compRow, note].forEach(function (n) { sec.body.appendChild(n); });
        refresh();
        return sec;
    }
    ZX.AnchorPos = { section: section };
})(window);
