# T14 安全与健壮性审查

审查日期：2026-10-03

## 范围与方法

审查了 `apps/server` 的鉴权、配对、限流、上传与 ZIP、静态资源、备份恢复、TTS、远程插件，以及 `apps/player`、`apps/admin`、`packages/activities` 的插件加载、预览、token 存储、web/video 活动和消息通信。

验证方式：

- 静态阅读源码、API 契约、架构文档、播放器/后台/插件契约。
- 临时数据目录启动服务 `127.0.0.1:4410`，完成初始化、配对、设备切换、伪造学习记录、远程插件登记和内容包停用测试。
- 构造 ZIP、恶意 SVG、路径穿越条目，并验证响应。
- 所有临时服务已关闭。

## Findings

### H-01：远程插件清单拉取存在 SSRF

- 严重度：高
- 位置：`apps/server/src/plugins/registry.ts:24-30,190-245`；`apps/server/src/routes/plugins.ts:18-23`
- 问题：`httpUrl` 只检查 HTTP(S) 和账号密码，没有拒绝回环地址、私网地址、链路本地地址、云 metadata 地址或解析后的内网 IP。重定向也只重复检查协议，未做目标地址安全校验。管理员调用远程插件接口后，服务端会主动访问该地址。
- 可复现步骤：
  1. 在 `127.0.0.1:4499` 启动一个返回合法 `plugin.json` 的临时 HTTP 服务。
  2. 管理员请求 `POST /api/plugins/remote`，提交 `{"manifestUrl":"http://127.0.0.1:4499/plugin.json"}`。
  3. API 返回 `201`，临时服务记录到 `GET /plugin.json`。
- 建议修复：服务端解析域名后拒绝 loopback、RFC1918、IPv6 私网/链路本地、回环、保留地址和云 metadata 地址；重定向逐跳重复检查；使用固定解析地址连接，防止 DNS rebinding；优先只允许 HTTPS 和显式域名白名单。远程 `entry` 也应做同等限制，并增加内容签名或 hash pinning。

状态：已修复（远程清单与 entry 校验全部 DNS 结果；拒绝回环、链路本地、云元数据与保留地址，按 T18 允许局域网/HTTPS 公网而拒绝公网 HTTP；固定已校验 IP 连接、逐跳复查并限制超时和大小）——T18

### H-02：第三方插件在播放端同源执行，权限声明不是隔离

- 严重度：高
- 位置：`apps/player/src/host/registry.ts:87-116`
- 问题：启用的插件通过动态 `import()` 直接在播放端主页面执行。插件可以读取 DOM、读取 `localStorage` 中的设备 token、调用家庭 API、访问网络并向外发送数据；`permissions` 只展示给家长，没有运行时能力隔离。远程入口对应的 JavaScript 也没有签名或内容固定。
- 可复现步骤：
  1. 安装/登记一个导出合法活动的插件。
  2. 在其 `mount` 或模块顶层读取 `localStorage.getItem('sprout.deviceToken')`，或调用 `fetch`。
  3. 播放端加载插件时即可执行这些操作，不需要额外权限确认。
- 建议修复：将第三方活动放入独立 origin 的 sandbox iframe，通过严格的 `postMessage` 能力接口通信；不要把宿主 token 或任意 DOM/网络能力暴露给插件。安装包应签名并校验 hash，远程插件默认关闭自动更新，权限应有实际能力开关。

状态：已缓解（服务端已返回权限、来源、entryUrl 与远程 manifestUrl；第三方插件仍同源执行，仅可信来源可接受。后台确认和播放端加载/CSP 约束需 T21/T22 接入，本任务未实现运行时隔离）——T18

状态：已缓解（后台安装/启用前展示声明的权限、清单来源与入口 URL，提示同源风险并要求勾选确认；启用前复核清单，安装返回声明变化时请求停用并显示失败警告；尚未实现运行时隔离或远程代码内容固定）——T21

状态：已缓解（播放端在求值前追加 CSP，跨源脚本仅放行已启用登记的 entryUrl；拒绝危险协议、凭据与入口替换，预检不跟随重定向；生产运行期禁用内联脚本与 eval。ESM 仍同源执行，未实现能力隔离、代码签名或内容固定，连接保留 HTTP(S) 以支持独立 H5 来源检查）——T22

### H-03：管理员预览 token 放在 URL fragment，且生产预览与后台同源

