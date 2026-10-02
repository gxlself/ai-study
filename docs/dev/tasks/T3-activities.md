# T3 — 16 个内置活动 @sprout/activities + 插件 SDK 工具 + 插件示例

## 所有权
`packages/activities/**`、`packages/plugin-sdk/src/**`（**除** `types.ts`、`tokens.css` 两个契约文件）、`plugins/examples/**`、`docs/dev/plugin-guide.md`、`docs/dev/activities.md`

## A. @sprout/plugin-sdk（工具函数，供内置与第三方插件使用）
`src/index.ts` 导出：`export * from './types'` + 
- `defineActivity(plugin)`：类型辅助（原样返回）。
- `defineReactActivity({ type, version, name, ..., Component, preload?, speeches? })`：用 React 18+/19 `createRoot` 实现 mount/unmount，Component 接收 `{ ctx }`；把 `onKey` 通过 `useActivityKeys(handler)` hook 注册（同一实例只保留最新 handler）；pause/resume 通过 `useActivityPaused()` 暴露。React 从参数或 `globalThis.SproutHost.React` 取（第三方插件可复用宿主 React），内置活动直接 import react。
- 辅助：`shuffle(arr, seed)`（确定性）、`wait(ms, signal)`（可中止）、`chooseOptions` 规范化（字符串 → ChooseOption）、`createMockContext(props, overrides)`（测试/playground 用的假 ActivityContext：speak 打印日志并 resolve、concept 从传入的小词库解析）。
- 校验 `validateWithSchema`? 不需要（服务端负责）。

## B. @sprout/activities：16 个内置活动
导出 `builtinActivities: ActivityPlugin[]`（顺序同 `BUILTIN_ACTIVITY_TYPES`）、每个活动的单独导出、`src/styles.css`（所有活动样式，类名前缀 `spa-`，引用 tokens.css 变量）。props 类型直接用 `@sprout/schema` 的 `XxxProps`（host 已补默认值）。
每个活动必须：同时支持遥控器（`data-focusable` + onKey）与触屏点按；`ctx.signal` 中止时停止所有声音/定时器；`reducedMotion` 时去掉循环动画；`preload` 返回所有图片 URL；`speeches` 返回所有将朗读的 Speech；文案随 `ctx.input.mode` 显示"按 OK"或"点一点"；结束时调用 `ctx.complete({accuracy?, data})`；用 `ctx.log` 记录关键交互。

