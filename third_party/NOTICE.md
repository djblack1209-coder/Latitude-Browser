# Third-party notices

This file identifies third-party code copied, adapted, or loaded by Latitude Browser. Full license texts are stored in `third_party/licenses/`. The noncommercial policy in the root LICENSE applies only within [LICENSE-SCOPE](../LICENSE-SCOPE.md); it does not restrict rights granted by these third-party licenses.

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

### Current proxy runtimes (Darwin arm64; pinned on 2026-09-10)

Official release archives were downloaded over HTTPS and verified against GitHub asset SHA256 metadata. `publish/runtime-sources.json` pins archive size and hash; `publish/runtime-manifest.json` pins each extracted binary before local signing. Only Darwin arm64 was refreshed. These are integrity checks, not publisher signatures or reproducible-build attestations.

- xray [v26.3.27](https://github.com/XTLS/Xray-core/releases/tag/v26.3.27), [source d2758a023cd7f4174a5a5fa4ff66e487d4342ba0](https://github.com/XTLS/Xray-core/tree/d2758a023cd7f4174a5a5fa4ff66e487d4342ba0); full upstream license: `third_party/licenses/xray-v26.3.27.txt` (SHA256 `1f256ecad192880510e84ad60474eab7589218784b9a50bc7ceee34c2b91f1d5`).
- sing-box [v1.14.0](https://github.com/SagerNet/sing-box/releases/tag/v1.14.0), [source 0b8995879f29a9b98ee027bc17b75e101445b238](https://github.com/SagerNet/sing-box/tree/0b8995879f29a9b98ee027bc17b75e101445b238); full upstream license: `third_party/licenses/sing-box-v1.14.0.txt` (SHA256 `650d5e3b99a446fb38e820fa87a49562e0c79eab868fff58618ac487a58e554c`).
- mihomo [v1.19.30](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.30), [source ac017cdd246ce8bd547653d927e7bf77d7ee73d5](https://github.com/MetaCubeX/mihomo/tree/ac017cdd246ce8bd547653d927e7bf77d7ee73d5); full upstream license: `third_party/licenses/mihomo-v1.19.30.txt` (SHA256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`).

These are standalone runtime executables. Latitude no longer imports or links the Mihomo Go package: unused legacy URL-test helpers and their module dependency were removed. Active proxy operations continue through the selected process bridge. This architectural change does not relicense any runtime or by itself establish license compatibility.

The public [hardening notes](../docs/showcase/HARDENING.md) document process/recovery verification and its limits. Historical binary vulnerability scans reported findings; this is not a vulnerability-free runtime claim. The source links identify upstream revisions, not a complete corresponding-source package or a distribution-compliance certification.

### Historical Mihomo runtime integration (superseded on 2026-09-10)

- Upstream: [MetaCubeX/mihomo](https://github.com/MetaCubeX/mihomo).
- Fixed release: [v1.19.27](https://github.com/MetaCubeX/mihomo/releases/tag/v1.19.27), published `2026-06-06T07:56:51Z`.
- Official asset: `mihomo-darwin-arm64-go120-v1.19.27.gz`, GitHub asset ID `440046673`, exactly `19012185` bytes.
- Download: https://github.com/MetaCubeX/mihomo/releases/download/v1.19.27/mihomo-darwin-arm64-go120-v1.19.27.gz
- Archive SHA256: `ae9218e0bd93258b2722bc95929e1ccf62aadc5aeb35db60d718d1dd0df6e731` (locked in `publish/runtime-sources.json`).
- Runtime file: `bin/darwin-arm64/mihomo`; unmodified upstream payload, `56875426` bytes.
- Extracted SHA256 before local packaging/signing: `f2e623e762c5c852e07966c6396afc2d942164e78b766485df8c7de3643a84be` (recorded in `publish/runtime-manifest.json`).
- Verified native version: `Mihomo Meta v1.19.27 darwin arm64 with go1.20.14`; only `-v` was run for this integration.
- The fixed tag resolves to source commit [`5184081ac327394d9e15fa5d5f9f4a61e723fd94`](https://github.com/MetaCubeX/mihomo/tree/5184081ac327394d9e15fa5d5f9f4a61e723fd94); [source archive at that commit](https://github.com/MetaCubeX/mihomo/archive/5184081ac327394d9e15fa5d5f9f4a61e723fd94.tar.gz).
- License: GNU General Public License, version 3; full upstream text in `third_party/licenses/mihomo-GPL-3.0.txt`, copied byte-for-byte from [LICENSE at the fixed commit](https://raw.githubusercontent.com/MetaCubeX/mihomo/5184081ac327394d9e15fa5d5f9f4a61e723fd94/LICENSE).
- License file SHA256: `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`.

The archive size and digest were checked against the [official release metadata](https://api.github.com/repos/MetaCubeX/mihomo/releases/tags/v1.19.27) and [asset metadata](https://api.github.com/repos/MetaCubeX/mihomo/releases/assets/440046673) over HTTPS before extraction or execution. GitHub reports this release as mutable (`immutable=false`). This is an archive integrity lock, not an independently verified publisher signature or a reproducible-build attestation.

This record covers the local runtime integration, not a public-release approval. The source link identifies the tag's source revision; corresponding-source availability and dependency-license obligations for any future redistribution still require release review. The independent Mihomo stack does not automatically fall back to Xray/sing-box.

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