- 严重度：高
- 位置：`apps/admin/src/lib/preview.ts:1-4`；`apps/admin/src/components/Preview.tsx:19-23,84-87`；`apps/player/src/pages/Preview.tsx:19-20,75-81`
- 问题：后台从 `localStorage` 读取管理员 token 后拼进 HashRouter 的 `#/preview/...?...token=...` fragment。token 会进入浏览器历史、复制链接、截图或其他 URL 分享/采集链路。生产环境下预览 iframe 与后台使用同一 origin，并设置 `allow-scripts allow-same-origin`；在此上下文中，预览页面及其插件代码可读取 URL token，并可能接触父页面 DOM/存储。
- 可复现步骤：
  1. 调用 `previewUrl` 时传入任意 token，返回地址的 fragment 路由参数中直接包含 `token=<token>`。
  2. 预览页面再用该值请求 `/api/plugins`，证明 token 会被带入 API 请求。
  3. 若预览加载了同源第三方插件，该插件可读取 `location.hash`。
- 建议修复：改为一次性、短时、只读的预览 token，通过父子窗口握手后的 `postMessage` 或后端短链下发，不放入 URL；预览使用独立 origin；草稿预览默认不加载第三方插件。若必须 iframe，去掉 `allow-same-origin` 或使用真正独立的来源，并配置 `CSP frame-ancestors`。

状态：已缓解（服务端完成十分钟 scope=preview 令牌及 GET 白名单，不能读取家庭管理数据或调用写接口；后台/播放端替换 URL 管理员令牌与预览同源风险不在 T18 所有权内，需 T21/T22 接入）——T18

状态：已缓解（后台先 POST /api/preview/token，再仅通过 previewToken 打开预览，不回退到管理员凭据；过期卸载 iframe，草稿消息只发给确定的播放端 origin；预览仍使用短期 URL 凭据和同源 iframe）——T21

状态：已缓解（播放端仅消费 previewToken，拒绝旧 token 参数并从当前 URL 移除凭据；预览数据源只读且仅用内存，不读取设备凭据或保存记录。短期凭据首次仍经 iframe URL 传入，父页 iframe.src 与同源预览风险未完全消除）——T22

### H-04：网页活动重定向后未校验最终 origin

- 严重度：高
- 位置：`packages/activities/src/activities/web.tsx:14-20,88-91`
- 问题：活动只检查初始 URL 不得与宿主同源，没有控制或验证重定向后的最终 origin；iframe 同时启用 `allow-scripts allow-same-origin`。外部页面可先重定向到播放端 origin，最终文档可能获得与宿主相同的 origin。
- 可复现步骤：
  1. 将课程 `web.url` 指向一个外部 HTTPS 地址。
  2. 让该地址返回 302，目标为播放端 origin。
  3. 当前代码不会重新检查最终 URL；若最终页面脚本执行，它可能尝试访问同源父窗口。
- 建议修复：网页活动使用不带 `allow-same-origin` 的 opaque sandbox，并通过 nonce 消息桥接；或由服务端解析并校验最终 URL，拒绝任何重定向到宿主 origin。完成消息仍应使用一次性 nonce，而不只依赖 origin。

状态：已缓解（独立 HTTP(S) 地址先以 CORS HEAD 校验最终 origin，拒绝重定向；iframe 使用 allow-scripts opaque sandbox 和 no-referrer，完成事件必须满足 null origin、当前 contentWindow 和本次 128 位随机 nonce，恢复/重试轮换 nonce。浏览器不能读取跨源 iframe 的实际最终 URL，预检与导航之间的响应变化仍由 opaque sandbox 隔离保护宿主）——T22

### H-05：设备 token 可绕过服务端家长门切换到任意孩子

- 严重度：高
- 位置：`apps/server/src/routes/devices.ts:88-100`；`apps/server/src/auth.ts:66-70`
- 问题：设备 bootstrap 会返回所有孩子的基本资料；`PUT /api/device/child` 只要求 device token，没有服务端家长批准或一次性授权。播放端的家长门是客户端 UI 约束，不能保护直接调用 API 的设备、被插件控制的播放端或泄露 token 的调用者。
- 可复现步骤：
  1. 配对设备并绑定孩子 A。
  2. 使用同一个 device token 调用 `PUT /api/device/child` 绑定孩子 B。
  3. 随后调用 `GET /api/children/<孩子B>`，返回 `200`。
- 建议修复：设备 token 默认只绑定一个孩子；切换孩子需要管理员/家长门生成的一次性短时 capability token，服务端校验后才允许变更绑定。bootstrap 只返回当前孩子及最少的未绑定选择信息，避免一次暴露全量家庭档案。