| type | 行为规格 |
|---|---|
| **contrast** | 全屏纯色底（bw：白底黑图 / 黑底白图交替；bwr 加红），SVG 代码绘制所列图案（bullseye 同心圆、stripes 粗条纹、checker 棋盘、dots、face 简笔脸、spiral、zigzag、circle、square、triangle、star、heart），图案占舞台高 60%。motion：drift 缓慢左右漂移（周期 6s，幅度 15%）、pulse 缓慢缩放（0.9–1.05，5s）、rotate 极慢旋转（20s 一圈）。每图停留 secondsPerPattern 秒后 1 秒淡入淡出切换；OK/右键/点按 立即下一张；narration 在第一张时读一次。全部播完 complete。**禁止快速闪烁。** |
| **word-cards** | 一次一张大卡：大图（舞台高 55%）+ 中文主词（xl）+ 英文（lg，按 show 设置）+ 可选拼音。进入每张时按 speak 规则朗读（name：读 zh/en 名；name+sound：再读拟声；name+phrase：再读短句）。OK/点按卡片 = 再读一遍并让图片轻轻弹一下；左右键/屏幕两侧大箭头 = 上一张/下一张；最后一张后出现"看完啦"按钮 → complete。autoAdvanceSec 非空时自动翻页（仍可手动）。intro 在开始时读。 |
| **peekaboo** | 每个物体：出现并朗读名字 → 遮挡物（hands 两只小手 / curtain 幕布 / box 盒盖 / leaf 叶子 / cloud 云朵，自绘 SVG）缓慢盖上 → 读 ask → hideSec 秒或按 OK 后遮挡物移开 → 读 reveal + 名字 + chime。全部完成 complete。动画慢（≥600ms）。 |
| **bubbles** | 4–6 个半透明泡泡缓慢上浮（slow：12s 穿过屏幕）。dpad：焦点在最显眼的泡泡上，左右切换；OK/点按戳破 → pop 音 + 出现 items 中下一个事物图片 1.5s（sayName 时朗读）。达到 pops 次数后剩余泡泡飘走，读"泡泡飞走啦 / Bye-bye bubbles" → complete。 |
| **count** | 每轮：物体按 layout 排列（row 一排；scatter 不重叠散布；dice 骰子点位；ten-frame 2×5 格）。guided：每按一次 OK/点按任意物体，下一个物体高亮放大并在其上方出现数字，朗读数词（中文唱数用 numberToZh(n) 即"一二三"，英文 one two three）；auto：每 1.5 秒自动数一个。数完：若 cardinality，所有物体一起轻跳并朗读 `cardinalitySpeech(n, concept)`（"一共两只小狗 / Two dogs!"），showNumeral 时显示大号阿拉伯数字。下一轮按 OK 进入；全部结束 complete。 |
| **subitize** | 每轮：物体以 arrangement 排列显示 showSec 秒（不快闪）→ 渐隐 → 读"有几个？/ How many?" → choices 时显示 3 个圆点卡选项（正确数与相邻数），选择后：对 = 物体重现并逐个数一遍；错 = 温和"再看看"，物体重现，再选。无 choices 时直接重现并数。 |
| **choose** | 每轮：读 prompt；2–4 个选项卡（大、等距、可聚焦），选项可为词条图/图片/数量组（count 个小图）/缩放（scale）/着色（tint 作为卡片底色色块）。选对：卡片放大 + chime + 读名字 + explain；选错：轻摇 + soft-no + 读"再找找 / Try again"；累计错 hintAfter 次后正确项缓慢发光提示。showLabels 时显示文字。accuracy = 首次即对的轮数/总轮数。 |
| **sort** | 两三个篮子（底部，带 label 与图/色）。当前物体在中上方大图显示并朗读；dpad：左右选篮子 OK 放入；触屏：点篮子。对：物体滑入篮子 + chime；错：物体轻摇回位 + "再想想"。全部分完，篮子轻跳，complete。 |
| **sequence** | show：依次展示步骤卡（图 + 标号 1、2、3 + caption），读 say 或 caption；左右翻，最后显示全部步骤缩略横排一起回顾。order：显示已完成的步骤缩略，问"接下来做什么？"，给 2 个选项（正确下一步 + 另一步），选对推进。 |
| **pattern** | 每轮：序列横排展示，末尾一个"?"空位（缓慢呼吸）；读 intro 或"接下来是什么？"；下方 options 卡；选对填入空位并把整列从头读一遍（读名字）；选错温和提示。 |
| **story** | 绘本：场景渲染器（共享组件 `Scene`：bg 预设 sky/grass/night/sea/room/sunset/snow/paper/forest 为柔和渐变；ground 为底部地面条；sprites 按 x/y/size 绝对定位，anim 慢速 CSS 动画，delay 入场淡入）。封面（cover 或首页场景 + 标题）→ 每页：场景占上 75%，文字区下 25%（中文大字 + 英文小字，按语言模式）；进入页自动朗读 text（narrate）；家长提示条显示 prompts（形如"💬 问：小狗在哪里？"）。左右翻页、OK 重读；最后一页后"讲完啦"→ complete。 |
| **song** | 场景（可选）上方，歌词逐行（当前行高亮放大，其余淡）；WebAudio 合成旋律：解析 `NoteString`（如 "C4/1 D4/0.5 R/1"，bpm 决定拍长），instrument 用简单合成（musicbox：正弦+泛音快衰减；marimba：三角波短衰减；flute：正弦柔和包络；piano：两振荡器衰减），主增益 0.18。按行顺序演奏，行高亮与音符同步；actions 显示为大图标提示（如 👏 拍拍手）。repeat 次数后结束 → 显示 credit 小字 → complete。OK 键 = 暂停/继续。屏幕提示"和宝宝一起唱"。 |
| **movement** | 每个动作：大图（概念图）+ 动作名 + 朗读 say；顶部慢速倒计时圆环（seconds）；bpm 时播放柔和节拍（每拍一个轻 tap）。时间到自动进入下一个（这是允许的自动推进，因为孩子在动），OK 跳过。结束读"真棒，动完啦！"→ complete。 |
| **calm** | 中央视觉（balloon 气球/star 星星/flower 花/moon 月亮，自绘 SVG）随呼吸缓慢放大（inhale）缩小（exhale），文字"吸气…呼气…"（中英按模式），开始时读 say（默认"我们一起慢慢呼吸 / Let's breathe slowly"）。cycles 结束 complete。背景渐暗。 |
| **video** | `<video>` 播放 src（resolveAsset），poster，captions(track)，**不自动播放**：显示大播放按钮；OK 播放/暂停；maxSec 到达自动暂停并结束；ended → complete。 |
| **web** | sandbox iframe（`allow-scripts allow-same-origin`，allowFullscreen 按设置）；监听 `message` 事件 `{type:'sprout:complete'}` → complete；maxSec 到达 → complete；返回键交 host。显示加载中与加载失败提示。 |

## C. dev playground（`packages/activities/dev/`）
`pnpm --filter @sprout/activities dev`（端口 5312）：左侧选活动、右侧 16:9 舞台；用 `createMockContext` + 一份内置示例 props（每个活动 1 份，放 `dev/samples.ts`）+ 小词库（图片用 `dev/assets/` 简单 SVG）。支持键盘方向键/Enter 模拟遥控器、切换 input mode 与 language mode。

## D. 插件示例 `plugins/examples/hello-plugin/`
一个最小第三方插件：`plugin.json`（id `example.hello`，activity type `example.hello-stars`：点击星星数一数，props JSON Schema）、`src/index.ts`（原生 DOM 实现，不依赖 React）、`vite.config.ts` 库模式构建为单个 ESM `dist/index.js`、`package.json`（name `@sprout-example/hello-plugin`，build 脚本输出 zip 到 `dist/example.hello-1.0.0.zip`，zip 内含 plugin.json + index.js）、README。

## E. 文档
- `docs/dev/plugin-guide.md`：插件开发完整指南（契约说明、生命周期、ctx 能力、遥控器/触屏适配、视觉规范、打包/安装（后台上传 zip 或登记远程 plugin.json URL）、JSON Schema 示例、调试方法、安全约束、版本兼容）。
- `docs/dev/activities.md`：16 个内置活动的用途、适龄、props 示例 JSON（可直接复制进课程）。

## 验收
`pnpm --filter @sprout/plugin-sdk typecheck test`、`pnpm --filter @sprout/activities typecheck test` 通过（用 jsdom 至少测：每个活动能 mount/unmount 不报错、count 的朗读序列、choose 对错逻辑与 accuracy、song 音符解析、spatial 无关）；playground 启动后用 headless 浏览器为每个活动截图存 `packages/activities/test-artifacts/`（加入该包 .gitignore），确认无空白/报错；示例插件 build 产出 zip。
