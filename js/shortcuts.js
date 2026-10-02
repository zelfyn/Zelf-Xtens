/* Zelf-Xtens | js/shortcuts.js : SHORTCUTS tab (anchor/position grid, marker navigation, quick creators, stair/sequence). */
(function (root) {
    'use strict';
    var ZX = root.ZX, UI = ZX.UI, Bridge = ZX.Bridge, el = UI.el;

    function call(cmd, params, label) {
        UI.status('busy', label + '...');
        return Bridge.call(cmd, params || {}).then(function (r) { UI.report(r); return r; });
    }
    function hexToRgb(h) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h || '');
        return m ? [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255] : [0.5, 0.5, 0.5];
    }

    function build(pane) {
        var s0 = ZX.AnchorPos.section();          // 3x3 anchor / position grid, first section of the tab
        var s1 = UI.section('MARK NAVIGATION');
        s1.body.appendChild(el('div', { class: 'g2' }, [
            UI.btn('\u25C0  Previous Marker', { cls: 'big', title: 'Jump to the nearest marker before the current time', onclick: function () { call('marker.prev', {}, 'Previous marker'); } }),
            UI.btn('Next Marker  \u25B6', { cls: 'big', title: 'Jump to the nearest marker after the current time', onclick: function () { call('marker.next', {}, 'Next marker'); } })
        ]));

        // Solid colour and text colour are separate fields; each is one big swatch that opens the colour window
        var solidColor = UI.colorField({ label: 'Solid colour', value: UI.store.get('sc.color', '#808080'), onchange: function (v) { UI.store.set('sc.color', v); } });
        var textColor = UI.colorField({ label: 'Text colour', value: UI.store.get('sc.tcolor', '#ffffff'), onchange: function (v) { UI.store.set('sc.tcolor', v); } });
        var text = el('input', { type: 'text', value: UI.store.get('sc.text', 'Text'), maxlength: 60, title: 'Text for Create Center Text', 'aria-label': 'Center text' });
        text.addEventListener('input', function () { UI.store.set('sc.text', text.value); });

        var s2 = UI.section('QUICK ACTIONS');
        s2.body.appendChild(el('div', { class: 'g2' }, [
            UI.btn('Create Comp', { title: 'New comp from the selected footage, or from the active comp settings', onclick: function () { call('comp.create', {}, 'Create comp'); } }),
            UI.btn('Null Parent', { title: 'Create a null and parent the selected layers (or camera) to it', onclick: function () { call('null.parent', {}, 'Null parent'); } }),
            UI.btn('Adjustment Layer', { title: 'Adjustment layer at comp size', onclick: function () { call('adjustment.create', {}, 'Adjustment layer'); } }),
            UI.btn('Light', { title: 'Point light (affects 3D layers only)', onclick: function () { call('light.create', {}, 'Light'); } }),
            UI.btn('Camera', { title: 'Create a 50mm camera centered on the comp (affects 3D layers only)', onclick: function () { call('camera.create', {}, 'Camera'); } }),
            UI.btn('Precomp', { title: 'Precompose the selected layers (move all attributes into the new comp)', onclick: function () { call('precomp.create', {}, 'Precomp'); } })
        ]));

        var s2b = UI.section('SOLID');
        s2b.body.appendChild(solidColor.el);
        s2b.body.appendChild(UI.btn('Create Solid', { cls: 'pri', title: 'Solid at comp size using the colour above', onclick: function () { call('solid.create', { color: hexToRgb(solidColor.get()) }, 'Solid'); } }));

        var s2c = UI.section('CENTER TEXT');
        s2c.body.appendChild(el('label', { class: 'fld' }, [el('span', { text: 'Text' }), text]));
        s2c.body.appendChild(textColor.el);
        s2c.body.appendChild(UI.btn('Create Center Text', { cls: 'pri', title: 'Text layer centered in the comp using the text and colour above', onclick: function () {
            call('text.center', { text: text.value || 'Text', color: hexToRgb(textColor.get()) }, 'Center text');
        } }));

        var off = UI.num({ label: 'Offset (frames)', value: UI.store.get('sc.off', 5), min: -600, max: 600, step: 1, title: 'Frames between layers (stair) or gap between layers (sequence)', onchange: function (v) { UI.store.set('sc.off', v); } });
        var order = el('select', { title: 'Order in which layers are arranged', 'aria-label': 'Order' }, [
            el('option', { value: 'top', text: 'Top \u2192 Bottom' }), el('option', { value: 'bottom', text: 'Bottom \u2192 Top' }), el('option', { value: 'start', text: 'By start time' })
        ]);
        order.value = UI.store.get('sc.order', 'top');
        order.addEventListener('change', function () { UI.store.set('sc.order', order.value); });
        var mode = UI.seg([{ v: 'stair', label: 'Stair', title: 'Each layer starts a fixed offset after the previous one' }, { v: 'sequence', label: 'Sequence', title: 'Layers end-to-end, offset = gap' }], UI.store.get('sc.mode', 'stair'), function (v) { UI.store.set('sc.mode', v); });
        var dir = UI.seg([{ v: 'forward', label: 'Forward' }, { v: 'backward', label: 'Backward', title: 'Reverse the arrangement' }], UI.store.get('sc.dir', 'forward'), function (v) { UI.store.set('sc.dir', v); });

        var s3 = UI.section('STAIR / SEQUENCE');
        s3.body.appendChild(el('div', { class: 'opt' }, [el('span', { class: 'lbl', text: 'Mode' }), mode.el]));
        s3.body.appendChild(el('div', { class: 'opt' }, [el('span', { class: 'lbl', text: 'Direction' }), dir.el]));
        s3.body.appendChild(el('div', { class: 'row' }, [off.el, el('label', { class: 'fld grow' }, [el('span', { text: 'Order' }), order])]));
        s3.body.appendChild(el('div', { class: 'g2' }, [
            UI.btn('Apply', { cls: 'pri', title: 'Arrange selected layers in time (one Undo step)', onclick: function () { call('stair.apply', { offset: off.get(), order: order.value, mode: mode.get(), dir: dir.get() }, 'Stair'); } }),
            UI.btn('Reset', { title: 'Restore the timing from before the last Apply', onclick: function () { call('stair.reset', {}, 'Reset stair'); } })
        ]));

        [s0, s1, s2, s2b, s2c, s3].forEach(function (s) { pane.appendChild(s.el); });
    }
    ZX.ShortcutsTab = { id: 'shortcuts', label: 'SHORTCUTS', title: 'SHORTCUTS', build: build };
})(window);
