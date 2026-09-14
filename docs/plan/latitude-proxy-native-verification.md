# 普通代理：真实 Chrome 验收

## 验收范围

把“后端 HTTP 请求可达”与“用户实际启动的浏览器可用”分开验证。本脚本通过已有 Launch API 选择 QA 代理池节点、启动真实 Chrome、读取浏览器网络响应和 DOM，再测试断链、原会话恢复、停止重启以及受管进程/端口释放。不增加产品 API，不改变操作页或生产配置。

源码入口：

- `frontend/scripts/verify-native-proxy.mjs`：显式 opt-in 的 macOS 原生验收。
- `frontend/scripts/native-proxy-fixture.mjs`：本轮新建的带认证 SOCKS5 上游与唯一标记页面。
- `frontend/scripts/verify-native-proxy.test.mjs`：启动路径、配置隔离、状态判据、API/CDP 与清理身份的离线测试。
- `frontend/scripts/native-proxy-fixture.test.mjs`：协议握手、认证、允许目标、断链/恢复、超时与释放的离线测试。

## 安全边界

- 唯一应用入口是 `/Applications/Latitude Browser.app/Contents/MacOS/latitude-browser`。不从构建目录启动，不执行安装、签名、发布或应用替换。
- 每次创建新的私有临时 HOME，应用状态、SQLite、代理配置和 Chrome user-data-dir 都位于其中。预先写入最小配置及空 `proxies.yaml`、`chrome` 目录，避免首次启动复制安装目录里的历史配置。
- 不读取生产数据库、代理凭据、订阅或 Chrome 用户目录；不连接已在运行的 Latitude Browser，也不关闭其他 Chrome。
- API 使用随机端口和一次性认证 key。发送 key 前核对 listener PID、UID、启动时间、父进程、正式 executable 与 QA HOME；拒绝 HTTP 重定向。只允许删除本轮创建并确认停止的 profile。
- Chrome 固定使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。QA launcher 只允许唯一且完全匹配的 user-data-dir；拒绝其他/重复目录参数及符号链接逃逸。
- **macOS 系统信任服务共享**：launcher 在通过 QA user-data-dir 检查后恢复原 OS HOME，再 exec Chrome。这沿用已有原生 Tor 验收的系统证书服务处理；浏览器 profile 仍隔离，但不能称为整个 OS HOME 完全隔离。没有关闭 TLS 校验或 Chromium sandbox。
- 上游仅绑定 `127.0.0.1`，强制随机账号密码认证；仅转发本轮 witness 域及 `api.ipify.org:443`。不接收任意目标、IP 字面量、UDP 或 BIND。公网连接只使用经检查的公开 IPv4 地址，防止解析后再次按域名连接。
- 应用的延迟后台测速也指定到本轮本地 witness；后台连接统计不冒充浏览器请求证据。
- launcher 在 `exec` 前写入私有、不可覆盖的 PID / UID / 启动时间 / 原父 PID 记录，并以结束标记区分未写完状态。采集不依赖启动 API 成功返回；孤儿根进程也必须匹配原始记录、精确 QA 目录及 Chrome executable，不能凭一个响应 PID 授权清理。
- 已登记的进程身份不会因 PID 复用而覆盖；子进程只从当前仍匹配原身份的祖先扩展。单路采集每 500ms 执行，清理先停止并等待采集，再于 app 退出后补读启动记录。
- SIGINT/SIGTERM 进入失败清理，不计成功。优先使用产品停止接口；故障兜底仅处理已经记录并重新核验的 PID、启动时间、UID、完整命令及 executable。不会使用宽泛 `pkill`。采集不是任意 OS 崩溃下的全进程追踪器，不能保证识别两次采集之间失去所有祖先且不带 QA 目录的短命 helper。

## 执行

需要 macOS、Node 22+、系统 `/usr/bin/sqlite3`、已安装正式应用及标准 Google Chrome。默认 Xray 验收要求正式应用内可执行的 Xray 和 sing-box；显式 Mihomo 验收要求正式应用内可执行的 `Contents/MacOS/bin/mihomo`。脚本不自动安装缺少的依赖，也不接受任意二进制路径覆盖。

