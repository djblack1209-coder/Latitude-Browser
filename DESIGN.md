# Latitude Browser · Fieldwork 2.2

Fieldwork is a local browser control room. One latitude field carries the current profile's identity from the instance overview to page headings and the sidebar. Operational controls stay in predictable places while that object changes pose, scale and rendering mode.

## Visual system

The shared token source is `backend/internal/uistyle/tokens.css`; the desktop imports it through `frontend/src/shared/theme/tokens.css`, and browser-facing pages use the same semantic colors. `fieldwork.css` applies the desktop composition.

| Role | Value |
| --- | --- |
| Canvas / surface / raised | `#080a09` / `#101311` / `#191d1a` |
| Main / secondary / muted text | `#edf1e9` / `#adb5aa` / `#889482` |
| Primary action / identity | Lime `#d2fa69` / lilac `#bcacee` |
| Success / warning / error | `#8edda4` / `#f3c77b` / `#ff8084` |
| Stop / destructive action | Red fill `#b92f32`, white label; hover `#cf383b` |
| Borders | `#2a302b`, strong `#3d473e` |
| Body / metadata | System sans with Chinese fallbacks / local JetBrains Mono |
| Type | 11–16 px controls and metadata; 30 px page / 40 px overview headings |
| Controls / surfaces / dialogs | 2 / 4 / 6 px radius |
| Main controls / navigation | 36 / 42 px |
| Sidebar / titlebar / statusbar | 216 / 56 / 28 px |
| Compact sidebar | 64 px below 1100 px or on user collapse |

Lime marks actions and selection, lilac identifies an idle workspace, and red marks Stop, destructive actions and errors. Real profile status can tint the identity field. Its geometry is an illustration; it does not measure network topology, latency or anonymity.

## A continuous object

`FieldworkProvider` owns one Canvas 2D element across route changes. `LatitudeField` instances reserve overview, compact-heading and sidebar anchors; only the active anchor hands its visual space to the canvas. The renderer chooses a visible anchor and moves the same object between them. Profile selection supplies a stable identity, and the detail page uses the actual profile name and ID.

The object has 684 stable grains on a projected graticule. A fine pointer changes its gaze and disturbs nearby grains with a bounded curl impulse. A damped spring returns them to their original positions in roughly 1–2 seconds. Selection scatters and reforms those same grains. Table view renders depth-dependent character cells from `.:-=+*#%@`; card view blends into points. The pointer leaves a fading lime character trace. These are actual canvas glyphs and grain positions.

Rendering is bounded to 320 × 176 logical pixels with a device-pixel-ratio cap of 2. State, pointer, layout and font readiness invalidate the frame; settled scenes stop requesting frames. Hidden documents suspend scheduling. Reduced motion disables pointer disturbance, snaps poses and view changes, and removes handoff transitions. Canvas failure leaves the local SVG mark visible. The illustration is decorative and does not intercept clicks or replace accessible controls.

## Layout and components

- Overview headings sit on a lime vertical rule opposite the field. Three quiet procedural depth plates connect the field to the sharper workspace frame.
- Navigation, search, table/card controls, forms, settings and dialogs share the smaller radii, borders and color roles. Short windows can scroll the sidebar navigation. Cards retain compact actions and an inset selected edge.
- Instances keep real counts, filters, import, backup, trash and creation handlers. Creation remains a separate page. Language, connector choice and existing core bindings remain in their existing stores.
- One brief cold-entry sequence reveals the frame, heading and actions. Startup remains skippable by keyboard, pointer or wheel, and respects reduced motion. Settled workspaces have no idle animation loop.

Native quit retains managed browser/proxy/Tor cleanup without confirmation. Unsaved-settings navigation protection and rendering-error recovery remain in place. Chrome 148 remains the configured default and 157 optional; the Xray + sing-box and independent Mihomo contracts are unchanged.

## References and deliberate adaptations

The exact entries were located at [十两 /news](https://wangshiliang.cn/news). Version 2.1.0 used public previews with the owner's approval. The continuation then obtained and privately saved all four complete prompts. Version 2.2 implements the four recorded material differences as one application language:

| Reference / difference | Implemented adaptation |
| --- | --- |
| AXON · `D-AXON-01` | Pointer-disturbed particles, gaze response and spring return on the workspace identity object |
| Particle Self · `D-PARTICLE-01` | One persistent renderer and stable grains across overview, selection, view mode, detail and sidebar anchors; actual UI state drives pose and tone |
| ASCII Studio · `D-ASCII-01` | Projected glyph cells, depth-based density, fading lime pointer heat and a continuous glyph/point blend |
| Cyber Layer · `D-CYBER-01` | Sharp 2/4/6 px geometry, asymmetric heading/object composition, procedural depth plates, brief entry staging and red operational Stop/destructive actions |

Cyber Layer's hosted video layers are adapted into local procedural plates; lilac remains scoped to identity so the four sources form a single system. This is an intentional desktop adaptation, not a literal reproduction of four marketing pages. Reference videos, portraits, invented widgets, thumbnails, full prompts and template source are not distributed. The grain model, renderer and interface changes are original project code; no new dependency was added. Existing component and font notices remain in [third-party notices](third_party/NOTICE.md).

## Verification

Version 2.2 passed the production frontend and Wails builds, 124 frontend tests, backend tests, 34 bilingual/viewport/fallback UI checks and nine motion/state integration checks. The visibility check dispatches controlled visibility events; it does not prove OS window occlusion behavior. Installed-app checks captured English/Chinese native windows and exercised readiness, navigation, back and tab operations with real Chrome 148.0.7778.215 and 157.0.8103.38. Normal native quit released the managed browsers and ports. See [the execution result](LATITUDE-APP-REDESIGN-RESULT-2026-11-06.md) and [screenshot provenance](docs/showcase/DEMO.md).
