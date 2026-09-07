# Latitude Browser design and implementation boundaries

## Product direction

Latitude Browser is a focused desktop operations tool, not a decorative dashboard. The interface uses graphite surfaces, restrained terminal-green signals, thin borders, compact typography, and predictable page actions.

Core rules:

- One page has one primary responsibility and one obvious next action.
- Operational tables and complex creation forms do not share the same primary surface.
- Accent color communicates focus, progress, or verified state; it is not ambient decoration.
- Metrics, routes, latency, progress, security status, and connection success must come from real application data. Unknown values stay unknown.
- Short, low-risk edits may use a modal or drawer; complex workflows use a dedicated page or wizard.
- Continuous motion respects `prefers-reduced-motion` and pauses when its code-defined visibility gate is false.

The canonical semantic tokens live under `frontend/src/shared/theme/themes/`. Shared Signal UI rules extend them without adding a second styling runtime.

## Implemented Signal primitives

### `NetworkGlobe`

`frontend/src/shared/components/NetworkGlobe.tsx` is a contextual network illustration, not a route map or live topology.

- It adapts lifecycle ideas from `wayjam/komari-theme-commander` commit `e7191c1a775027f74c2fcff96bc9d71ff4ac7ac2`.
- It loads pinned `cobe@2.0.1` with dynamic `import('cobe')` and renders through WebGL when available.
- It contains no marker, arc, node, IP, traffic, or threat data.
- It stops its loop when paused, inactive, outside the intersection gate, the document is hidden, or reduced motion is requested.
- It retains a local SVG globe when COBE has not loaded or cannot render.
- Because COBE v2 uploads its embedded texture asynchronously without a redraw callback, initialization includes one same-camera paint after 200 ms, before revealing the canvas. Inactive/reduced-motion globes do not need a continuing animation loop to display the texture.
- It makes no remote texture, CDN, IP lookup, or analytics request.

COBE is a packaged dependency but an optional runtime enhancement: failure to initialize it must not remove the static explanatory illustration.

### `RadarSpinner`

`RadarSpinner` is a loading/status primitive adapted from commander `HudSpinner.tsx` at the same verified commit.

- API: `size?: 'sm' | 'md' | 'lg'`, `label?: string`, `className?: string`.
- The root has `role="status"`; its label remains readable to assistive technology.
- SVG shapes are decorative and hidden from the accessibility tree.
- Animation changes transform only. Reduced-motion mode disables the rotor/sweep completely.
- It does not display scanning targets, frame counters, percentages, or other fake telemetry.

### `AsciiMeter`

`AsciiMeter` adapts `facl/komari-ascii/src/components/ascii/AsciiProgress.tsx` at commit `d502b45a5797c276849e601e2b601dc1dfe8b8e4`.

- It renders only the caller-provided measurement.
- Finite values are clamped to 0–100; missing values remain explicitly unknown.
- The segmented visual is decorative while the root exposes progress semantics.
- It does not generate random samples or infer completion.

## Source and license boundary

Exact reuse records are maintained in:

- `docs/plan/latitude-signal-ui-sources.md`
- `third_party/NOTICE.md`
- `third_party/licenses/`

`seenaburns/dex-ui` commit `04371c6844c027627f32b45f15909f35b6e17a58` is a visual reference only. No dex-ui C++, openFrameworks, OpenGL, mesh, camera, or shader code is part of the Signal components. Its repository license file is BSD-3-Clause; it must not be described as the implementation source for `NetworkGlobe`.

## Network connector boundary

The UI must not merge the two supported connector stacks:

- `browser.default_connector_type=xray`: Xray plus sing-box combination stack.
- `browser.default_connector_type=mihomo`: independent Mihomo stack.

Startup, tests, connectivity, IP health, warming, and proxy downloads follow the selected stack. Signal visuals do not override or infer connector state.

## Experimental Tor boundary

Latitude Browser does not distribute or automatically download Tor. The experimental runtime uses a user-selected absolute path to a manually trusted executable. Saving the path does not start Tor and does not prove provenance, signature validity, connectivity, leak resistance, or anonymity.

The currently identified official candidate is Expert Bundle 15.0.21 with Tor 0.4.9.11. It is a compiled, multi-component artifact, so bundle notices and source licenses are distinct review surfaces. No Tor binary belongs in the Latitude repository or application package under the current design.