在仓库根目录运行离线测试：

```sh
node --test frontend/scripts/native-proxy-fixture.test.mjs frontend/scripts/verify-native-proxy.test.mjs
```

这组测试仅使用自建 loopback 服务及显式 DNS/TCP/HTTPS mock，不会启动正式应用、Chrome 或访问公网。它不能替代下一条原生验收。

查看操作范围，不执行任何原生测试：

```sh
node frontend/scripts/verify-native-proxy.mjs --help
```

明确启动隔离原生测试，并访问所列公网目标：

```sh
node frontend/scripts/verify-native-proxy.mjs --run
```

需要专门复验后台测速与空闲回收交叠时：

```sh
node frontend/scripts/verify-native-proxy.mjs --run --background-overlap
```

此模式仅延迟本轮 Chrome 的最后停止时间到 QA app 启动约 90 秒，不修改产品调度器。要求最后停止前尚无首次后台测速完成标记、等待期间确实出现该完成标记，且正常回收实际超过原固定 70 秒窗口；条件不足就失败，不声称覆盖了交叠。通常需约 3 分钟。

仅在完成当前源码正式安装后，执行独立 Mihomo 验收：

```sh
node frontend/scripts/verify-native-proxy.mjs --run --connector mihomo
```

`--connector mihomo` 与 `--background-overlap` 不可组合：后者专门验证 Xray 的空闲回收时序，不能用于证明 Mihomo。默认 `--run` 仍为 Xray，没有改变产品默认连接栈。

不带参数或仅 `--help` 时只输出帮助。独立 `--background-overlap` 或未知参数返回非零，不会猜测测试对象。网络目标故障、TLS 错误、超时或缺少依赖均不是成功；不要通过换生产节点、跳过断言或禁用证书校验“修复”结果。

## 成功判据

| 环节 | 必须出现的证据 |
| --- | --- |
| 隔离与认证 | 正式路径、QA HOME、单实例锁和独占 API listener 所属一致；无认证写入被拒绝 |
| 选择代理 | 新 profile 保留本轮代理池 `proxyId` 与 `networkMode=proxy`，不以 custom config 绕开选择 |
| 启动 | HTTP 200、`ok=true`、`ready=true`、`running=true`、`debugReady=true`；真实 Chrome PID 与私有 profile 一致 |
| 执行内核 | 默认 Xray 使用唯一的本地 SOCKS5 bridge；显式 Mihomo 使用唯一的本地 HTTP mixed-port。端口必须由本轮应用创建的所选内核持有，不能直连上游或跨栈启动其他内核；Mihomo 另核验 controller 端口 |
| 浏览器路由 | 主文档 URL、frame、loader 与本次 nonce 相符；实际 Chrome 网络响应和 DOM 均包含本轮唯一 witness；有上游转发记录，排除缓存和 service worker |
| HTTPS 出口 | 同一真实 Chrome 访问 ipify，保留 TLS；有效出口与自建转发器的独立参考一致，并有代理隧道记录。不保存实际 IP |
| 断链 | 销毁自建上游已建立隧道并拒绝新连接；Chrome 明确报告代理路径网络错误，而公网目标在独立参考路径仍可达；超时不能作为通过 |
| 原会话恢复 | 解除封堵后，在原 Chrome PID 内用新 nonce 重试 witness **及刚才失败的 HTTPS 出口**，然后才停止浏览器 |
| 重启 | 停止后 Chrome PID/已记录子进程和 debug listener 消失；再次启动同一 profile，重新验证 witness 与 HTTPS 出口 |
| 正常回收 | Xray 最后停止后等待空闲回收；Mihomo 两次实例停止都必须在 QA app 存活时证明本代进程及 mixed/controller/已观察 UDP 端口释放，重启须捕获新代进程。最终复查全部已观察资源，兜底 kill 不计产品自然回收成功 |
| 清理 | 只删除本轮 profile，关闭 fixture listeners/sockets 与自有 QA app；检查无 QA runtime 残留且正式 executable SHA256 未变化 |

