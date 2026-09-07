# Third-party notices

This file identifies third-party code copied, adapted, or loaded by Latitude Browser. Full license texts are stored in `third_party/licenses/`.

## Included or adapted

### komari-theme-commander

- Upstream: `wayjam/komari-theme-commander`
- Source commit: `e7191c1a775027f74c2fcff96bc9d71ff4ac7ac2`
- License: MIT, Copyright (c) 2026 WayJam So
- Full text: `third_party/licenses/komari-theme-commander-MIT.txt`
- Adapted code: `NetworkGlobe.tsx`, `RadarSpinner.tsx`, and `radar-spinner.css`

### komari-ascii

- Upstream: `facl/komari-ascii`
- Source commit: `d502b45a5797c276849e601e2b601dc1dfe8b8e4`
- License: MIT, Copyright (c) 2025 Montia37
- Full text: `third_party/licenses/komari-ascii-MIT.txt`
- Adapted code: `AsciiMeter.tsx`

### cobe

- Package: `cobe@2.0.1`
- Upstream: `shuding/cobe`
- npm package integrity: `sha512-aaa6vcIlaC8C1SF50LDH0Anybo/EAXnrxqe+bwvr4+YUtZydqjeBjTTD7ziCCkbRrRGSns3I3F6cZsf3W+L+ag==`
- License: MIT, Copyright (c) 2021 Shu Ding
- Full text: `third_party/licenses/cobe-MIT.txt`
- Use: dynamically imported WebGL renderer for `NetworkGlobe`; a local SVG remains when the renderer is unavailable.

## Visual reference only; no source copied

### dex-ui

- Upstream: `seenaburns/dex-ui`
- Reviewed commit: `04371c6844c027627f32b45f15909f35b6e17a58`
- Repository license: BSD-3-Clause text, Copyright (c) 2015, Seena Burns
- Audit copy: `third_party/licenses/dex-ui-BSD-3-Clause.txt`

Latitude Browser did not copy dex-ui's C++, openFrameworks, mesh, camera, or GLSL implementation. It was used only as a visual reference for restrained terminal frames, radar layers, and line graphics. It is not the source of Latitude's 3D globe.

## Not distributed by Latitude Browser

Latitude Browser does not bundle a Tor binary or Tor Expert Bundle. The experimental Tor runtime accepts a user-supplied, manually trusted executable path and does not download the binary or claim to verify its signature.

As of 2026-09-06, the operational candidate is Tor Expert Bundle 15.0.21 containing Tor 0.4.9.11. The Expert Bundle is a compiled, multi-component distribution; its included license documents and the licenses of its source components must be assessed separately. A shorthand such as “GPLv3 build” must not be treated as a complete statement of every included source license. If Latitude later redistributes any Tor bundle or binary, the exact artifact's notices, corresponding-source obligations, and signatures must be reviewed before release.