状态：已缓解（允许孩子列表持久化并校验；按契约默认 null=家庭全部孩子，管理员可收紧为数组，childId 仅表示当前孩子；配对支持显式列表，PUT 省略列表保持原值，删除孩子不改变 null；v1/v2 无法区分列表来源，升级 v3 时一次性统一恢复 NULL，原限制需重新保存，后续重启保留管理员设置）——T18

状态：已修复（后台部分：设备页可勾选允许孩子，明确区分 null=全部与空数组=无授权；绑定孩子须在范围内，并通过 PUT 保存 allowedChildIds；配对成功后范围保存失败可重试同一设备，不重复配对）——T21

### H-06：学习记录完全信任客户端时长，可伪造屏幕时间和统计

- 严重度：中
- 位置：`apps/server/src/routes/sessions.ts:9-40`；`packages/core/src/audience.ts:5-18`
- 问题：服务端只校验 `durationSec <= 7200`，不要求课程存在，不校验时长是否符合孩子当前单次上限，也不校验开始时间与当前时间的合理偏差。device token 持有者可以伪造未知课程、任意时长和 `clientId`，直接消耗每日配额或污染学习记录。
- 可复现步骤：
  1. 取得设备 token 后提交不存在的 `lessonId`。
  2. `durationSec` 设置为 `7200`，`clientId` 使用新值。
  3. API 返回 `201`，随后 `GET /api/children/<id>/screen` 的 `usedSec` 变为 `7200`。
- 建议修复：服务端为新记录校验启用课程并从课程索引推导 `audience`；按年龄和生效策略限制单次/每日可计入时长；限制开始时间的未来/历史偏差和单设备写入频率。更强的方案是服务端签发课程开始凭据，结束时只接受该凭据对应的 session。

状态：已缓解（durationSec 截断到起止时间差+5 秒及生效单次上限两倍，并持久化 server:duration-clamped 审计事件；客户端时间、显式 audience 与未知课的兼容行为仍保留，未签发真实观看凭据）——T18

### M-01：停用内容包/插件后静态文件仍可访问，且允许同源 HTML/JS

- 严重度：中
- 位置：`apps/server/src/static.ts:60-70`
- 问题：`/packs/:id/*` 只判断包存在，不判断 `pack.info.enabled`；本地插件目录也没有在静态路由中检查启用状态。内容包和插件 ZIP 可包含任意普通文件，HTML/JS 会按静态资源类型从主 origin 提供。
- 可复现步骤：
  1. 导入含 `assets/secret.html` 的内容包，访问该文件返回 `200`。
  2. 调用 `PUT /api/packs/<id>` 设置 `enabled:false`。
  3. 课程接口返回 `404`，但同一个静态文件仍返回 `200`。
- 建议修复：静态路由同时检查 enabled 状态；内容包只允许图片、音视频、JSON、字体等白名单类型，拒绝或以附件方式提供 HTML/JS；若必须支持网页资源，放到独立 origin 并设置 sandbox/CSP。

状态：已修复（停用包/本地插件的 GET、HEAD 和条件缓存请求均返回 404；包内 HTML/JS 等主动类型以 text/plain 附件提供并设置 nosniff/CSP，插件目录保留 ESM；已下载或运行的客户端内容无法远程收回）——T18

### M-02：默认明文 HTTP、监听所有接口，CORS 允许任意来源

- 严重度：中（家庭局域网）；若暴露到公网则为高
- 位置：`apps/server/src/config.ts:36-40`；`apps/server/src/app.ts:26-33,64-71`
- 问题：默认 `HOST=0.0.0.0`，服务通过普通 HTTP 提供管理员/设备 Bearer token，且 CORS 为 `origin: '*'`。CORS 不是无 token 的认证绕过，但 token 一旦因预览、插件、日志或网络窃听泄露，任意网站都能跨源读取 API；明文局域网还允许旁路监听和篡改。
- 可复现步骤：对 `/api/children` 发送预检请求，响应的 `Access-Control-Allow-Origin` 为 `*`。
- 建议修复：默认只绑定显式配置的家庭网卡或回环地址；支持 HTTPS/反向代理并在部署说明中强制使用；CORS 只允许实际后台、播放端和 Capacitor origin，拒绝任意来源。

状态：已缓解（CORS 限于局域网私有地址、localhost/回环及 Capacitor，支持 SPROUT_CORS_ORIGINS 精确覆盖；默认 0.0.0.0 与明文 HTTP 保留，启动日志和 server.md 明确警告风险，跨网络仍需 HTTPS 反向代理）——T18

