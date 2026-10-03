# Sprout 服务端

服务端为家庭局域网使用的 Fastify 5 + Node 22 `node:sqlite` 服务。工作区数据契约保持不变；实现目录为 `apps/server/`，排课和屏幕统计为 `packages/core/`。

## 运行

从仓库根运行，Node 版本至少 22.13（当前验证环境为 22.22.2）：

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/server dev
pnpm --filter @sprout/server build
pnpm --filter @sprout/server start
```

默认监听 `0.0.0.0:4310`。播放端为 `/`，后台为 `/admin/`，Swagger 为 `/api/docs/`（`/api/docs` 重定向），OpenAPI JSON 为 `/api/docs/json`，内容表单契约为 `/api/schemas`。

首次通过 `POST /api/setup` 设置至少六位管理员密码，可同时创建孩子。管理员 token 有效期 30 天，设备通过十分钟配对码批准后获得 device token。批准后的设备 token 在第一次轮询时仅返回一次，丢失后重新配对；移除设备立即吊销。密码用随机 salt + scrypt，令牌只保存 SHA-256 哈希，同 IP 连续五次登录失败锁五分钟。

服务没有外部统计、广告或推送。默认仍是**明文 HTTP + 所有网卡监听**，启动日志会提示风险：家庭局域网不是安全边界，旁路监听或篡改可能泄露 Bearer token。不要做公网端口映射；跨网络使用必须通过 HTTPS 反向代理，防火墙仅开放家庭网段。仅需本机使用时设置 `HOST=127.0.0.1`。CORS 不是认证或网络隔离。

默认 CORS 仅接受 HTTP(S) 的 localhost、IPv4 回环、RFC1918 私网地址和 IPv6 回环/ULA，以及 Capacitor 来源；不接受任意公网域名、链路本地地址或 `null` 来源。mDNS/自定义域名需显式配置。`SPROUT_CORS_ORIGINS` 是逗号分隔的**精确覆盖列表**，不支持 `*`，空字符串关闭跨源允许；设置后需自行列出后台、播放端及 Capacitor 来源，例如 `http://192.168.1.20:5311,http://192.168.1.20:5310,capacitor://localhost`。

## 配置

仓库根通过向上查找 `pnpm-workspace.yaml` 定位，不依赖启动时的工作目录。相对路径均相对仓库根。

| 环境变量 | 默认值 |
| --- | --- |
| `PORT` | `4310` |
| `HOST` | `0.0.0.0` |
| `SPROUT_CORS_ORIGINS` | 未设置时使用上述局域网/localhost/Capacitor 白名单；设置后精确覆盖 |
| `SPROUT_DATA_DIR` | `<root>/data` |
| `SPROUT_CONTENT_DIRS` | `<root>/content/packs`，多个目录用逗号分隔；也可直接指向包目录 |
| `SPROUT_PLAYER_DIST` | `<root>/apps/player/dist` |
| `SPROUT_ADMIN_DIST` | `<root>/apps/admin/dist` |
| `SPROUT_MILESTONES` | `<root>/content/milestones/milestones.json` |

dist 不存在时返回友好提示页，已有 dist 支持 SPA 回退；未知 `/api` 和缺失的 JS 等资源不会回退为页面。里程碑文件缺失或无效时返回空条目与非诊断免责声明，不补造内容。

测试可调用 `buildApp(config)` 并使用 `app.inject`，配置另外支持 `reloadIntervalMs`（默认 2000，0 关闭热重载）、`rootDir` 和 `logger`。

## 数据目录

```text
data/
  sprout.db                 SQLite 数据库，迁移版本见 PRAGMA user_version
  sprout.db-wal / -shm       WAL 文件，运行期间不要分离复制
  packs/<id>/               后台导入的内容包
  custom/                   sprout.custom，首次启动自动创建
    pack.json / lexicon.json
    lessons/<id>.json
    assets/uploads/
    audio/manifest.json
    audio/tts/<lang>/
  plugins/<id>/             已安装插件
  tts/<lang>/               本机合成缓存
```

孩子 screen/plan 和学习记录的扩展字段以 JSON 存储；新 `audience`、`mode`、printables 无需破坏性数据库升级。删除孩子会级联删除 sessions 与观察记录，设备解除绑定而非删除。

文件写入用临时文件或候选目录替换。内容包以源文件加载，不信任 `bundle.json`；逐课校验，错误课不进入索引但在包 errors 和 `/validate` 中保留。两秒检测文件与依赖变化，未改变的 JSON 不重复解析。第三方 props 校验实现 JSON Schema 的 type / required / properties / items，复杂约束由插件或后续完整校验器补充，不能依赖未实现的关键字。

ZIP 限制：HTTP 上传最多 50 MiB；压缩包入口最多 4096、单个展开文件 32 MiB、总展开 128 MiB。根或唯一子目录须含 manifest；路径穿越、大小写冲突、符号链接、校验和及伪造大小均拒绝。同 id 只接受更高 semver，失败导入不覆盖已有包。媒体最多 10 MiB，检查扩展名与文件头，拒绝 SVG 主动内容。

