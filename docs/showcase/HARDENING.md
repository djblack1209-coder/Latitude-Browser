# 后端修复与验证

[返回首页](../../README.md) · [工程导览](ENGINEERING.md) · [演示指南](DEMO.md)

这轮改动围绕真实失败路径：保存失败不能让内存和数据库各说各话，CDP 关闭不能直接当作进程退出，下载成功不能只看收到 HTTP 响应。以下代码和测试随源码提交，方便复核和面试讨论。

## 数据、认证与运行时

| 触发条件 | 修改后的行为 | 代码与回归依据 |
| --- | --- | --- |
| 保存代理列表时事务启动、写入或提交失败 | 数据库使用事务替换；持久化成功后才发布内存状态；文件保存检查同步、关闭和替换错误 | [代理 DAO](../../backend/internal/browser/proxy_dao.go)、[保存故障测试](../../backend/app_proxy_save_atomic_test.go) |
| 数据库迁移失败 | 启动返回错误，禁止后续消费者使用未完成迁移的数据库 | [启动流程](../../backend/app_startup.go)、[迁移测试](../../backend/internal/database/migration_test.go)、[启动测试](../../backend/app_startup_database_test.go) |
| 备份期间有数据库或配置写入、实例仍运行 | 使用维护期写入门控与 SQLite 一致性快照；运行中的浏览器阻止导出 | [一致性导出](../../backend/app_backup_consistent_export.go)、[一致性测试](../../backend/app_backup_consistency_test.go) |
| 快照恢复在替换目录时失败，或上次恢复未完成 | 在同一文件系统暂存，保留旧目录和恢复记录；检查并处理未完成恢复 | [恢复实现](../../backend/internal/snapshot/restore.go)、[失败恢复测试](../../backend/internal/snapshot/restore_test.go) |
| 导入归档包含越界路径、符号链接、冲突名称或过大内容 | 在破坏现有数据前验证归档；内核解包使用受限根目录 | [归档策略](../../backend/internal/snapshot/archive_policy.go)、[归档测试](../../backend/app_backup_archive_rules_test.go)、[内核解包测试](../../backend/internal/browser/core_archive_security_test.go) |
| API/CDP 请求缺少认证、认证配置为空或发生重载 | HTTP、发现端点和 WebSocket 使用一致的认证快照；无效配置拒绝启用；校验 Host/Origin | [认证边界](../../backend/internal/launchcode/auth_boundary_test.go)、[认证重载](../../backend/internal/launchcode/auth_reload_test.go)、[配置测试](../../backend/app_auth_config_test.go) |
| 自动化遇到认证失败或异源 CDP 地址 | 拒绝继续连接，不回退到未经认证的原始调试端口 | [runner 实现](../../backend/internal/automation/assets/runner_shared.cjs)、[回归测试](../../backend/internal/automation/tests/runner_auth.test.cjs) |
| 分段下载的版本、范围或长度不一致 | 校验状态、Content-Range 和强 ETag；不能安全拼接时走单流下载；写盘或提交失败不发布新内核 | [传输测试](../../backend/internal/browser/download_core_transfer_test.go)、[安装回滚测试](../../backend/internal/browser/core_install_test.go)、[代理内核下载测试](../../backend/app_proxy_core_download_http_test.go) |
| 关闭与代理启动并发、进程异常退出、重复释放连接 | 先关闭新启动入口，再等待已有启动与进程退出；按租约和进程代次释放；HTTP 响应体关闭前保留租约 | [生命周期](../../backend/internal/proxy/bridge_lifecycle.go)、[租约测试](../../backend/internal/proxy/bridge_lease_integration_test.go)、[真实进程测试](../../backend/internal/proxy/bridge_real_runtime_test.go) |
| 生产页面没有 Wails 桥接或方法缺失 | 停止业务操作并显示错误；模拟数据只能在开发环境显式开启 | [桌面边界](../../frontend/src/shared/components/DesktopServiceBoundary.tsx)、[生产 Vite 桥接测试](../../frontend/scripts/bridge-boundary.test.mjs) |
| 平台不支持实例内存硬限制 | 后端报告能力并拒绝不支持的参数；编辑页同步禁用该设置 | [平台能力](../../backend/internal/browser/platform_capabilities.go)、[平台测试](../../backend/internal/browser/profile_platform_memory_test.go) |
| 打包脚本和 CI 对产物位置理解不同 | 输出机器可读清单，校验精确路径、架构和签名状态后上传清单所指产物 | [macOS 产物契约](../../publish/mac/artifact_contract.py)、[测试](../../publish/mac/test_artifact_contract.py) |

## 移除未使用的嵌入式 Mihomo 依赖

旧 `mihomoURLTest` 和 `unifiedDelayTest` 没有调用方，却让 Go 模块引入了完整 Mihomo 依赖树。这些辅助函数已移除，`go mod tidy` 清理了依赖；应用的 `go list -deps ./...` 不再包含 `github.com/metacubex/mihomo`。

实际测速继续经过 `SpeedTestWithConnector` 和当前连接栈的 HTTP 客户端。Xray + sing-box 组合栈与独立 Mihomo 栈的进程桥接均保留。独立二进制的许可没有改变，详见[许可范围](../../LICENSE-SCOPE.md)。

这一清理也暴露了原有测试夹具依赖背景 goroutine 的问题：模拟浏览器使用空 `select` 时会自行死锁退出。夹具现在等待明确的就绪信号，并用定时等待持续存活，确保停止测试确实从“进程仍在运行”开始。

## 可重复执行的检查

在 macOS arm64、Node.js 22 和 `go.mod` 指定的工具链下，从仓库根目录执行：

```bash
npm --prefix frontend ci
npm --prefix frontend run build:clean
npm --prefix frontend test
go test ./...
go vet ./...
go test -race ./backend/...
python3 -m unittest discover -s tools/runtime -p 'test_*.py'
python3 -m unittest discover -s publish/mac -p 'test_*.py'
python3 tools/check-showcase.py
bash tools/runtime/verify-runtime.sh darwin-arm64
LATITUDE_TEST_PROXY_RUNTIMES="$PWD/bin/darwin-arm64" \
  go test -race ./backend/internal/proxy -run '^TestBridgeLocalRuntime' -count=1 -timeout=3m
```

[CI](../../.github/workflows/ci.yml) 执行这些检查。真实进程测试启动固定版本的 Xray、sing-box、Mihomo，连接本地受控 HTTP 服务，覆盖启动、异常退出恢复和停止期间的资源回收；不使用私人订阅或公网代理。未设置运行时路径时，该组测试会明确跳过，不能把普通 `go test` 当作真实内核验证。

## 验证范围

测试覆盖本机受控输入和故障注入。它们不证明所有公网节点、所有协议组合、完整桌面操作或其他操作系统都可用。

- 快照目录切换保留恢复记录与旧副本，两个重命名不构成断电下的跨目录事务；真实断电恢复未验证。
- 备份拒绝不支持的外置内核路径，避免静默生成缺少内核文件的包；跨机器恢复和全部导入步骤的统一事务仍有后续工作。
- 私有运行时文件权限已收紧；系统钥匙串、备份加密及完整数据加密尚未实现。
- 本轮源码回归与代理进程测试不替代 `/Applications/Latitude Browser.app` 的重新构建、安装和原生验收。
- 尚未发布可下载的正式 Release；上游授权、第三方完整分发义务、macOS 签名公证和 Windows/Linux 实机验证仍需推进。
