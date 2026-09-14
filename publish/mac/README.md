# macOS 打包与验证

在目标架构的 Mac 上执行：

```bash
bash publish/mac/publish-mac.sh --arch arm64
```

支持 `arm64` 和 `amd64`，要求本机与目标架构一致。`--version` 覆盖本次产物版本标签；默认读取 `wails.json`。应用内版本来自 Wails 构建配置。`--skip-build` 仅复用唯一的现有构建输入，仍检查图标；多个构建输入会明确失败。

打包完成后生成：

- `publish/output/LatitudeBrowser-<version>-macos-<arch>.zip`：分发压缩包。
- `publish/output/manifest-macos-<arch>.json`：本次构建的精确本机路径、架构、版本标签、ZIP 哈希、应用标识与关键文件哈希。旧版本压缩包不会被模糊匹配选中。
- `publish/output/.bundles.noindex/LatitudeBrowser-<version>-macos-<arch>.app`：仅供打包校验的临时构建产物，不作为启动、Dock 或自动化入口。

GitHub Actions 通过打包步骤的 outputs 获取本次精确清单与 ZIP 路径，仅上传这两个文件。清单在一次新构建开始前失效，只有本次完整打包成功后才重新发布。清单中的绝对路径用于原构建机器上的验证，下载到其他机器后不能直接复用这些本机路径。

```bash
python3 publish/mac/artifact_contract.py validate \
  --manifest publish/output/manifest-macos-arm64.json --arch arm64
python3 -m unittest discover -s publish/mac -p 'test_*.py' -v
```

校验会比对哈希、核对应用标识、检查 ZIP 路径，在唯一的私有 `.noindex` 临时目录中展开，核对包内文件、签名与 Mach-O 架构，并在成功或失败时清理临时目录。它不会启动任何应用。合成契约测试覆盖两种架构的路径处理，并不等于已经在 Intel Mac 上构建和运行。

正式安装和手工/自动化验收唯一使用 `/Applications/Latitude Browser.app`，Bundle ID 固定为 `com.latitude.browser.desktop`。安装后需清理旧构建路径的 LaunchServices 注册，核对系统搜索只有这一入口。禁止把 `.bundles.noindex` 或 `build/bin` 中的构建副本设为 Dock 或测试入口。

图标源为 `build/appicon.png`。打包检查生成的 ICNS；安装后可运行：

```bash
bash tools/runtime/refresh-macos-app-icon.sh "/Applications/Latitude Browser.app" --source build/appicon.png
```

应用可写状态位于 `~/Library/Application Support/latitude-browser`，运行时可执行文件随应用分发。构建采用 ad-hoc 签名并验证其完整性；Developer ID 签名、公证与公开分发资格仍是单独的发布要求，本地构建通过不等于具备这些资质。