静态包与插件路径会检查实际文件路径，阻止编码路径穿越及越界链接。SVG 显式返回 `image/svg+xml` 和受限 CSP，资源提供 ETag；普通资源缓存一天，JSON 和自定义包资源需重新验证。

## 服务端安全（T18）

- `POST /api/preview/token` 仅管理员可用，返回 `{token, expiresAt}`。令牌哈希独立存储、十分钟过期，只允许 GET 课程列表/详情、词库、包列表、插件列表、路线列表/详情、schemas 及 `/packs/*`、`/plugins/*`；家庭资料、备份、导出/校验管理接口、设备、TTS、管理页面和所有写操作均拒绝。它不是 admin/device 令牌，签发接口不接受设备令牌。
- 设备持久化 `allowedChildIds`：默认 `null` 表示家庭全部孩子，`[]` 表示没有授权，管理员可用数组收紧范围。`POST /api/pair/approve` 未传此字段时一律为 `null`，也支持显式传入列表；`childId` 只表示当前孩子，不决定允许范围，因此未绑定设备可在播放端选择孩子，多孩子家庭可切换。`PUT /api/devices/:id` 省略此字段保留原值，包括 `null` 和空数组；列表收紧后自动解除不再允许的绑定。删除孩子仅从数组列表移除其 id，`null` 保持不变。bootstrap 只返回允许的孩子，切换、读取绑定资料和上报记录都检查权限；上报仍需是当前绑定孩子。旧备份缺少此字段时默认 `null`，显式列表保持不变。
- v1/v2 数据库升级到 v3 时保留设备绑定、令牌及家庭数据，并将既有设备的允许列表统一设为 SQL `NULL`。v2 未记录列表是否由管理员显式设置，无法区分旧默认值和管理员限制，因此按契约使用此兜底策略；**升级后原有限制需管理员重新保存**。迁移仅执行一次，v3 中新保存的限制不会在重启时重置。
- 新学习记录的 `durationSec` 截断到 `min(上报值, floor(endedAt-startedAt 秒数+5), floor(生效单次上限秒数×2))`。发生截断会追加 `server:duration-clamped` 事件，包含上报值、接收值和两种上限，满 500 个事件时保留最后一个服务端审计位。离线 `clientId` 去重保持不变。时间仍来自客户端，不代表真实观看认证；未知课程与显式 audience 的兼容行为保持不变。
- 停用内容包或本地插件后，其静态文件 GET/HEAD 和条件缓存请求返回 404。内容包的 HTML/HTM/XHTML/JS/MJS/CJS 以 `text/plain` 附件提供，带 `nosniff` 和受限 CSP；插件目录仍可提供 ESM。已经进入客户端缓存或已执行的代码不能通过服务端 404 远程收回。
- 远程插件及 ZIP 中绝对远程入口仅接受无账号密码的 HTTP(S)。允许 RFC1918/ULA 局域网与 HTTPS 公网；拒绝公网 HTTP、回环、链路本地、已知云元数据、未指定/多播/保留地址。域名的全部 DNS 结果都要通过校验，实际下载使用本次已校验的固定 IP，并保留 Host、SNI 和证书验证；每个重定向及最终 entry 重复校验。总超时十秒（含 DNS/entry 校验）、清单最多 1 MiB、最多五次跳转，超时后的晚返回不会落库。
- 插件安装、启停及列表响应包含 `permissions`、`source`、`entryUrl`，远程来源附带最终 `manifestUrl`，供后台确认展示。权限声明**不是能力隔离**：第三方插件仍与播放端同源执行，仅安装信任的来源；后台确认与播放端加载/CSP 约束由对应任务接入。

### 限流与资源上限

高成本入口在读取请求体前鉴权、按真实 IP 使用 token bucket；管理员任务另共享家庭级配额，切换登录 token/IP 不能绕过家庭配额。`trustProxy=false`，不信任客户端 `X-Forwarded-For`。配额表最多 2048 个来源键，闲置一个补充周期后回收。超限返回 429 与 `Retry-After`；请求体解析失败或断连会释放未开始任务的名额，已经运行的任务等实际完成才释放。

| 入口 | 每分钟容量 | 服务端并发上限 |
| --- | --- | --- |
| 初始化、登录、改密码（共享） | 10 / IP | 2 |
| 配对开始 | 6 / IP | 8 |
| 配对轮询 | 120 / IP | 16 |
| 配对批准 | 12 / IP + 家庭管理员 | 4 |
| 媒体上传 | 20 / IP + 家庭管理员 | 2 |
| 内容包/插件 ZIP 导入、包重载/导出、备份恢复（共享） | 12 / IP + 家庭管理员 | 1 |
| 远程插件登记 | 12 / IP + 家庭管理员 | 2 |
| TTS 生成/状态（共享） | 30 / IP + 家庭管理员 | 2 |
| 预览令牌签发 | 20 / IP + 家庭管理员 | 4 |