Xray 正常回收机制为 **45 秒 idle TTL + 每 15 秒收集**，不是 profile 停止就立即退出。应用启动约 2 分钟后的一次后台测速可能刷新同一 bridge 的 `LastUsedAt`，所以不能只从 profile 停止开始固定数 70 秒。

脚本使用单调时钟：基础窗口 70 秒，观察到 witness 隧道增加、新的已核验 bridge 身份或 QA 节点的非空测速完成标记变化后，重新给予 70 秒观察；**整体硬上限 150 秒**，不会无限顺延。首次后台测速尚未完成时，软窗口不提前失败，以容纳 `EnsureBridge` 已触碰、HTTP/完成写回尚未被观察到的空窗；全部 PID/端口已释放则立即通过，不强制等待两分钟。app 提前退出、读取异常、取消、硬上限后才发现释放或始终未释放都不能通过。

完成标记来自本轮私有 SQLite 的固定 `proxy_id`，只以 `sqlite3 -readonly` 读取 `last_tested_at`，不读取代理配置/凭据，也不执行用户的 SQLite 初始化文件。**失败测速也有完成标记**，它只延长观察时间，不能证明网络成功；不以数据库墙上时间计算截止。报告记录延期原因、实际耗时和软/硬上限，正常回收仍必须发生在关闭 QA app 之前。

## 报告与验收层级

报告写入被 Git 忽略的 `output/native-proxy/<run>/evidence.json`；截图只截 witness 页面，不截公网 IP 页面。目录为本轮私有路径，报告不包含代理密码、API key 或实际出口 IP。临时 HOME 也是本轮私有目录，可能保留 QA 配置和诊断，不应提交或公开上传。

报告分别记录：

- 已安装 executable SHA256、所选连接栈及固定内核文件的前后 SHA256、应用版本、实际 Chrome 版本。
- 源码 HEAD 和 dirty 状态，以及 verifier/fixture 内容 hash。
- 每项执行结果、失败原因、fixture 统计、清理错误和 witness 截图。
- `installedBuildMatchesCurrentSource=not_verified`：没有安装操作时，**不能从版本号或源码 HEAD 推断正式安装物包含当前工作区修改**。

本轮真实网络不使用生产节点；自建代理和主机可能有相同公网出口。这个结果只证明所测普通 SOCKS5 → Xray → 实际 Chrome 的 HTTP(S) 路径与生命周期，不证明住宅出口、全部协议、DNS/UDP/WebRTC 防泄漏、浏览器指纹保护或 Tor Browser 等级的匿名能力。

`go test`、race、Linux/Windows 交叉编译、mock 浏览器页面、真实代理下载、此处原生 Chrome 验收必须分别报告。没有实际运行对应层级时保留“未验证”，不把 SKIP、构建成功或后端页面请求探测写成真实 Chrome 成功。

## 与下载器收尾的关系

当前下载器工作区修复由独立的 Go 回归验证：官方 GitHub release/资产/摘要与大小校验、私有暂存、本机版本识别、落盘及配置失败回滚、按目标系统/架构发现内核；预检测试夹具不再硬编码 macOS arm64，Windows 使用对应 `.exe` 文件名。

真实 Mihomo 下载的 opt-in 测试与下方历史 Xray 浏览器验收不是同一次协议链路。上一阶段未生成新安装物，也未建立 Mihomo 固定 manifest；接续阶段的已核验固定资产、脚本与尚未完成的生命周期/安装验收见文末，不能用历史 Xray 报告替代 Mihomo 结果。

## 上一阶段实际执行记录（Xray）

