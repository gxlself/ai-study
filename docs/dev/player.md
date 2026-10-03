# 芽芽成长播放端

所有权：`apps/player/`。React 19、HashRouter、Vite 8；共享 schema、SDK 契约与设计令牌不在播放端修改。

## 运行与验证

```sh
pnpm --filter @sprout/player dev
# http://localhost:5310/

pnpm --filter @sprout/player typecheck
pnpm --filter @sprout/player test
pnpm --filter @sprout/player build
```

5310 已占用时使用 `pnpm --filter @sprout/player dev --port 5410`。Vite 对 `/api`、`/packs`、`/plugins` 代理到 `http://localhost:4310`。服务器也可直接托管 `apps/player/dist`。验证结束后停止开发服务器。

`predev` / `prebuild` 自动执行 `scripts/copy-bundled.mjs`，优先复制 `content/packs/sprout-core/{bundle.json,assets,audio}`；正式 bundle 尚未生成时输出警告，并使用播放器自有开发夹具。夹具有三节共看课、一节家长指引课、六个词条，不能作为正式课程发布。可运行 `node apps/player/scripts/validate-fixtures.mjs` 校验它。

`postbuild` 执行 `scripts/write-sw-manifest.mjs`，将构建后的应用壳、哈希 JS/CSS、内置包文件写入 `dist/sw.js` 的版本化预缓存清单。不要跳过这一构建步骤直接发布 Vite 中间产物。

内容包正在并行编写、正式 bundle 已存在但素材未齐时，默认构建会明确失败，不会静默回退。验收用例可显式设置 `SPROUT_BUNDLED_FIXTURE=1` 启动/构建；脚本会输出开发警告，这种产物不能当作正式内容发布。

## 配置与数据源

首次启动进入 `#/setup`，选择连接家庭服务器或离线建档。服务器地址可使用屏幕数字键盘，IP 和端口分开输入；完整地址框也支持主机名与 HTTPS。配对前先请求 health，配对码有效十分钟，每两秒轮询。token 下发后立即保存；未绑定孩子时从 bootstrap 的孩子列表选择。

持久化键：

| 键 | 用途 |
|---|---|
| `sprout.source` | `local` 或 `remote` |
| `sprout.server` | 家庭服务器地址；已有 device token 且未存地址时使用网页的 HTTP(S) origin |
| `sprout.deviceToken` | 播放设备 token，不是 admin token |
| `sprout.local.state` | 离线孩子档案、当前孩子、最近 2000 条学习记录 |
| `sprout.remote:*` | 按服务器和设备身份隔离的本机历史及待补传队列 |
| `sprout.preferences` | 家长提示条、减少动画、音量 |
| `sprout.timeGrants` | 本设备按孩子和本地日期保存的临时授权日志 |
| `sprout.coViewNotice:<childId>` | 该孩子在本设备已阅读共看知情提示 |

`src/data` 提供同一 `DataSource` 的 `LocalSource` 和 `RemoteSource`。本地排课、阶段、摘要、时间策略均调用 `@sprout/core`，不维护第二套排课算法。远程 session 先持久化、再发送；上传失败保留队列，启动、恢复联网、周期性重试及后续数据请求时补传，`clientId` 去重。远程“再玩一次”来自本设备历史，因为 device token 没有 `GET /api/sessions` 权限。家长记录带 `audience: "parent"`，保留实际可见活动时长，但不增加孩子已用屏幕秒数；旧记录缺省按 `child` 处理，核心已知家长课程也能识别旧记录。

远程模式暂不承诺完全断网后重新冷启动。要在没有家庭网络时可靠使用内置内容，请选择离线模式。不要清理浏览器站点数据，除非已经备份需要保留的档案与未上传记录。

## 播放与家长控制

