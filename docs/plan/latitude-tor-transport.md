# Tor 网络传输实验：设计、实现与验收边界

更新：2026-09-06 UTC / 2026-09-07 SGT（UTC+08:00）。产品入口：`/Applications/Latitude Browser.app`。

## 结论

本轮前，仓库没有托管 Tor 进程、Tor 网络模式或相应验收测试。现有 Chromium 指纹参数不能代表已经实现 Tor Browser 的匿名保护。

**复用官方 C Tor 守护进程是可行的，已实现默认关闭的实验性 Tor TCP 网络模式。** 不移植 Firefox 内核，不将 Tor Browser 安装包当作 Chromium 插件，也不重新实现洋葱路由协议。现有 Xray + sing-box 组合栈和独立 Mihomo 栈保留，并与 Tor 模式互斥。

**不将“Tor 外层 + 近乎真实的独特指纹内层”描述为两层匿名。** 网络路径与浏览器可识别性是不同问题：Tor 改变网络路径；独特且稳定的设备指纹、登录账号和 Cookie 仍可关联同一个人。Tor Browser 的反指纹方向是降低用户间的可区分性，而不是让每个人都获得一个高度独特的“真实”身份。Tor 被识别为网络传输、线路观察、浏览器漏洞、端点泄漏也不是单一的“解密第一层”情景。

高风险匿名浏览应使用官方 Tor Browser。Latitude 的实验模式只声明受管 Tor 传输，不声明匿名身份、无泄漏、Tor Browser 等价或抗全局流量关联能力。

## 本轮实现

### 网络路径

```text
普通实例（现有默认）
  ├─ browser.default_connector_type=xray
  │    ├─ Xray：vmess / vless / trojan / shadowsocks / 支持的代理链等
  │    └─ sing-box：hysteria2 / tuic / anytls 等
  └─ browser.default_connector_type=mihomo
       └─ 独立 Mihomo，不自动回退到组合栈

显式选择 Tor 的实例（实验性）
  Chromium 实例 → 127.0.0.1 随机 SOCKS5 端口 → 独立官方 Tor 进程
              → Tor 网络 → 出口/洋葱服务
```

Tor 不是 `default_connector_type` 的第三个值，也不是 `preferredKernel`。Tor 实例的 `proxyId` 与 `proxyConfig` 必须为空；导入、创建、更新和启动时均校验，不能悄悄把普通代理串接进 Tor，也不能退回 `direct://`。

### 配置和交互

- 配置：`browser.tor_binary_path`，默认空。只接受显式指定的本地可执行文件，不静默下载、猜测系统路径或执行版本探测。
- 实例：`networkMode: "proxy" | "tor"`。旧数据迁移和新实例默认 `proxy`；这里的 `proxy` 表示原有普通网络流程，也包括显式直连，不表示强制存在代理。
- 设置 → Tor 实验室：查看配置可用性、每个受管进程的引导进度及状态。文件存在/可执行不等于签名已验证，更不等于连接成功。
- 编辑实例：显式切换 Tor，有旧代理时确认清除；运行中禁止切换网络模式；显示 TCP、实验性与指纹风险提示。
- 列表、详情：Tor 专用标识，隐藏普通代理测速/切换，不显示“直连”。
- `productionReady` 保持 `false`。界面不制造匿名分数、全球节点位置、线路图或安全认证。

### 生命周期与约束