本节保留上一阶段实际执行，不复用交接中的更早原生结论，也不证明接续阶段的新代码。**上一阶段最终 verifier 快照**的两次原生报告开始时间分别为 `2026-09-07T22:24:21.281Z`（后台交叠）与 `2026-09-07T22:36:41.809Z`（主动中断），均为 UTC。安装物为 `1.5.0`，实际 Chrome 版本为 `152.0.7977.76`；源码是 `e90e35d` 加本轮工作区修改，**没有重新安装，安装物与当前源码的对应关系仍未验证**。

| 层级 | 实际结果 | 不代表什么 |
| --- | --- | --- |
| Go 全量 | 290 个顶层测试、109 个子测试通过；2 个明确 SKIP；7 个测试包通过 | SKIP 不是公网或 Tor 验证通过 |
| Go race 四包 | 250 个顶层测试、109 个子测试通过；同样 2 个 SKIP | 不是任意调度下绝无并发问题 |
| 预检夹具可移植性 | 本机针对性用例通过；Linux/amd64、Windows/amd64 测试包交叉编译通过 | 未在 Linux/Windows 实际运行 |
| Node 离线护栏 | fixture 与 runner 合计 **80 项通过**，0 失败、0 SKIP、0 取消 | 仅本地夹具及 mock，不是公网与原生成功 |
| Mihomo 官方下载 opt-in | `v1.19.27` 官方资产下载、摘要/大小、本机版本检查、临时落盘和 Mihomo 预检通过 | 未在 Mihomo 路径启动 Chrome；不是独立签名或固定 manifest 验证 |
| 普通代理真实 Chrome＋后台交叠 | **20 项通过、0 清理错误**；涵盖断链、原进程 HTTPS 恢复、同 profile 重启及后台测速后的正常回收 | 自建本地认证上游，不是生产节点或所有协议验收 |
| 最终快照主动中断 | 在真实 Chrome witness 通过后仅向自有 runner 发 SIGINT；原生 run 保持 **`failed`、退出码 1、9 PASS / 1 FAIL**；4 项清理检查通过、0 清理错误 | 这是中断清理反例通过，不能合并成正常链路全部成功 |

Go 两个 SKIP 分别是 `TestProxyCoreMihomoOfficialNetworkInstall` 和 `TestTorManagerRealBinary`。Mihomo opt-in 是表中单独执行的真实下载测试，不是把普通全量中的 SKIP 改算成功。最终两次原生执行均未读写生产数据，未安装或替换应用，未提交或推送。

### 最终快照的关键证据

- 从 QA 代理池绑定认证 SOCKS5 节点，Chrome 使用由该 QA 应用持有的 Xray bridge，而非直接连接上游。
- witness 验证实际 Chrome 的主文档响应、DOM、唯一标记和 nonce；HTTPS 出口在 Chrome 内通过，保留正常 TLS 校验，未记录实际 IP。
- 封堵上游后 Chrome 返回 `net::ERR_CONNECTION_CLOSED`；同期独立参考目标可达，且夹具确实拒绝了 CONNECT。解除封堵后，同一个 Chrome PID 的 witness 和 HTTPS 均恢复。
- 停止后重新启动同一 profile，再次验证 witness 和 HTTPS。交叠模式把最后停止延到 QA app 启动后 **90,154ms**；当时首次后台测速尚未完成，原重启后 Chrome 仍在运行。
- 最后停止后的 **29,828ms** 观察到 `witness_traffic` 和 `background_speed_completed`，只据此延长观察窗口；最终 Xray 在 **89,840ms** 时自然释放，确实跨过旧 70 秒误报点，仍在整体 150 秒硬上限内。正常回收发生在关闭 QA app 之前，未触发紧急 runtime 清理。
- SIGINT 在真实 witness 成功后发给本次 supervisor 创建的唯一 runner PID。未完成的 HTTPS 检查保留 `request_cancelled` 失败，不把清理成功改写为检测成功。
- 两次运行均在清理后独立复查报告记录的 app / Chrome / Xray PID 及 API / CDP / bridge 端口：没有残留，正式 executable hash 未变，报告权限为 `0600`、目录为 `0700`，且证据被 Git 忽略。fixture listener 检查在 runner 内执行，两次结束时活动连接均为 0。

