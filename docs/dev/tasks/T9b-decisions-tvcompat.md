# T9b — 决策落地 + 电视兼容

## 所有权
`packages/core/**`、`apps/player/src/**`、`apps/player/vite.config.ts`、`apps/player/index.html`、`apps/player/public/sw.js`、`apps/admin/src/**`、`packages/activities/src/**`（仅 CSS/语法兼容性修改，不改活动行为）、`apps/server/src/**`（仅为配合 offlineOnly 必需的最小改动）。
**不要动**：`apps/player/android|ios|resources`、`apps/player/capacitor.config.ts`、`apps/player/package.json`（T8 并行在改原生打包；如需加依赖，写进回报让 Claude 处理）、`content/**`、`scripts/**`、`packages/schema/**`（契约已更新）。

## A. 实现 `docs/dev/tasks/T9-integration.md` 第 5 节的三项决策
1. 每日共看课数上限 `stage.screen.childLessonsPerDay`（core planToday），测试覆盖。（`routes/_stages/s4.json` 的字段由内容任务添加，你只实现逻辑。）
2. 仅线下版 `offlineOnly`：core 排课 + 播放端卡片徽标与"线下版"课程页（只显示家长导语 + phrases + 线下活动，session audience=parent）+ 后台今日计划显示。测试覆盖。
3. 共看知情提示：后台孩子页与播放端首页各显示一次，可关闭。

## B. 电视 / 老 WebView 兼容（播放端与活动）
目标运行环境：**Android TV / 安卓电视盒子系统 WebView Chromium ≥ 70**、**iPadOS Safari ≥ 14**、电视自带浏览器（同等内核）。
1. 构建：`build.target` / `build.cssTarget` 设为 `['chrome70','safari14']`（确认 Vite 8 / Rolldown 实际生效：检查产物中无 `?.`、`??`、类字段私有 `#x`、顶层 await 等超纲语法——写一个检查脚本 `apps/player/scripts/check-compat.mjs`，构建后用 acorn/es-module-lexer 或正则粗检 + 运行 `npx browserslist`/`es-check es2018` 之类工具（如需新依赖写进回报，不要改 package.json；可先用 npx 临时运行））。
2. JS API：全仓（player + activities + plugin-sdk + core + schema 运行时路径）检查并处理 Chrome 70 不支持的 API：`structuredClone`、`Array.prototype.at`、`Object.hasOwn`、`String.prototype.replaceAll`、`AbortSignal.timeout`、`crypto.randomUUID`、`Promise.allSettled`(76)、`globalThis`(71)、`queueMicrotask`(71)、`ResizeObserver`(64 ok)、`Intl.Segmenter` 等——改为兼容写法或在 `apps/player/src/polyfills.ts`（入口最先 import）提供最小 polyfill。`packages/schema` 的 zod 4 运行时也会被打进播放端：确认其产物语法与 API 在 chrome70 可用（若 zod 依赖新 API，在 polyfills 中补齐）。
3. CSS：Chrome 70 不支持 flex `gap`(84)、`aspect-ratio`(88)、`inset`(87)、`:is/:where`(88)、CSS 嵌套、`clamp()`(79)、`min()/max()`(79)、`dvh/svh`、`backdrop-filter`(76)。在播放端与活动样式中替换为兼容写法（margin 间距 / grid gap / padding 比例盒 / 显式 top-left / 固定 vmin 值），`backdrop-filter` 需有不透明背景回退。tokens.css（契约文件）若含不兼容写法，在 `apps/player/src/` 的覆盖样式中提供回退，并在回报说明。
4. 验证：用 Playwright 的 Chromium 模拟（无法真机时）+ 在构建产物上跑 compat 检查脚本；在回报中列出仍存在的兼容风险。

## 验收
core / player / admin / activities 的 typecheck、test、build 全通过；compat 检查脚本通过。