- 每个实例独立 Tor 进程、私有数据目录与 SOCKS 端口。目录按实例 ID 摘要生成，Tor 状态目录权限 `0700`，配置 `0600`（POSIX）。目录持久化以保留守卫状态；复制实例不复制 Tor 守卫目录。
- 启动等待 Tor 日志引导完成及实际 SOCKS5 握手就绪；生产默认等待窗口 75 秒，未就绪不启动浏览器。
- 固定浏览器代理及主机解析规则；过滤冲突参数，追加 DNS/DoH、QUIC、WebRTC 非代理 UDP、扩展等限制。`--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1` 只豁免连接受管 SOCKS 所需的精确 IP；Chromium 的主机映射也作用于代理 IP 字面量，不豁免它会导致代理自身无法解析。此规则不是代理绕过；仍设置 `--proxy-bypass-list=<-loopback>`。实际内核是否遵守每个开关仍需真实泄漏测试，不把字符串单元测试当作网络证明。
- Tor 失败不回退普通连接栈或直连；进程意外退出触发停止依赖实例及错误反馈；正常停止先处理浏览器，再回收 sidecar。
- 有 Tor 实例时不能仅退出管理器而把它们留为无人监管进程；“仅退出应用”会升级为完整受管清理（包括同时运行的普通受管浏览器），退出确认明确告知这一点。只有确认停止后才授权原生退出，停止失败返回错误并恢复可重试操作，不调用前端无条件退出后备路径。
- 关闭请求使用短持有的 `quitMu` 即时阻止新启动；Tor 引导、实例启动/停止、备份初始化/导入及关闭清理使用 `torLifecycleMu` 串行化。原生关闭回调不等待 75 秒引导；重叠退出不能重置尚未完成的清理授权。
- 浏览器停止优先 CDP 关闭，并验证 PID/端口确实退出；强制停止只作用于仍由该实例持有、PID 匹配的子进程。旧实例监控器不能误停同 ID 的替代实例。应用不依赖无主 PID 或宽泛进程名进行强杀。
- 现有实例管理需要 **本机 loopback CDP**，本轮保留。CDP、自动化、快照、Cookie 和本地恶意进程风险没有被 Tor 消除。CDP 无法使用时，不允许启动不带受管网络约束的独立浏览器回退。
- 不实现任意 Tor 配置、出口国家切换、自动 NEWNYM、“每次换身份”等开关，避免误导用户及不必要的接口扩张。

## 不在本轮匿名保证内

| 风险 | 当前边界 |
|---|---|
| 浏览器指纹 | 普通 Chromium + 现有指纹配置，不包含 Tor Browser 完整反指纹补丁 |
| 账号、Cookie、持久化存储 | 可直接关联身份；切换 Tor 不自动擦除旧身份，也不把擦除伪装成安全默认 |
| DNS / IPv6 / WebRTC / QUIC | 有启动约束，仍需按实际内核和操作系统抓包验收 |
| 非浏览器 TCP、系统流量 | 不是系统 VPN；应用更新、代理池测试等不是 Tor 实例流量 |
| 本地 CDP / 自动化 / 恶意扩展或本地程序 | 不是对抗已控制本机的安全边界；扩展在 Tor 启动策略中禁用，不能据此认证无绕过 |
| 全局流量分析、时间关联 | 不承诺抵抗能观察两端的强大对手 |
| 出口侧内容 | 仍需 HTTPS；Tor 本身不替代网站端到端 TLS |
| 隐藏正在使用 Tor | 普通 Tor 连接不保证向网络观察者隐藏 Tor 使用；网桥/可插拔传输暂不接入 |
| Windows / Linux 实机 | 代码有平台分支，本轮不冒充多平台端到端验收 |

## 复用、供应链和许可

- 官方来源：<https://www.torproject.org/download/tor/>。
- 本轮本机评估使用固定版本 **Tor Expert Bundle 15.0.21 / macOS aarch64，Tor 0.4.9.11**。
- 下载的原始归档 SHA-256：`83dec16412c1d97b91af603229481dd29f578e1485620ecffd9ac4aabcf6fb46`。
- 使用独立临时 GnuPG keyring，经 Tor 官方 WKD 获取密钥，验证分离签名；主密钥指纹 `EF6E286DDA85EA2A4BA7DE684E2C6E8793298290`，签名子钥 `CAAE408AEBE2288E96FC5D5E157432CF78A65729`。记录的签名日期为 2026-09-01 UTC。
- macOS 评估副本的 `libevent` 动态库最初被 dyld 拒绝（缺少代码签名）；只对已核验的本地评估副本做 ad-hoc 签名后运行，未修改原归档，未关闭 Gatekeeper/SIP。OpenPGP 来源验证不等于 Apple Developer ID 公证。
- 该固定编译版本的 `tor --version` 明示 **GPLv3 build**。不能仅看 Tor 部分源码的 BSD 许可就把整个 Expert Bundle 当作 BSD 组件分发；还需覆盖所有捆绑库和可插拔传输的 notices/source obligations。
- Latitude 当前不在安装包、Git 仓库或公共发布物中捆绑/自动下载 Tor 二进制。用户可选择自己信任的本地运行时。若后续要随产品分发，应先完成该精确构建的完整许可、对应源码、更新和代码签名流程；现有项目上游许可问题也仍需独立解决。

## 验证方式和准入门槛

### 可复现命令

