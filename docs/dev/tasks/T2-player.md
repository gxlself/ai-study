# T2 — 大屏播放端 @sprout/player（电视 / iPad / 浏览器）

## 所有权
`apps/player/**`（不含 `android/`、`ios/` 原生工程，Capacitor 原生打包由后续任务做；但你要写好 `capacitor.config.ts`）、`docs/dev/player.md`（新建）

## 依赖的其它模块（并行开发中，按契约编码）
- `@sprout/activities`：导出 `builtinActivities: ActivityPlugin[]` 与样式 `@sprout/activities/styles.css`（T3 正在写；若暂未就绪，你的代码按契约 import，在回报中说明，不要自己实现活动）。
- `@sprout/core`：签名见 `docs/dev/tasks/T1-server.md` A 节（T1 正在写；离线模式要用 `planToday/screenStatus/resolveScreenPolicy/findStage/summarizeLesson/localDateString`）。
- 服务端 API：`docs/dev/api.md`。
- 活动运行时契约：`packages/plugin-sdk/src/types.ts`（你实现 host 端：ActivityContext、焦点、声音、注册表）。
- 视觉：`packages/plugin-sdk/src/tokens.css`（直接 import 使用）、`docs/dev/visual-guidelines.md`。

## 技术
Vite 8 + React 19 + react-router（**HashRouter**）+ 纯 CSS。`vite.config.ts`：`base: './'`；dev 端口 5310，代理 `/api` `/packs` `/plugins` → `http://localhost:4310`。`capacitor.config.ts`：appId `com.sprout.growth`，appName `芽芽成长`，webDir `dist`，`server.androidScheme: 'http'`（允许连接局域网 http 服务器），`android.allowMixedContent: true`。

## 数据源（同一接口 DataSource，两种实现）
- **RemoteSource**：服务器地址存 localStorage `sprout.server`（若页面本身由服务器 http(s) 提供，默认 `location.origin`）；device token 存 `sprout.deviceToken`；调用 api.md 中 📺 接口。上报失败的 session 进本地队列，恢复后补传（clientId 去重）。
- **LocalSource**（离线/开箱即用）：从 `./bundled/packs/sprout.core/bundle.json`（类型 `PackBundle`）加载内容；孩子档案存 localStorage（家长在设置里填名字 + 生日年月）；排课与屏幕时间用 `@sprout/core`；记录存 localStorage（保留最近 2000 条）。
- 内置内容拷贝：`scripts/copy-bundled.mjs`（在 `apps/player/scripts/` 下）在 `predev`/`prebuild` 时把 `content/packs/sprout-core/{bundle.json,assets,audio}` 拷到 `public/bundled/packs/sprout.core/`；若仓库还没有 bundle.json（内容正在由其他任务编写），改为拷贝你自己做的开发夹具 `apps/player/dev-fixtures/sprout.core/`（一个迷你 bundle：3 节课，覆盖 word-cards / count / choose，词库 6 个词条，图片用简单内联 SVG 文件），并打印警告。

## 页面与流程
1. **初次启动 `#/setup`**：两个大按钮 ——「连接家庭服务器」/「先离线体验」。
   - 连接：服务器地址输入用**屏幕数字键盘**（0-9 . : 删除 确认，全部可遥控器操作），预填 `http://192.168.` 与 `:4310`；连通后 `POST /api/pair/start`，大字显示 6 位配对码 + "请在后台『设备』页输入此码"，每 2 秒轮询；批准后若设备未绑定孩子 → 选择孩子（bootstrap.children）→ 首页。
   - 离线：屏幕上选孩子出生年、月（遥控器可操作的上下选择器）+ 可选名字 → 首页。
2. **首页 `#/`**：顶部问候（按时段"早上好/下午好/晚上好，{名字}"）+ 阶段·主题小字 + 右上角今日屏幕时间小圆环（给家长看）。主体「今天的小旅程」：今日计划 1–4 张大卡片（封面词条图 + 领域色底 + 中文标题大字 + 英文小字 + 时长）。第二行「再玩一次」：最近完成的 3 课。右下角齿轮 → 家长门 → 家长菜单。若 `screen.allowedNow=false` → 跳转休息页。
3. **课程 `#/lesson/:id`**：
   - 家长导语页：标题、`parentGuide.intro`、`phrases`（中英对照）、陪同标签（required → "需要家长陪同"）、[开始] 按钮。（第一次用户交互在这里解锁音频。）
   - 若孩子设置 `distanceReminder`：显示 3 秒"坐远一点，保护眼睛"插画提示。
   - 步骤：全屏舞台挂载活动插件；顶部细小步骤圆点；底部家长提示条（step.parentTip / setParentHint；家长菜单可关闭）。返回键 → 家长门（通过则退出课程并记录未完成）。
   - 计时：页面可见且未暂停时累计；达到 `sessionMaxMin` 或当日剩余用完 → 暂停活动，显示"休息一下"遮罩（含本课线下活动），记录 session。
   - 结束页：温和庆祝（慢速彩带/星光 2 秒，鼓励语"你今天看得真认真！"）+ **线下延伸活动卡**（标题、材料、步骤、安全提示）+「回到首页」。**不自动开始下一课。**
   - 记录 `SessionInput`（events 用 ctx.log 收集）。
