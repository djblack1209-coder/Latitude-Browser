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
- `bin/darwin-arm64/mihomo` (Mihomo v1.19.30, independent stack)

Runtime hashes are pinned in `publish/runtime-manifest.json`.
Pinned upstream archive sources are tracked in `publish/runtime-sources.json`.
Use `python3 tools/runtime/sync-runtime.py --target <target>` to refresh that target's locked runtime files. ZIP and tar.gz entries select `archiveBinaryPath`; `gz` entries contain one binary payload and ignore the gzip filename header. The tool verifies `archiveSha256` and, when present, exact `archiveSize` before extraction. It finishes extraction/CRC checks, flushes the temporary file and sets executable permissions before atomically replacing each destination. Download, integrity, extraction, write or permission failures do not replace that runtime's old file; a multi-runtime batch is not a single all-or-nothing transaction.

Darwin arm64 pins Xray `v26.3.27`, sing-box `v1.14.0`, and the standard Mihomo `v1.19.30` asset. Other targets retain their existing locks. Mihomo on other targets remains optional and can use the app's official MetaCubeX release flow when the independent connector stack is selected. This does not switch connector stacks.

The archive lock comes from official GitHub Release metadata over HTTPS, not an independently verified publisher signature. The manifest records the extracted upstream bytes before local packaging/signing; do not replace this source hash with a locally re-signed bundle hash. Full upstream license and fixed source provenance are recorded in `third_party/NOTICE.md` and `third_party/licenses/`.

Offline sync regression tests (no downloads or binary execution):

```sh
python3 -B -m unittest discover -s tools/runtime -p 'test_sync_runtime.py' -v
```
