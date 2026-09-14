# Contributing to Latitude Browser

感谢你帮助改进 Latitude Browser。请先阅读 README 中的来源与许可状态；提交 PR 不会替上游代码建立新的许可证。

## 提交问题

- Bug：系统与架构、源码提交、最短复现步骤、预期与实际行为。
- 界面问题：指出所在页面与下一步想完成的操作，附去除私人信息的截图。
- 功能建议：描述具体工作流，说明已有功能缺在哪里。

不要上传代理订阅、账号密码、Cookie、数据库、浏览器配置目录或完整备份。安全问题按 [SECURITY.md](SECURITY.md) 处理。

## 本地检查

在仓库根目录：

```bash
npm --prefix frontend ci
npm --prefix frontend run build:clean
go test ./backend/...
python3 tools/check-showcase.py
```

CI 使用 Node.js 22 与 Go 1.26.x。更改代理栈时，阅读 [连接栈规则](docs/proxy-connector-stacks.md)，为相关协议、失败和清理路径运行针对性测试。构建成功不代表真实代理出口或已安装桌面程序验证成功。

## Pull Request

让一个 PR 解决一个可说明的问题。描述触发条件、修改后的行为、检查结果与未验证范围。保持格式和命名与相邻代码一致；不要提交生成的安装包、运行时数据或无关格式化。

涉及界面时提供当前代码截图，并标注演示数据；涉及进程、网络或文件写入时说明失败路径和恢复方式。不要将 UI 预览中的模拟操作描述为桌面运行结果。

产品名统一为 `Latitude Browser`。macOS 手工验收和自动化使用 `/Applications/Latitude Browser.app`；历史名称只用于兼容与上游归属。
