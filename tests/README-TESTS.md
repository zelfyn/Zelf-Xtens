# Zelf-Xtens tests

    node tests/run.js                                   # 100+ tests, no dependencies needed
    npm i jsdom acorn --no-save && node tests/run.js    # also runs the UI smoke tests (jsdom) and the ES3 lint

Without `jsdom` / `acorn` those two groups report `skip`; everything else still runs.

| file | what it proves |
|---|---|
| `engine.test.js` | graph registry (no Random, BASIC sub-groups Standard / Smooth / Circ / Sine / Expo, no duplicates), every preset builds, handle <-> parameter maths for Overshoot / Bounce / Elastic |
| `jsx.test.js` | the real `jsx/*.jsx` run against `mock-ae.js`: anchor + position on text / shape / solid / null / adjustment / camera / light with ONE layer (also with the Selection target), parents, keyframes, undo groups, text colour, camera + precomp creation |
| `lint-es3.test.js` | ExtendScript files parse as ES3 and use no ES5+ library calls |
| `ui-smoke.test.js` | the real panel in jsdom with a fake CEP bridge: tabs, section order, presets, handle dragging, sliders, colour picker window, text payload, camera / precomp buttons, theme tokens |
| `browser-check.py` | optional, needs Python + Playwright + Chromium (`python tests/browser-check.py`): the real panel in a real browser with a fake CEP bridge, including dragging in the colour picker |
| `structure.test.js` | every script is loaded by `index.html`, versions match, no external dependencies |

## What the mock cannot prove (verify in real After Effects)

`mock-ae.js` is a model, not After Effects. Please check these by hand:

1. **Panel loads** in AE 2020 (17.x) and a newer AE; both tabs (GRAPH, SHORTCUTS) appear, no red status.
2. **Anchor/Position** (grid at the top of SHORTCUTS): one selected layer of each type (Text, Shape, Solid, Null, Adjustment, Camera, Light). The artwork must not move when the anchor moves; also test a parented layer and a layer with animated Position.
   Camera/Light: Position tools use a temporary null that must disappear again (layer count unchanged, selection restored).
3. **Undo**: each button = exactly one Ctrl+Z step (also Camera/Light alignment, which adds/removes the probe null).
4. **Create Center Text**: text and colour on the created layer, centred in the comp. **Camera**: a 50mm camera appears above the selection and frames the comp. **Precomp**: select 1 layer and 2+ layers, check naming, that the new precomp layer stays selected and that one Ctrl+Z restores everything.
5. **Graph handles** feel: drag Overshoot, Bounce and Elastic handles, Apply to two keyframes, compare in the Graph Editor.
6. **Colour picker**: click a swatch in SHORTCUTS, the picker window opens inside the panel; drag the square and the hue slider, type a HEX value, press OK. It must also fit when the panel is docked narrow.