新增离线反例覆盖：只有失败测速完成写回、完成标记晚于旧软截止、无后台活动提前释放、持续活动仍达到硬截止、慢读取跨过硬截止、取消、读取错误及非法状态。SQLite 时间标记拒绝月份天数/闰年/时分秒溢出，不借助 `Date.parse` 的自动归一化放宽输入。

### 当前保留的本地证据

最终快照：

- 原生后台交叠：`output/native-proxy/latitude-native-qa-proxy-I85yVN/evidence.json`、`postflight.json` 及三张 witness 截图。
- 主动中断：`output/native-proxy/latitude-native-qa-proxy-nWD9fR/evidence.json`、`interruption-check.json`、`interruption-run.log`、`postflight.json`。其中 `evidence.json.status=failed` 是必须保留的预期结果；postflight 通过只说明清理复查通过。
- 80 项离线测试：`/tmp/latitude-native-proxy-offline-final.2HglPz/` 的 `command.txt`、`tests.tap`、`exit.txt`、`source.sha256`。
- Go 全量 / race：`/tmp/latitude-final-six-82oEm5/` 的原始 JSONL、命令、退出码、`summary.json` 和 `postflight.json`。运行前后六个 Go 文件与隔离副本 hash 一致，74 个 `frontend/dist` 文件未改变；之后仅修改原生 QA 脚本、离线测试和本文档，六个 Go 文件保持相同快照。
- 跨目标预检夹具：`/tmp/latitude-preflight-portability.vY1pfg/`。
- 官方 Mihomo 下载：`/tmp/latitude-proxy-core-final.UjgDzK/official-network.log`，选中 `mihomo-darwin-arm64-go120-v1.19.27.gz`，19,012,185 bytes，SHA256 `ae9218e0bd93258b2722bc95929e1ccf62aadc5aeb35db60d718d1dd0df6e731`。

最终两次原生及 80 项离线测试使用的 verifier SHA256 为 `8ee10c5c6ab3cac790d17c2d5c9a15c0ab31cabaeeb3ccc1a502322142cc4583`，fixture SHA256 为 `2f5fdebb7021774630e861dc411a75aa71bf93a947a6b4f53b0a67d16441fb12`。正式 executable 运行前后 SHA256 均为 `b455ff98fb5190da36e6e2d51cee220c12cb9d4fa43643cab7d49fb06c6dafa3`。

此前快照也保留，但不替代最终快照证据：

- `output/native-proxy/latitude-native-qa-proxy-M6k6Lu/`：普通模式 19 项通过、0 清理错误；正常 idle 回收 60,068ms。
- `output/native-proxy/latitude-native-qa-proxy-Myx02B/`：此前主动中断，预期失败且清理无错误。
- `/tmp/latitude-native-proxy-offline.77NaRB/`：此前 55 项离线测试。上述三个批次对应旧 verifier `5f70c1c23306835b98c855ac62aac3c34bec49e0decde495473b9844c124adab`，不能用来证明后来补充的交叠规则。

这些是当前存在的本地报告，不是永久备份保证；尤其 `/tmp` 可能被系统清理。重新运行会生成新的隔离目录和报告，不能继续沿用本节随机目录名来证明新代码。

复验取消流程时，用上述 `--run` 命令启动，并在 `PASS network.unique-upstream-witness` 后对**本次脚本进程**发送 Ctrl+C / SIGINT。期望非零退出、`interrupted=true`、`status=failed` 和清理错误为 0；不要通过应用名称批量发送信号。SIGKILL、系统断电，以及 Chrome 根在两个采集周期之间消失而留下不可识别 helper，不在这次中断实测覆盖内。


## 接续阶段状态（2026-09-07T23:30:45Z，UTC）

**尚未完成当前源码 → 正式安装 → Mihomo 真实 Chrome 的闭环。正式安装物仍未替换。** 已完成的准备和阻止安装的问题分列如下：

