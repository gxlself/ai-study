# 活动实验台

本目录仅实现 playground、样例、fixture 和测试。活动注册表来自 `../src/index.ts` 的 `builtinActivities`，SDK 来自 `@sprout/plugin-sdk` 的 TypeScript 源码导出。

## 运行

在仓库根执行：

```bash
pnpm --filter @sprout/activities dev
```

打开 `http://localhost:5312/`。端口被占用时配置会失败，不会悄悄换端口。也可使用 `http://127.0.0.1:5312/`。不需要服务端、内容包、联网素材或凭据。

依赖已安装时，可直接调用现有工具，避免包管理器自动检查/安装依赖：

```bash
node packages/activities/node_modules/vite/bin/vite.js --config packages/activities/dev/vite.config.ts
node node_modules/typescript/bin/tsc -p packages/activities/dev/tsconfig.json
node packages/activities/node_modules/vitest/vitest.mjs run --config packages/activities/dev/vitest.config.ts
node packages/activities/node_modules/vite/bin/vite.js build --config packages/activities/dev/vite.config.ts
```

开发服务由使用者按需启动，结束后 Ctrl+C。此分工不启动常驻服务；浏览器截图由集成验收统一执行。

## 操作与生命周期

- 左侧完整列出 schema 的 17 种活动，舞台保持 16:9；`guide` 是给家长阅读后离屏陪玩的指引。
- 输入方式有 `dpad` / `touch` / `pointer`，语言有 `zh` / `zh-en` / `en-zh` / `en`，支持减少动画。
- 方向键、Enter、Escape 分别映射方向、OK、返回。表单与工具栏内的键盘事件不转发到舞台，避免操作设置时误触活动；点击舞台后可用键盘，底部还有遥控器按钮。
- 输入、语言、减少动画切换均重开当前样例。重播、停止、暂停/继续均有日志；完成后停在结果页，不自动切下一活动。
- 媒体活动无人交互 90 秒自动暂停，切后台也暂停，必须明确继续。`guide` 暗屏计时没有背景媒体，不受无人交互计时限制，但仍响应宿主暂停和退出。
- `main.tsx` 不使用 `React.StrictMode`。`runtime.ts` 为每次挂载创建独立 DOM 容器和 AbortController；旧的异步 mount 晚到时会卸载，不能覆盖下一实例。完成、停止、切换后清理音频与焦点，幂等卸载。
- `context.ts` 是唯一 SDK 适配点：`createMockContext(props, { concepts, locale: {mode}, input: {mode}, complete, log, ... })`。不自行实现词库与语言规则；`concepts` 为 `ConceptView[]`。
- 朗读、音效、任意音频调用只记录日志并 resolve，不调用 TTS、不联网。song 使用独立真实 AudioContext，浏览器首次交互后才允许发声，暂停/退出会挂起或关闭。
- 日志最多保留 150 项；props 面板展示 schema 补默认后的值，不写课程或学习记录。

## 本地资源

`samples.ts` 的 `samples` 按 `BuiltinActivityType` 完整映射，每项通过 `BUILTIN_ACTIVITY_PROPS[type].parse(...)`，包括嵌套默认值。7 个词条使用本目录原创简洁 SVG。

视频是本地静态画面、无音轨的六秒 H.264 MP4，含 poster 与 VTT 字幕。活动不自动播放。仓库已有文件，无需安装工具；如本机已有 ffmpeg，可重新生成：

```bash
node packages/activities/dev/generate-video.mjs
ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_name,width,height,pix_fmt -of json packages/activities/dev/assets/quiet-shape.mp4
```

web 活动拒绝同源页面：`allow-scripts allow-same-origin` 同时启用时，同源 iframe 不能被当作安全隔离。`fixtures.ts` 让父页面与 fixture 在同端口使用不同回环域名，`localhost` 与 `127.0.0.1` 互换，不连接外网。fixture 从 `parentOrigin` 参数校验预期父来源，向该精确 origin 发送 `{type:"sprout:complete"}`，不用 `"*"`。

该开发服务绑定 IPv4 回环地址。若操作系统把 localhost 仅解析为 IPv6 且不回退 IPv4，应先修正本地 localhost 解析；不要把 iframe 改回同源或关闭 sandbox。生产 H5 则需真正独立、可信且允许嵌入的来源。

## 验收

包根 `vitest.config.ts` 用单 worker 串行收集源码和本目录测试：17 份 props 与文档示例校验、词库引用/本地资产、导航回退、异步 mount 竞态、暂停/取消、mock 日志和跨 origin 消息。

`dev/capture.mjs` 使用一个 Playwright 浏览器依次为 17 个活动拍摄桌面、平板、窄屏截图，并检查图片、非空像素、控制台与 guide 暗屏/反应记录；输出位于包根已忽略的 `test-artifacts/`。脚本会关闭自己启动的 Vite 和浏览器。机器已安装 Playwright 时可传 `PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs`；端口占用可用 `SPROUT_CAPTURE_PORT=5412`。

web 需点击 iframe 内的“你好”，父窗口遥控器事件不会自动穿透跨来源 iframe。生产宿主须按 `Lesson.audience` 区分家长阅读与孩子屏幕时长，并实现同等后台/无人互动暂停护栏。