容量从满额开始，在一分钟内均匀补充，不是固定整分钟窗口。小型高成本 JSON 请求体最多 16 KiB；上传/导入保留既有字节上限。配对开始时立即清理过期配对码，并保留全局 pending 上限。TTS 合成仍只有一个 worker，待处理（含运行中）最多 32 个不同任务；背景补音频也是同一队列，队列满时保留播放端既有朗读回退。

## 模式与计时

`resolveChildMode(stage, child, ageMonths)`：
- 未满 18 月龄始终 `parent-only`，手动 co-view 也无效。
- 18 月龄及以上的显式 `parent-only` / `co-view` 优先。
- auto 或缺省跟随阶段：`none` / `optional` 默认家长指引，`default` 或缺省默认共看。

新孩子默认窗口为 08:00–18:30；保存部分更新会深合并 screen/plan，不重置其它设置。既有家庭显式保存的旧时段继续保留，家长可自行调整。18–23 月龄共看单次上限 8 分钟，24 月龄及以上硬上限 20 分钟，共看必须家长陪同；每日硬上限仍为 60 分钟，可按路线和家庭设置下调。

parent-only 的所有候选（含 pinned/review/balance）只取 `audience=parent`。co-view 可选两类，预算只计 child 课，超过每日建议预算只从尾部删除 child，家长课不因孩子预算被删；超预算单课不保留例外。计划不扣当天已用秒数，是否可播放由 screen 状态另行表达。

Session 的显式 audience 优先；缺失时根据课程索引归一持久化。旧记录读取时也按课程索引回退（包含已停用但尚未删除的包），未知课程保守当作 child。parent 指引时长不累计到 `usedSec`、统计 `screenSec`、`totalSec` 或领域秒数；学习次数和完成记录仍保留。全部时长归属开始日的本地日期，领域归主领域，不向副领域重复累计。

本地日期与时段使用服务端系统时区（可通过 `TZ` 设置），部署机器应使用家庭所在地时区；ISO 上报时间须带时区。

播放端需按课判定，而不能把 `allowedNow=false` 当作禁止所有课程：

```ts
const audience = lesson.audience ?? 'child';
const canStart = audience === 'parent' ||
  (screen.mode === 'co-view' && screen.allowedNow);
```

`screen.mode` 缺失的旧服务响应可由 core 根据孩子和阶段计算。parent 指引供家长阅读，不给宝宝观看；printables 是屏幕外实体材料。共看课开始前和播放中检查孩子的单次/每日余量与允许窗口。播放端必须在切后台或长时间无交互时暂停计时/音频，不自动连播；上报 `durationSec` 已排除暂停。服务端不会通过请求频率猜测真实观看时长。`streakDays` 仅保留 API 兼容统计，不应制作打卡、徽章或奖励。

## TTS 与备份

TTS 为可插拔 provider，配置 `auto` / `macos-say` / `none`。macOS 使用 `say -v <voice> -o <aiff> -f <textfile>` 与 `afconvert -f m4af -d aac`，文本不进入 shell；非 macOS、命令缺失或语言声音不可用返回 `available=false`。音频缓存按 provider、voice、规范化语言文本区分，并同步自定义包 audio manifest。课程保存后异步补全缺失音频，不阻塞保存；guide 只显示的家长话术不合成。关闭服务会停止接收新 TTS 任务并等待已接收任务完成。

`GET /api/backup` 导出 JSON，不含管理员密码、admin/device token、插件凭据。恢复支持 JSON 请求和 multipart `file`，先校验全部结构与引用，再覆盖家庭数据及自定义课/词；保留当前管理员登录，原设备令牌失效，设备需重新配对。

JSON 备份只包含契约中的课与词，不包含上传媒体、合成音频或已安装包。更换机器时应同时导出自定义内容包 ZIP并保存所需已安装包；完整冷备应停服务后复制整个数据目录。

## 验证

所有测试不依赖实际 `content/packs`，使用 `apps/server/test/fixtures` 的迷你包或临时生成内容；TTS 测试只用模拟 provider，不播放声音。测试默认单 worker，依次运行：

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/core typecheck
pnpm --filter @sprout/core test
pnpm --filter @sprout/server typecheck
pnpm --filter @sprout/server test
pnpm --filter @sprout/server build
PORT=4410 SPROUT_DATA_DIR=/tmp/sprout-smoke node apps/server/dist/index.js
```

另一个终端执行 `curl` 请求 `/api/health`、`/api/schemas`、`/api/docs/`；验证后用 Ctrl-C 或 SIGTERM 关闭服务。默认端口已有服务时使用 4410 或显式指定其它空闲端口，不结束其他任务的服务。

也可在 build 完成后运行 `node apps/server/test/smoke.mjs`：自动选择空闲备用端口、创建临时数据目录，验证基础接口及 T18 的预览只读、设备授权、时长截断、CORS、SSRF 拒绝和静态 MIME/停用逻辑，最后关闭服务并清理目录。安全测试均使用离线 DNS/HTTP 模拟，不依赖外网或实际内容包。并行开发中须先 `export pnpm_config_verify_deps_before_run=false` 使用已预装依赖；不要重装或改写其它任务的依赖。
