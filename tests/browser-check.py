import json, sys, os
from playwright.sync_api import sync_playwright

URL = 'file://' + os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'index.html'))
import tempfile
OUT = os.environ.get('ZX_SHOTS', os.path.join(tempfile.gettempdir(), 'zelf-xtens-shots'))
os.makedirs(OUT, exist_ok=True)
INIT = """
window.__calls = [];
window.__adobe_cep__ = {
  getSystemPath: function(){ return 'file:///C:/ext'; },
  evalScript: function(script, cb){
    if (/\\$\\.evalFile/.test(script)) return cb('loaded');
    var out = (new Function('Zelf','return '+script))({ run: function(cmd, json){
      window.__calls.push({cmd: cmd, params: JSON.parse(json)});
      if (cmd === 'ping') return JSON.stringify({ok:true, data:{ae:'17.0', version:'1.3.0', loadErrors:[]}});
      return JSON.stringify({ok:true, msg:'mock ok'});
    }});
    setTimeout(function(){ cb(out); }, 0);
  }
};
"""
fails = []
def check(cond, msg):
    print(('  ok    ' if cond else '  FAIL  ') + msg)
    if not cond: fails.append(msg)

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={'width': 340, 'height': 760})
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.add_init_script(INIT)
    pg.goto(URL); pg.wait_for_timeout(300)

    print('GRAPH')
    heads = pg.eval_on_selector_all('.pane:not([hidden]) .sec-head > span:first-child', 'els => els.map(e => e.textContent)')
    check(heads == ['Curve', 'Actions', 'Presets'], 'section order Curve, Actions, Presets  -> %s' % heads)
    cats = pg.eval_on_selector_all('.cat', 'els => els.map(e => e.textContent)')
    check(cats == ['BASIC', 'BACK', 'BOUNCE', 'ELASTIC', 'CUSTOM'], 'categories %s' % cats)
    subs = pg.eval_on_selector_all('.subhead', 'els => els.map(e => e.textContent)')
    check(subs == ['Standard', 'Smooth', 'Circ', 'Sine', 'Expo'], 'BASIC sub-groups %s' % subs)
    names = pg.eval_on_selector_all('.tile span', 'els => els.map(e => e.textContent)')
    check(all(n in names for n in ['Smooth', 'Soft Ease', 'Strong Ease', 'Smooth Step']), 'Smooth tiles inside BASIC')
    pg.click('.tile:has-text("Strong Ease")'); pg.wait_for_timeout(50)
    pg.click('button:has-text("Apply")'); pg.wait_for_timeout(80)
    c = pg.evaluate('window.__calls.filter(c=>c.cmd==="graph.apply").pop()')
    check(c and c['params']['mode'] == 'native' and c['params']['bez'] == [0.8, 0, 0.2, 1], 'Apply with Strong Ease sends native bezier')
    pg.screenshot(path=OUT + '/graph.png', full_page=False)

    print('SHORTCUTS')
    pg.click('.tab:has-text("SHORTCUTS")'); pg.wait_for_timeout(80)
    pane = pg.inner_text('.pane:not([hidden])')
    check(pg.locator('.tab').count() == 2 and pg.locator('.tab:has-text("ANCHOR")').count() == 0, 'two tabs only, ANCHOR/POS tab removed')
    heads = pg.eval_on_selector_all('.pane:not([hidden]) .sec-head > span:first-child', 'els => els.map(e => e.textContent)')
    check(heads[:2] == ['ANCHOR / POSITION', 'MARK NAVIGATION'], 'grid section sits above MARK NAVIGATION %s' % heads)
    check(pg.locator('.pane:not([hidden]) .acell').count() == 9, '3x3 grid present')
    check('Single axis' not in pane and 'Align to' not in pane, 'no Single axis / Align-to')
    pg.click('.pane:not([hidden]) .segb:text-is("Position")'); pg.click('.pane:not([hidden]) .acell[title="Left"]'); pg.wait_for_timeout(60)
    c = pg.evaluate('window.__calls.filter(c=>c.cmd==="position.align").pop()')
    check(c and c['params'] == {'ax': 0, 'ay': 0.5, 'target': 'selection'}, 'Position grid payload %s' % (c and c['params']))
    pg.click('.pane:not([hidden]) .segb:text-is("Anchor point")'); pg.click('.pane:not([hidden]) .acell[title="Bottom Right"]'); pg.wait_for_timeout(60)
    c = pg.evaluate('window.__calls.filter(c=>c.cmd==="anchor.move").pop()')
    check(c and c['params'] == {'ax': 1, 'ay': 1, 'compensate': True}, 'Anchor grid payload %s' % (c and c['params']))
    check('Font' not in pane, 'no Font section / field')
    check(pg.locator('datalist').count() == 0 and pg.locator('input[aria-label="Font"]').count() == 0, 'no font input / datalist')
    check(pg.locator('input[type=color]').count() == 0, 'no native colour input any more')
    for label, cmd in [('Camera', 'camera.create'), ('Precomp', 'precomp.create'), ('Light', 'light.create'), ('Create Comp', 'comp.create')]:
        pg.click('.pane:not([hidden]) button:text-is("%s")' % label); pg.wait_for_timeout(60)
        check(pg.evaluate('window.__calls.some(c=>c.cmd==="%s")' % cmd), '%s button -> %s' % (label, cmd))
    pg.screenshot(path=OUT + '/shortcuts.png', full_page=True)

    print('COLOUR PICKER')
    check(pg.locator('.cp').is_hidden(), 'picker window closed at start')
    sw = pg.locator('.swatch'); check(sw.count() == 2, 'two colour fields (solid, text)')
    sw.nth(0).click(); pg.wait_for_timeout(60)
    check(pg.locator('.cp').is_visible(), 'click on the swatch opens the picker window')
    check(pg.input_value('.cp input[aria-label="Hex colour"]') == '#808080', 'starts at the current colour')
    box = pg.locator('.cp-sv').bounding_box()
    pg.mouse.click(box['x'] + box['width'] - 1, box['y'] + 1); pg.wait_for_timeout(40)   # top-right = full saturation, full brightness of current hue
    hexv = pg.input_value('.cp input[aria-label="Hex colour"]')
    r, g, bl = [int(hexv[i:i+2], 16) for i in (1, 3, 5)]
    check(max(r, g, bl) >= 250 and min(r, g, bl) <= 5, 'SV square top-right gives a fully saturated colour: %s' % hexv)
    hb = pg.locator('.cp-hue').bounding_box()
    pg.mouse.click(hb['x'] + hb['width'] * 0.34, hb['y'] + hb['height'] / 2); pg.wait_for_timeout(40)
    hexv = pg.input_value('.cp input[aria-label="Hex colour"]'); r, g, bl = [int(hexv[i:i+2], 16) for i in (1, 3, 5)]
    check(g > 240 and r < 40 and bl < 40, 'Hue slider at 1/3 gives green: %s' % hexv)
    pg.mouse.move(box['x'] + 20, box['y'] + 20); pg.mouse.down(); pg.mouse.move(box['x'] + 60, box['y'] + 90); pg.mouse.up(); pg.wait_for_timeout(40)
    check(pg.input_value('.cp input[aria-label="Hex colour"]') != hexv, 'dragging inside the SV square changes the colour')
    pg.fill('.cp input[aria-label="Hex colour"]', '#ff8000'); pg.wait_for_timeout(40)
    check([pg.input_value('.cp input[aria-label="%s"]' % n) for n in ('R', 'G', 'B')] == ['255', '128', '0'], 'typing HEX updates R/G/B')
    check(pg.input_value('.cp input[aria-label="Hex colour"]') == '#ff8000', 'typing HEX does not rewrite the text field')
    pg.fill('.cp input[aria-label="G"]', '0'); pg.wait_for_timeout(40)
    check(pg.input_value('.cp input[aria-label="Hex colour"]') == '#FF0000', 'editing R/G/B updates HEX -> %s' % pg.input_value('.cp input[aria-label="Hex colour"]'))
    pg.screenshot(path=OUT + '/picker.png')
    pg.click('.cp button:text-is("OK")'); pg.wait_for_timeout(60)
    check(pg.locator('.cp').is_hidden(), 'OK closes the window')
    check('#FF0000' in pg.locator('.swatch').nth(0).inner_text(), 'Solid colour field shows #FF0000')
    pg.click('.pane:not([hidden]) button:text-is("Create Solid")'); pg.wait_for_timeout(60)
    c = pg.evaluate('window.__calls.filter(c=>c.cmd==="solid.create").pop()')
    check(c['params']['color'] == [1, 0, 0], 'Create Solid sends the picked colour %s' % c['params']['color'])
    check(json.loads(pg.evaluate('localStorage.getItem("zx.sc.color")')) == '#ff0000', 'colour persisted')
    check(json.loads(pg.evaluate('localStorage.getItem("zx.colors.recent")'))[0] == '#ff0000', 'recent colours remember it')
    # cancel / escape / click outside keep the old colour
    sw.nth(0).click(); pg.fill('.cp input[aria-label="Hex colour"]', '#00ff00'); pg.click('.cp button:text-is("Cancel")'); pg.wait_for_timeout(40)
    check('#FF0000' in sw.nth(0).inner_text(), 'Cancel keeps the old colour')
    sw.nth(0).click(); pg.fill('.cp input[aria-label="Hex colour"]', '#00ff00'); pg.keyboard.press('Escape'); pg.wait_for_timeout(40)
    check(pg.locator('.cp').is_hidden() and '#FF0000' in sw.nth(0).inner_text(), 'Esc closes without applying')
    sw.nth(0).click(); pg.fill('.cp input[aria-label="Hex colour"]', '#0a84ff'); pg.keyboard.press('Enter'); pg.wait_for_timeout(40)
    check('#0A84FF' in sw.nth(0).inner_text(), 'Enter in the HEX field applies')
    # text colour field is independent, swatch + recent colours
    sw.nth(1).click(); pg.wait_for_timeout(40)
    check(pg.locator('.cp-pal button').count() >= 25, 'swatches + recent colours shown (%d)' % pg.locator('.cp-pal button').count())
    pg.click('.cp-pal button[title="#00E676"]'); pg.click('.cp button:text-is("OK")'); pg.wait_for_timeout(40)
    pg.click('.pane:not([hidden]) button:text-is("Create Center Text")'); pg.wait_for_timeout(60)
    c = pg.evaluate('window.__calls.filter(c=>c.cmd==="text.center").pop()')
    check(set(c['params'].keys()) == {'text', 'color'}, 'text.center payload has no font: %s' % list(c['params'].keys()))
    check([round(x * 255) for x in c['params']['color']] == [0, 230, 118], 'Center Text uses the text colour')
    check(pg.evaluate('window.__calls.filter(c=>c.cmd==="font.list").length') == 0, 'font.list is never called')
    pg.screenshot(path=OUT + '/shortcuts2.png', full_page=True)

    check(errs == [], 'no console / page errors %s' % errs)
    b.close()
print('\nFAILED: %d' % len(fails)); sys.exit(1 if fails else 0)