4. **休息页 `#/rest`**：柔和插画（白天：太阳与积木；夜晚：月亮）+ "今天的屏幕时间用完啦" 或 "现在是休息时间（{nextWindow} 再见）"+ 两条线下活动建议；家长门可"临时再给 10 分钟"（每天一次，记日志）。
5. **家长门**：屏幕显示随机 3 个方向箭头序列（如 ← ← →），家长用遥控器按出或点屏幕上的箭头按钮；正确进入；错误重新出题。30 秒无操作自动关闭。
6. **家长菜单 `#/parent`**（家长门后）：切换孩子（远程：`PUT /api/device/child`）；课程库（按阶段/领域筛选所有课，可直接播放）；设置（服务器连接/重新配对/切离线模式、离线模式孩子信息、语言模式（离线模式可改，远程模式只读提示去后台改）、家长提示条开关、减少动画、音量）；关于（版本、内容包署名 credits、素材许可）。
7. **预览 `#/preview/:lessonId?server=&token=&mode=&age=`**：后台 iframe 用；用 admin token 拉课程，不记录、不限时、无家长门；另支持 `window.postMessage({type:'sprout:preview', lesson, packId})` 直接预览未保存的课程 JSON。

## Host 端实现要点（ActivityContext）
- **注册表**：内置 `builtinActivities` + 远程插件（bootstrap.plugins 中 enabled 且有 entryUrl 的，`import(/* @vite-ignore */ url)`，导入前设置 `globalThis.SproutHost`）。未知 type → 占位步骤（"需要安装插件 xxx" + 跳过按钮）。
- **词库解析**：`ctx.concept(ref)`：字符串按 本课所在包 → sprout.core → 其它包 查找；内联对象直接转换；imageUrl 用 `resolveAsset`。
- **朗读**：各包 `audio/manifest.json` 合并查表（key = `speechKey(lang,text)`）→ HTMLAudioElement 播放；未命中 → Web Speech（`zh-CN`/`en-US`，rate 0.85，pitch 1.05）；都不可用 → 直接 resolve。`speak` 按 LanguageMode 依次读，`interrupt` 默认打断。
- **音效**：WebAudio 合成 7 种柔和音效，主增益 0.2。共享单例 AudioContext（`ctx.audioContext()`），在首次用户交互时 resume。
- **焦点/空间导航**：作用域栈（页面 / 遮罩 / 活动容器）；在当前作用域内 `[data-focusable]` 中按方向找最近元素（主轴距离 + 2×副轴偏移）；选中加 `.sp-focused`；OK 键：先交给活动 `onKey('ok')`，未处理则对焦点元素 `click()`。键位：方向键；Enter/NumpadEnter/空格/keyCode 23/66 → ok；Escape/Backspace/keyCode 4/`GoBack`、Capacitor `App.addListener('backButton')` → back。
- **输入模式**：pointerdown(touch/mouse) 与方向键切换 `input.mode`；dpad 模式隐藏鼠标指针。
- **预加载**：进入课程前对每步调用 `plugin.preload` 预取图片（显示友好加载动画，超时 8 秒继续）。
- **暂停**：`visibilitychange` 隐藏 → pause；显示 → resume。
- `ctx.signal` 在步骤卸载/课程退出时 abort。
- 禁止文本选择、禁止双指缩放（meta viewport），隐藏滚动条；Web 下首次开始时可请求全屏（失败忽略）。
- Service Worker（手写 `public/sw.js`，仅 http(s) 且非 Capacitor 时注册）：应用壳 precache；`/packs/`、`bundled/` cache-first；`/api/` network-first。

## 质量要求
- 1920×1080 与 1024×768（iPad）都要好看；遥控器全流程可操作（不需要鼠标）；触屏全流程可操作。
- vitest：空间导航算法、家长门、DataSource(Local) 排课调用、session 队列补传、speech 查表逻辑。
- 写 `docs/dev/player.md`：运行、配置、离线模式、预览协议、按键映射、如何在电视浏览器/iPad 使用。

## 验收
`pnpm --filter @sprout/player typecheck test build` 通过；`pnpm --filter @sprout/player dev` 后用浏览器（可用 Playwright 或 headless Chrome 截图）走通：离线体验 → 首页 → 打开一节课 → 完成 → 结束页；截图保存到 `apps/player/test-artifacts/`（该目录加入 apps/player/.gitignore）。若 `@sprout/activities` 尚未完成导致无法渲染，至少验证到占位步骤并在回报中说明。