| 项目 | 当前证据 | 边界 |
| --- | --- | --- |
| 固定 Mihomo runtime | 官方 `v1.19.27` Darwin arm64 go120 资产的大小、SHA256、tag commit、完整 GPL 已核验；源二进制可执行且 `-v` 成功，sources/manifest 已记录真实 hash | 不是独立发行者签名、公证、可复现构建或公开分发许可审查 |
| 同步工具 | 单文件 gzip 支持；归档校验后完整解压到同目录临时文件，CRC/写入/fsync/chmod 成功后才原子替换；15 项离线测试通过 | 原子性限单个 runtime，不是整个批次与 manifest 的跨文件事务 |
| 双栈原生 runner | 显式 Mihomo 选择、固定内核及 QA 配置、不可变进程身份、双端口/UDP、两次自然停止与新代重启的护栏已加入；fixture+runner 103 项离线通过，0 SKIP | 尚未在 Mihomo 上执行真实 Chrome；原 80 项测试完整保留 |
| 前端构建 | 独立源码快照中 npm ci/build 通过，2655 modules；74 个 dist 文件与工作区逐字节一致 | 未重新设计 UI；已知 Browserslist 和 Wails 混合导入提示仍在 |
| Mihomo 生命周期 | 隔离 RED 运行复现下列 6 个失败，均为行为断言失败而非编译错误 | 修复未落主工作区，不能将 RED 或新脚本通过视为产品问题已解决 |
| 安装与原生验收 | 已准备私有候选构建目录及可回退安装方案 | 未构建后端新安装候选、未替换正式 app、未启动本阶段原生 run |

生命周期反例：

1. 最后一个实例引用释放时，仍在读取的 HTTP body 被打断。
2. HTTP 完成后的零引用 Mihomo 未回收。
3. 预先构造的 client 在实例停止后继续使用已关闭的旧端口。
4. StopAll 返回后，新的 Ensure 仍可启动内核。
5. StopAll 与启动并发时存在未登记进程仍监听、随后晚注册的窗口。
6. 已超过 45 秒空闲期的 warmup，经过完整 15 秒收集窗口仍未回收。

拟采用按请求/响应 body 生命周期持有的代际租约、45 秒/15 秒空闲回收、启动登记屏障及显式恢复。**不能仅在维护成功末尾 Resume**：备份包解压/校验失败，以及初始化保存配置或清理表失败，都会提前返回。需要在备份导入/初始化两个最外层事务补充结束钩子；嵌套 reset 不自行恢复。当前已申请将该修复范围从 5 个文件扩为 7 个，在确认前暂停此修复和正式安装，不靠静默恢复或放宽验收绕过。

接续阶段冻结 runner SHA256：`fe68d1c8332a1f9f544f834e111f43d120a42c5f0773e291790600feb503dec7`。源 Mihomo（本地签名前）SHA256：`f2e623e762c5c852e07966c6396afc2d942164e78b766485df8c7de3643a84be`；归档、源码及许可证出处见 `third_party/NOTICE.md`。

本阶段离线原始报告、生命周期 RED、runtime pin 与前端构建证据已另存至：

`.local-backup/latitude-install-20260908-071140.noindex/evidence/readiness-before-lifecycle-scope/`

其中 `summary.json` 记录每份证据 SHA256。此目录目前是开发证据备份，**尚无正式应用回退副本，也不是生产数据备份**。正式 executable 仍为前述 `b455ff98...`，本阶段未读写生产数据、未关闭用户 Chrome、未提交或推送。

## 2026-09-10 审计修复后的回收契约

Mihomo 已改为 45 秒空闲 TTL、15 秒 GC 周期，HTTP body 和实例各持有租约。原生 runner 的 Mihomo 等待上限同步为 150 秒固定硬上限，以容纳后台测速；没有延长产品 TTL，也没有移除进程身份、app 存活、TCP/UDP/controller 全部释放、自然回收及新代重启断言。上文旧版即时释放与未修复状态保留为历史证据，当前安装验证以审计闭环报告为准。