```bash
# 确定性进程、配置、启动参数和连接栈测试
# 在仓库根目录执行
go test ./...
go test -race ./backend/internal/proxy ./backend/internal/browser ./backend/internal/launchcode ./backend

# 真实 Tor 管理器集成（未设置变量时会显式 SKIP，不算真实网络通过）
LATITUDE_TOR_BINARY=/absolute/path/to/verified/tor \
  go test ./backend/internal/proxy -run '^TestTorManagerRealBinary$' -count=1 -v

# 前端检查
cd frontend
npx tsc --noEmit
npm run build:keep
```

真实网络请求验证使用 SOCKS5 **远端主机名解析**，不能把普通直连 curl 当作 Tor 成功：

```bash
curl --socks5-hostname 127.0.0.1:<managed-port> \
  https://check.torproject.org/api/ip
```

### 截至 2026-09-06 UTC / 2026-09-07 SGT 的直接证据

- 固定官方二进制独立进程引导完成，约 46 秒到 100%。
- 经该 SOCKS 端口访问官方检查 API，返回 `IsTor: true`。出口 IP 不写入公开文档。
- `TestTorManagerRealBinary` 通过：实际运行本项目的 Tor 管理器，引导及 SOCKS 就绪，测试结束清理进程（42.49 秒）。这不是仅打印版本或模拟日志。
- 正式安装入口的真实原生回归 **18/18**：实际 Chrome 经受管 Tor 两次访问 HTTPS 官方检查接口均返回 `IsTor: true`；正常停止/重启成功，旧进程退出；精确终止自建 QA Tor 进程后依赖 Chrome 停止，实例保留 Tor 错误，测试清理无错误。
- 此原生测试使用隔离配置和标准 Google Chrome，不是实际指纹内核，不是全流量抓包。为保留 macOS 证书服务，QA 专用启动适配器恢复浏览器的 OS HOME，但强制浏览器使用隔离 `user-data-dir`；没有关闭 TLS 校验或沙箱，也没有修改生产配置。
- Go 全量 256 个测试/子测试通过，四个核心包的 race 检查 216 个测试/子测试通过；默认命令中的真实 Tor 二进制测试明确跳过，不能重复计作真实网络通过。
- 冷引导存在超过 75 秒的失败记录；最终构建第一次冷引导失败，独立夹具重试 18/18 通过。超时时不启动 Chrome、不回退直连，未为复测放宽超时或安全约束。功能通过不表示冷引导成功率或长期稳定性已验收。
- 最终前端、安装、原生关闭流程及失败记录见 [验收记录](latitude-signal-verification.md)。浏览器 preview 的 mock 操作与真实桌面/网络证据分开记录。

### 仍需单独通过的生产匿名准入

1. 在正式安装入口、实际指纹内核上，抓取完整进程网络流量，检查 DNS、DoH、IPv6、UDP、QUIC、WebRTC、loopback/link-local、代理绕过列表及导航重定向。
2. 标准 Chrome 的 sidecar 终止、正常停止/重启已通过；仍需实际指纹内核下的线路失效、睡眠恢复、压力启动/停止及进程网络抓包矩阵。故障停机证据不等于已证明所有内核/操作系统上的包级 fail-closed。
3. 对所有可写启动参数、策略文件、PAC、插件/扩展、本地 CDP 和自动化桥做绕过审计。
4. 证明未连接 Tor 时不会打开外部启动页或执行带外请求；Tor 模式与两套现有代理栈不相互调用。
5. 独立身份方案评审：采用受控统一指纹族，而非承诺唯一“真实指纹”可匿名；隔离已有账号和存储的迁移需用户明确选择。
6. Windows、Linux、macOS 分别做实机网络和生命周期矩阵；完成运行时更新、许可、签名和供应链计划。

只有这些门槛有可复核证据后，才可重新评估产品声明。即便通过常见泄漏测试，也不能对抗所有红队手段或声称“绝对匿名”。

## 官方技术依据

- Tor Browser 与普通浏览器的区别：<https://support.torproject.org/tor-browser/getting-started/about-tor-browser/>
- 为什么不建议用普通浏览器代替 Tor Browser：<https://support.torproject.org/tor-browser/security/using-tor-with-other-browsers/>
- Tor Browser 反指纹保护：<https://support.torproject.org/tor-browser/features/fingerprinting-protections/>
- Chromium 代理/SOCKS 与隐式绕过规则：<https://chromium.googlesource.com/chromium/src/+/HEAD/net/docs/proxy.md>
