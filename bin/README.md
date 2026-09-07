# Runtime binaries layout

Windows (legacy):

- `bin/xray.exe`
- `bin/sing-box.exe`
- `bin/mihomo.exe` (optional independent Mihomo stack)

Linux (new):

- `bin/linux-amd64/xray`
- `bin/linux-amd64/sing-box`
- `bin/linux-amd64/mihomo` (optional independent Mihomo stack)
- `bin/linux-arm64/xray`
- `bin/linux-arm64/sing-box`
- `bin/linux-arm64/mihomo` (optional independent Mihomo stack)

macOS (unsigned internal builds):

- `bin/darwin-amd64/xray`
- `bin/darwin-amd64/sing-box`
- `bin/darwin-amd64/mihomo` (optional independent Mihomo stack)
- `bin/darwin-arm64/xray`
- `bin/darwin-arm64/sing-box`
- `bin/darwin-arm64/mihomo` (optional independent Mihomo stack)

Runtime hashes are pinned in `publish/runtime-manifest.json`.
Pinned upstream archive sources are tracked in `publish/runtime-sources.json`.
Use `python3 tools/runtime/sync-runtime.py --target <target>` to refresh pinned Xray/sing-box runtime files safely. Mihomo is optional in release bundles and can be downloaded from the app's official MetaCubeX release flow when the independent connector stack is selected.
