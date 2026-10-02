# Changelog

## 1.3.3
- GRAPH: new Normal / Overshoot switch in the Curve header (replaces the Selection button). Normal keeps the Basic bezier handles between 0% and 100%; Overshoot lets them go past it (wider vertical range). Switching back to Normal pulls handles into range; a saved curve that already overshoots opens in Overshoot. The choice is remembered.

## 1.3.2
- GRAPH: the Step preset is adjustable with a Steps slider (2-40); the curve and the keyframes follow it. (The stair Adjust row added in the first 1.3.1 draft was a misunderstanding and is removed.)
- Header: the logo next to "Zelf-Xtens" is removed.
- GRAPH: the curve editor now uses the full panel width and almost the whole square (tighter margins and vertical range), handles are easier to place.
- UI: smaller, minimal buttons, tabs, segmented controls, category buttons and preset tiles (outline style instead of filled blocks).
- Colour fields (Solid, Center Text): compact one-line field with a small colour chip, hex value and "Pick"; the picker window and swatches are smaller too.

## 1.3.0
- The anchor/position grid moved to the top of SHORTCUTS, above MARK NAVIGATION, as one ANCHOR / POSITION section (mode switch, grid, keep-in-place option). The ANCHOR/POS tab is removed; the panel now has two tabs, GRAPH and SHORTCUTS.

## 1.2.1
- ANCHOR/POS: removed the Single axis section and the Composition/Selection toggle. Position mode always uses the Selection behaviour (one layer -> composition, 2+ layers -> their combined bounds).

## 1.2.0
- Colour fields (Solid, Center Text) open a custom colour picker window instead of the native dialog: saturation/brightness square, hue slider, HEX + R/G/B inputs, 24 swatches, recent colours, OK / Cancel / Esc.
- Center Text: the Font section is removed (text + colour only; the font is left to After Effects). The `font.list` command is gone too.
- ANCHOR/POS: one selected layer is always enough. "Selection" with a single layer aligns to the composition instead of showing an error; with 2+ layers it still aligns to their combined bounds.
- GRAPH: the Presets section now sits below Actions (order: Curve, Actions, Presets).
- GRAPH: Smooth moved into BASIC as a sub-group (Standard / Smooth / Circ / Sine / Expo); the SMOOTH category is removed, preset ids and curves are unchanged, a saved SMOOTH category falls back to BASIC.
- SHORTCUTS: new Camera (50mm camera framing the comp) and Precomp (precompose the selected layers, move all attributes) buttons in Quick Actions. Both are one Undo step.

## 1.1.1
- Removed the EXPRESSIONS tab and everything that belonged to it (panel, live preview engine, `jsx/expressions.jsx`, tests, styles). GRAPH, ANCHOR/POS and SHORTCUTS are unchanged.

## 1.1.0
- GRAPH: bigger category/preset buttons (3-column grid, 32px hit area); Circ, Sine and Expo moved into BASIC as sub-groups (Standard / Circ / Sine / Expo); Random preset, category and reseed control removed from the GRAPH engine and UI (the EXPRESSIONS "Random" preset is untouched).
- GRAPH: Overshoot / Bounce / Elastic curves have draggable on-curve handles plus sliders (Overshoot, Bounce, Amplitude, Frequency, Keys), always in sync; the vertical range follows the curve.
- ANCHOR/POS: works on one selected layer of any type, including Camera and Light (position tools); anchor tools skip camera/light with a clear message.
- EXPRESSIONS: live preview runs the exact generated expression in the panel (no composition changes, no Undo steps); optional preview on the real keyframes of the selected property (read-only).
- SHORTCUTS: large colour fields (swatch + hex + quick colours) for Solid and Text; Create Center Text takes text, font and colour.
- Theme: deep black + high-contrast green, token-based spacing/type scale across all tabs.
- Saved state from 1.0.x is migrated (removed presets/categories fall back safely, saved custom presets are kept).