- 今日计划只显示 1–4 课；完成后展示线下延伸活动，不自动开始下一课。
- 导语页首次“开始”解锁声音；可选距离提醒持续三秒。
- 每步单独创建 `AbortController`；卸载、超时、退出均中止活动并停止声音。未知插件展示可跳过的占位步骤。
- 计时只累计课程活动可见且未暂停的时间，家长门、手动暂停、切后台不计。达到单次上限、当日余量或离开可用时间窗会结束本次屏幕活动并保存记录。
- 共看课三分钟无任何按键、触屏、鼠标点击或滚动，自动暂停声音、插件和屏幕计时，显示“还在一起看吗？”。任意按键或点按只恢复，不会同时选择答案；没有自动续播。共看课单次硬上限二十分钟，18–23 月龄上限八分钟。
- 返回键先进入三方向家长门，错误换题，三十秒无操作关闭。家长菜单切换孩子、阶段/领域课程筛选、离线资料和语言、提示条、减少动画、音量、连接设置及署名许可均可操作。
- 临时延长十分钟在**当前设备**每天每个孩子最多一次，保留本地授权日志，并写入下一条真实学习 session 的 `parent.time-extension` 事件。API 契约没有服务端授权接口，无法保证另一台设备不再授权；需要服务端补充接口才能做家庭级统一计数。该授权不增加单次课程时长上限。
- 已读取的应用壳与包资源可离线缓存。`/api` 为 network-first；受鉴权保护的响应不进入共享缓存，防止切换家庭或身份时读取别人的数据。

## 活动宿主

`src/host` 负责空间导航、家长门状态函数、声音、资源解析及插件注册。内置活动直接来自 `@sprout/activities`；启用且带 entryUrl 的第三方插件动态加载前，提供 `globalThis.SproutHost`。插件加载失败不会导致整个播放端白屏。

词条查找顺序为本课所在包、`sprout.core`、其它已启用包；内联词条直接转换。各包音频清单按 `speechKey(lang,text)` 查表，缺失或播放失败回退到 Web Speech，再回退静默。中文 `zh-CN`、英文 `en-US`，rate 0.85、pitch 1.05。音效使用共享 AudioContext 和低增益合成。

页面“朗读与提示音”控制 host 的 TTS、录音与七种音效；插件直接使用共享 AudioContext 合成的儿歌、独立视频及网页媒体还受插件或设备系统音量控制。当前 SDK 没有统一媒体主增益/音量字段；需要 SDK 与活动模块协调，才能将这些声源统一绑定该滑杆。

进入课程前调用每步插件的 `preload`，最长等待八秒。插件通过 `ctx.log` 收集事件，单条 session 最多 500 条；通过 `setParentHint` 更新底部家长提示。当前内置活动为十七种，包含 `guide`；家长课只使用 `guide` / `song`。

## 家长模式

首页依照 `today.screen.mode` 分为家长模式和亲子共看。缺省模式按月龄保守处理；十八月龄以下始终家长模式，十八至二十三月龄默认关闭共看，家长可在设置中开启；远程设置由后台管理。本地可用时段默认 08:00–18:30。

每日计划遵守路线的 `childLessonsPerDay`，s4 最多一节共看课。仅家长模式下，本阶段适龄家长课程不足时以 child 课程的“线下版”补足；卡片有明确徽标，打开后只显示家长导语、短语与线下玩法，不预加载或挂载活动步骤，记录的 audience 为 parent、步骤数为 0，不计孩子屏幕时间。首次进入共看模式时显示可用遥控器关闭的知情说明，按孩子在本机记已读。

离线表单只提供出生年月，新档案按该月最后一个不晚于今天的日期保守计算月龄，不把不确定的生日默认为月初而提前开启共看。已有档案的年月未改变时保留原完整生日。后台可填写精确生日。

家长模式使用信息优先的活动卡，说明“这个月龄屏幕只给家长看：读 1–3 分钟就放下，去和宝宝玩真东西”。共看首页另有“家长指引”区；休息页也保留适龄家长课入口。带 `hasPrintables` / `printables` 的课程提示“可在后台打印卡片”，打印材料由后台生成，不给小月龄宝宝播放屏幕卡。

`audience: "parent"` 的课程不受孩子配额或时间窗阻拦，不显示护眼距离提醒，不出现儿童庆祝。结束显示线下材料、步骤、安全提醒、开放式 `question`，以及 `levels.easier` / 默认玩法 / `levels.harder`。没有新增字段的旧活动仍正常显示。

`guide` 阅读阶段同样有三分钟无输入暂停；插件上报 `guide:start`（`playMin > 0`）进入暗屏陪玩后豁免无人输入暂停。宿主隐藏亮色工具栏与提示条，不要求陪玩时不断碰屏幕；`guide:play-end` 后恢复阅读/观察阶段的无输入保护。切后台仍暂停插件计时与音频，恢复不会绕过手动或无输入暂停状态。