### M-03：限流覆盖不完整，存在配对队列和 CPU/任务资源耗尽风险

- 严重度：中
- 位置：`apps/server/src/routes/devices.ts:15-31`；`apps/server/src/routes/auth.ts:31-50`；`apps/server/src/routes/settings.ts:27-29`；`apps/server/src/tts/index.ts:36-46`
- 问题：未认证的 `/api/pair/start` 只有全局 1000 个 pending 上限，没有按 IP 限流；登录失败在锁定前会执行 scrypt，未限制并发；TTS 入口和远程插件/ZIP 操作没有统一的 IP/管理员任务配额。家庭小主机上可被大量请求占满 SQLite、CPU、子进程或磁盘队列。
- 建议修复：为配对、登录、TTS、远程插件和上传增加按 IP/设备/管理员的 token bucket；限制并发 scrypt 和 TTS worker；配对码过期记录及时清理；对管理员高成本任务设置队列长度、总字节和每日配额。当前配对批准接口需要 admin token，因此未发现“未认证直接爆破六位配对码”的路径，主要风险是配对请求 DoS。

状态：已缓解（配对、密码、上传、导入/恢复、远程插件、TTS 在读请求体前按真实 IP/家庭管理员配额限流并限制并发；过期配对码及时清理，限流索引有界，TTS 单 worker/最多 32 个待处理任务；429 附 Retry-After，断连不提前释放运行中的任务）——T18

### M-04：管理员和设备 token 明文保存在 Web Storage，远程 session key 还残留 token

- 严重度：中
- 位置：`apps/admin/src/lib/api.ts:3,13-25`；`apps/player/src/data/connection.ts:36-68`；`apps/player/src/data/remote.ts:63-70`
- 问题：管理员 token 和 device token 分别保存在 `localStorage`。任何同源 XSS、同源第三方插件或被注入的预览代码都可以直接读取；设备 token 还长期保留，直到服务端吊销。远程待上传历史的 key `sprout.remote:<server+token>` 还把 token 写入 Web Storage 的键名，切换连接时不会由 `clearConnection()` 清除 `sprout.remote:*`。
- 建议修复：后台优先改为 HttpOnly、Secure、SameSite cookie 并配套 CSRF 防护；浏览器播放端使用内存/会话级凭据，Capacitor 使用平台安全存储；使用随机设备身份而不是 token 作为本地队列 key，切换/注销时清理旧身份数据；缩短有效期、轮换 token，并按用途拆分 scope。此项应与 H-02、H-03 一起修复，单独更换存储位置不能解决同源任意代码执行。

状态：已缓解（后台默认将管理员 token 存 sessionStorage，仅明确勾选“在此设备保持登录”才持久化；旧凭据迁入会话，退出/401 清除两类存储；同源 JavaScript 仍能读取凭据，播放端存储不在 T21 所有权内）——T21

状态：已缓解（远程队列键改为 server+token 的 SHA-256 身份摘要，迁移所有可识别旧身份时先保留队列再移除可反解 token 的旧键，不借用当前凭据上传其它身份；切换/清除连接删除旧身份队列与旧格式键。设备凭据为电视持久配对仍在 localStorage，已在播放端所有权内补充存储说明，未实现平台安全存储或同源插件隔离）——T22

### M-05：视频、海报、字幕和预加载资源允许任意外部地址

- 严重度：中
- 位置：`packages/schema/src/activities.ts:276-283`；`packages/activities/src/shared.tsx:20-40`；`apps/player/src/host/resources.ts:72-110`；`packages/activities/src/activities/video.tsx:138-160`
- 问题：视频相关资源可引用任意 HTTP(S) 地址；课程开始前的通用预加载会对这些地址发起 `fetch()` 并完整读取 `arrayBuffer()`，没有响应大小上限。外部 H5 还可把追踪参数放入 URL query/hash。
- 可复现步骤：
  1. 在课程 video props 中填入外部 `src` 或 `poster`。
  2. 进入课程开始阶段，`preloadLesson` 会请求该地址并读取响应体。
  3. 恶意内容可借此向任意外部站点发起带 URL 参数的请求，或消耗播放端带宽/内存。
- 建议修复：默认只允许内容包相对路径；外部媒体使用 HTTPS origin 白名单，预加载改为不读完整响应或设置 Content-Length/流式字节上限，并使用 `no-referrer`。

