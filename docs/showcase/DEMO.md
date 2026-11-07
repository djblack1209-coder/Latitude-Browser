# 展示 Fieldwork 2.1

[中文首页](../../README.md) · [English](../../README.en.md) · [工程导览](ENGINEERING.md)

## 三分钟路径

1. 打开 `/Applications/Latitude Browser.app`。从实例页说明独立环境、当前运行状态、搜索、筛选、表格/卡片和创建入口。
2. 打开资产页，查看已有内核、默认项和实例绑定。连接设置展示 Xray + sing-box 组合栈与 Mihomo 独立栈的明确选择。
3. 使用空白测试实例打开可信本地页面，在实例详情中读回真实标签页标题和地址。展示 ⌘/Ctrl K 快捷启动与中英文切换。
4. 正常退出，观察无需确认；受管测试实例随完整清理结束。不要使用私人账号、订阅、工作资料或生产浏览器作为公开演示素材。

## README 截图来源

| 文件 | 实际来源 |
| --- | --- |
| `fieldwork-workspace-en.png` | 正式安装 App 的英文实例页，四个展示用 QA 实例 |
| `fieldwork-workspace-zh.png` | 同一版本切换中文后的实例页 |
| `fieldwork-cores-en.png` | 原生资产页，148 默认、157 可选的配置读回 |
| `fieldwork-instance-tabs-en.png` | 原生详情页，从 App 打开本地 URL 后读回的两个真实标签页 |

截图日期为 2026-11-06，版本 2.1.0，来自 `/Applications/Latitude Browser.app` 的真实窗口。使用独立 QA HOME/用户数据目录；没有接入私人账号或生产代理。界面原样捕获，未拼接 UI、改写运行数量或用 HTML 预览冒充原生窗口。标题栏可见 macOS 的窗口共享指示。

Cookie 截图明确按 `127.0.0.1` 过滤，不公开其他域名的值。运行数量和标签页均以捕获时应用读回的状态为准。浏览器流程的独立验收使用 Chrome 157 与受约束的 QA 启动器：仅允许测试用户数据目录，同时保留 Chromium 所需的正常 macOS HOME。测试结束后 App、浏览器、HTTP 见证服务和端口均被回收；原有语言和实例筛选偏好保持。

这组截图本身不是对 Chrome 148、远端代理、Tor、Windows/Linux 或指纹/匿名能力的通过证明。续办中另以正式 App 和隔离资料目录完成 148 的 CDP 就绪、导航、后退及标签页开关检查；详见[结果文件](../../LATITUDE-APP-REDESIGN-RESULT-2026-11-06.md)。旧截图和历史审查资料不代表 2.1 的当前界面。

## 只看界面时

```bash
cd frontend
npm run demo
```

开发预览保留“Mock data”提示。可使用[演示数据脚本](../../frontend/scripts/showcase-fixtures.mjs)生成内存中的展示数据，但不能把模拟启动、测速或状态变化解释为真实浏览器执行。正式 README 本轮使用上表中的原生截图。