## 预览协议

```text
#/preview/<lessonId>?server=<URL编码服务器地址>&token=<admin-token>&mode=zh-en&age=24
```

`mode` 为 `zh` / `zh-en` / `en-zh` / `en`，`age` 为月龄。token 只保留在本次预览内存及 iframe 的 hash，不写入设备连接配置。预览不调用 session 写入、不限制时长、不要求家长门。

后台可向 iframe 发送未保存的课程，接收端会用共享 schema 校验：

```js
iframe.contentWindow.postMessage(
  { type: 'sprout:preview', lesson, packId: 'sprout.custom' },
  new URL(iframe.src).origin,
);
```

接收端只接受父窗口消息，且校验来源 origin；无课程 id 时等待上述消息。每次有效消息重新建立预览实例。只有 `lesson` 与 `packId` 的消息不包含额外词库，因此新建但未保存的词条应写作内联 `ConceptRef`，或先保存到词库。

## 按键与触屏

| 输入 | 行为 |
|---|---|
| 方向键 / Android 19–22 | 当前焦点作用域内空间导航 |
| Enter / NumpadEnter / 空格 / Android 23、66 | 先交给活动 `onKey('ok')`，未处理则点击当前焦点 |
| Escape / Backspace / GoBack / Android 4 | 返回；课程中触发家长门 |
| Capacitor `backButton` | 同一返回处理 |
| 触屏或鼠标点按 | 切换输入模式并直接操作 |

数字键盘、出生年月步进按钮、列表、复选框和滑杆均支持遥控器操作。文本输入时保留正常编辑按键；无需输入名字也可完成离线建档。D-pad 模式隐藏鼠标指针，焦点使用共享暖黄色描边；弹层独占焦点作用域。

## 电视与 iPad

电视浏览器打开家庭服务器根地址或局域网开发地址，首次配对；支持时开始课程会尝试全屏，失败不阻止播放。电视遥控器使用方向、确认和返回。iPad Safari 横屏使用，可添加到主屏；活动舞台保持 16:9，在 4:3 屏幕留背景色空白。

HTTP 局域网 URL 在普通浏览器里不一定属于安全上下文，因此 Safari/Chrome 可能不能注册 Service Worker；完整离线缓存建议使用 HTTPS、localhost 或后续原生封装。Capacitor 原生环境不注册 SW，读取随 App 打包的内容。

`capacitor.config.ts` 已设置 `com.sprout.growth`、`芽芽成长`、`dist`、Android HTTP scheme 和 mixed content。原生 `android/`、`ios/` 工程、设备签名及上架不属于本任务。

## 验收产物

浏览器测试脚本位于 `apps/player/scripts/browser-smoke.mjs`，截图写入已忽略的 `apps/player/test-artifacts/`。测试使用独立浏览器上下文和本地测试时间，不修改真实用户档案。脚本会关闭自行创建的浏览器；开发服务器由启动者在验收后停止。

```sh
node apps/player/scripts/browser-smoke.mjs
node apps/player/scripts/browser-protocol.mjs
```

`SPROUT_PLAYER_URL` 可指定备用端口，`CHROME_PATH` 可指定已安装的 Chromium/Chrome 可执行文件。默认使用本包 `@playwright/test`；受网络限制时可用 `PLAYWRIGHT_MODULE` 指向本机已有同版本模块的 `index.mjs`。脚本用开发夹具拦截内置包请求，避免并行内容构建导致用例不确定；生产内容需另做抽样验收。

协议用例在隔离浏览器上下文中 mock 家庭 API，验证一次性配对 token、未绑定孩子选择、家长门重试与超时、父窗口发送未保存课程、预览不写记录且不限时。它不调用真实家庭后台；结果与截图写入同一验收目录。

Vitest 配置限制单 worker、文件不并行；测试、构建、浏览器验收依次运行。浏览器脚本一次只启动一个 headless 浏览器，逐一检查目标尺寸，并在 `finally` 关闭。`scripts/verify-server.mjs` 的空注册表选项只用于主动验收缺少插件的占位步骤，不进入生产构建。