状态：已修复（资源解析、video/poster/captions 写 DOM 和插件预加载均限制包内路径或已配置服务器同源地址，拒绝外站、协议相对地址与重复编码穿越；预加载不带凭据/referrer、不跟随跳转，限制并发、资源数、整体八秒、单资源 2 MiB 与累计 8 MiB，不再无界读取 arrayBuffer）——T22

### M-06：排序活动的颜色字段可注入任意 CSS token

- 严重度：低
- 位置：`packages/schema/src/activities.ts:163`；`packages/activities/src/activities/sort.tsx:75-80`；`packages/activities/src/styles.css:82`
- 问题：`bin.color` 没有颜色格式校验，直接写入 `--spa-bin-color`，随后参与 `background` 和 `color-mix`。恶意内容可以构造 `url(...)` 等 CSS 值，引发外部资源请求；目前未发现可直接执行脚本的路径。
- 建议修复：schema 只允许十六进制、RGB/HSL 等明确颜色格式，拒绝 `url()`、分号、括号嵌套和未知 CSS token。

状态：已修复（不改共享 schema 契约，在 sort 写样式前仅接受 hex、范围合法的 rgb/rgba 和具名颜色白名单，拒绝 url/var/分号及其它 CSS token；非法颜色回退宿主强调色，已有内容仍可运行）——T22

### L-01：预览消息信任范围被 `document.referrer` 动态扩大

- 严重度：低
- 位置：`apps/player/src/pages/Preview.tsx:48-55`
- 问题：除预期 server/player origin 外，还把任意 `document.referrer` origin 加入允许集合。恶意网页嵌入预览 URL 后，可从自身 origin 发送合法格式的 `sprout:preview` 消息，注入任意合法课程草稿。
- 建议修复：只接受显式配置的后台 origin，并增加一次性 nonce；不要把 referrer 当作信任来源。

状态：已修复（预览消息仅接收实际父窗口和明确后台 origin；server 参数只接受当前来源、已配对完整基址、明确后台或约定开发端口，不能自行授予信任或指向同源包内伪造 API；独立部署可用 VITE_SPROUT_ADMIN_ORIGIN 配置，不再根据 referrer 扩大来源。保留现有后台草稿消息契约，未额外引入双方未约定的预览 nonce）——T22

## 已验证的现有防护

- ZIP 已限制压缩体积、解压体积、单文件大小、条目数，并拒绝路径穿越、大小写冲突、目录/文件冲突、符号链接和特殊文件；恶意 `../escaped.txt` 测试被拒绝。
- 静态路径会做多层 URL 解码和真实路径校验；符号链接越界读取被拒绝。
- 上传 SVG 会拒绝 `script`、`foreignObject`、事件属性、外链、`style`、动画、`use` 等主动内容；合法 SVG 可访问。
- TTS 使用 `execFile`、`shell:false`、参数数组和临时文本文件，没有把用户文本拼入 shell 命令；voice 也必须来自系统探测结果。
- `packages/activities/src/activities/web.tsx:29-39` 同时校验 iframe `event.source`、精确 `event.origin` 和消息类型；同源 web URL 被拒绝，当前没有发现 postMessage 伪造完成的绕过。
- 打印页的 `dangerouslySetInnerHTML` 只接收 `contrastSvg` 生成的固定图案；pattern/palette 来自 schema 白名单，未发现可控 HTML 注入。
- SQL 查询使用参数绑定，当前未发现 SQL 注入路径。

## 家庭局域网部署整体风险与优先级

在可信家庭网络、没有公网暴露、只安装自有插件的前提下，基础 API 和 ZIP/媒体处理的防护较完整；主要风险集中在“管理员主动登记远程插件”以及“设备 token/预览页面被同源代码取得”后的横向影响。家庭局域网并不等于安全边界，明文 HTTP 仍会暴露 Bearer token。

优先级：

1. **P0**：修复 H-01 SSRF；隔离 H-02 插件执行环境；移除 H-03 URL token；为 H-04 设备换绑和 H-05 session 上报增加服务端授权与约束。
2. **P1**：修复 M-01 停用静态资源泄露；配置 HTTPS/可信 CORS；补齐 M-03 限流和高成本任务配额。
3. **P2**：迁移 M-04 token 存储，增加 CSP、短期 token、轮换和审计日志。

不建议将服务直接端口映射到公网；在完成 P0/P1 前，远程插件只应使用经过人工审查的本地 ZIP，且家庭服务器应放在可信、隔离的局域网内。
