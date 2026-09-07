# Latitude Signal UI：复用来源与许可证边界

> 核查日期：2026-09-06 UTC / 2026-09-07 SGT。本文只记录已经实现的 Signal UI、精确来源和分发边界。

## 1. 实际适配

### komari-theme-commander

- 仓库：`wayjam/komari-theme-commander`
- 审计提交：`e7191c1a775027f74c2fcff96bc9d71ff4ac7ac2`
- 许可证：MIT，`Copyright (c) 2026 WayJam So`
- 原文：`third_party/licenses/komari-theme-commander-MIT.txt`

| Latitude 文件 | 上游路径 | 实际保留与删除 |
|---|---|---|
| `frontend/src/shared/components/NetworkGlobe.tsx` | `src/components/Globe.tsx` | 保留 COBE 初始化、尺寸更新、可见性与 reduced-motion gating 思路；删除节点模型、坐标、marker、arc、Portal 标签、速度和威胁数据。 |
| `frontend/src/shared/components/RadarSpinner.tsx` | `src/components/HudSpinner.tsx` | 保留 sm/md/lg 和 diamond/radar 语法；改为 `role="status"`、可读 label 和装饰 SVG。 |
| `frontend/src/shared/components/radar-spinner.css` | `src/index.css` 的 HUD Spinner 规则 | 只对 transform 做旋转；删除 deepspace glow、主题分支和全局动画规则。reduced motion 下完全静止。 |

`NetworkGlobe` 是网络主题插图，不是真实路由或拓扑。它没有 marker/arc，也不提供延迟、吞吐、IP 或安全状态。

### cobe

- 依赖：`cobe@2.0.1`，在 `frontend/package.json` 固定版本，并由 `frontend/package-lock.json` 锁定。
- lock integrity：`sha512-aaa6vcIlaC8C1SF50LDH0Anybo/EAXnrxqe+bwvr4+YUtZydqjeBjTTD7ziCCkbRrRGSns3I3F6cZsf3W+L+ag==`
- npm 发布元数据 gitHead：`4fc247f673fbec28d5ae6d4798757e2bca83ed3b`
- 许可证：MIT，`Copyright (c) 2021 Shu Ding`
- 原文：`third_party/licenses/cobe-MIT.txt`

代码通过动态 `import('cobe')` 加载 WebGL renderer。循环只在 `active`、未暂停、未请求 reduced motion、document 可见且处于 IntersectionObserver 可见区域时继续；代码按硬件并发数/窗口宽度选择 20 或 30 fps 间隔，但本文不据此作性能结论。加载或 WebGL 初始化失败时保留本地 SVG fallback。实现不请求远程纹理、CDN、IP 服务或分析接口。COBE v2 的内置纹理异步上传不会主动重绘，因此初始化后增加一次延迟 200 ms、相同相机的绘制，并在这之前保留 fallback；它不是后台持续动画。静止、减弱动态效果和暂停/恢复均经过浏览器检查。

### komari-ascii

- 仓库：`facl/komari-ascii`
- 审计提交：`d502b45a5797c276849e601e2b601dc1dfe8b8e4`
- 许可证：MIT，版权原文为 `Copyright (c) 2025 Montia37`
- 原文：`third_party/licenses/komari-ascii-MIT.txt`

| Latitude 文件 | 上游路径 | 实际保留与删除 |
|---|---|---|
| `frontend/src/shared/components/AsciiMeter.tsx` | `src/components/ascii/AsciiProgress.tsx` | 保留分段进度结构；增加 finite 检查、0–100 clamp、未知状态和 progressbar 语义，颜色改用 Latitude token。 |

`AsciiMeter` 只渲染调用方数据，不生成随机或模拟值。版权人必须保持 `Montia37`，不能改写为仓库 owner。

## 2. 仅作视觉参考：dex-ui

- 仓库：`seenaburns/dex-ui`
- 审计提交：`04371c6844c027627f32b45f15909f35b6e17a58`
- 仓库许可证文件：BSD-3-Clause 文本，`Copyright (c) 2015, Seena Burns`
- 审计副本：`third_party/licenses/dex-ui-BSD-3-Clause.txt`

参考路径包括 `src/term.cpp`、`src/radar.cpp`、`src/graph.cpp` 和 `src/spikeGraph.cpp`。Latitude 没有复制其中的 C++、openFrameworks、OpenGL mesh、camera 或 GLSL shader。dex-ui 只影响石墨终端、雷达层次和线框图形的概念方向；它不是 `NetworkGlobe` 的 3D 源码。

## 3. Signal UI 规则

- Globe、radar、terminal chrome 不能凭空展示节点、线路、延迟、吞吐、匿名性或连接成功。
- `NetworkGlobe` 是插图；真实状态只能来自当前 Xray + sing-box 组合栈或 Mihomo 独立栈的后端结果。
- `RadarSpinner` 只表示处理进行中，可访问名称由 `label` 提供。
- `AsciiMeter` 对未知值显示未知状态，不补造百分比。
- 所有持续动画遵守 reduced motion；隐藏或不活动的 globe 不继续其代码调度循环。

## 4. Tor 不属于 UI 复用来源

Latitude 当前不分发 Tor binary 或 Expert Bundle，只接受用户手动选择并自行信任的本地可执行文件路径。保存路径不会下载、启动或验证该文件。

2026-09-06 的官方下载页列出稳定 Expert Bundle 15.0.21，包含 Tor 0.4.9.11。Expert Bundle 是包含 Tor 与 pluggable transports 等内容的编译分发物；其 bundle notices 与各 source component 的许可证需要分别核对。运营侧的“GPLv3 build”标记不能替代逐项许可证审计。若未来改为随 Latitude 分发，必须先完成对应源码、notice、签名和再分发义务审计。

## 5. 发布检查

1. 随源码和产品 notices 保留 `third_party/NOTICE.md` 以及 `third_party/licenses/` 下四份原文。
2. 不假设 `node_modules` 会随 Wails 包完整分发；cobe 的 MIT 文本必须由仓库内副本承载。
3. 源码文件头保留具体上游、提交 SHA 和集中许可证路径。
4. 不复制上游 flag、OS icon、logo、noise image 或其他未单独审计的资产。
5. 新增 marker、arc 或 telemetry 前，先定义真实数据来源和用户可理解的语义。
