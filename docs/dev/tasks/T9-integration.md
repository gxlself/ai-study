# T9 — 全链路集成与验收（单 Codex，可修改任意模块，但要谨慎、最小化）

此时所有模块与 96 节课程都已由其他任务完成。你是唯一在运行的开发任务（T8 原生打包可能并行在 `apps/player/android|ios`、`deploy/`、`docs/deploy/`，**不要动这些目录**）。

## 1. 路线合并与内容流水线
- 新增 `scripts/merge-route.ts`（根 scripts 加 `content:route`）：把 `content/packs/sprout-core/routes/_stages/s1..s6.json` 合并为 `routes/sprout-core-route.json`（`Route`：id `sprout.core.route`，title `{zh:'芽芽成长路线', en:'Sprout Growth Route'}`，description 中英一句话），阶段按月龄排序，校验阶段月龄连续（6–36 无缺口无重叠）；`content:all` 前置调用它。`_stages` 保持为源文件。
- 运行 `pnpm content:all --pack content/packs/sprout-core --prune`：生成全部中英朗读音频（macOS say，Tingting / Samantha），`validate --strict` 必须 **0 error**；warning 逐条处理：属于课程内容的问题（文案/引用/月龄）**不要自行改写课程文案**，把清单写进回报的"需要 Claude 决策"；属于数据结构/脚本的问题可修。
- 音频覆盖率检查：对每节课的每个步骤，用 `@sprout/activities` 中对应插件的 `speeches(props)` + 词库名称/拟声/短句 + `cardinalitySpeech` 计算播放时实际会朗读的文本集合，与 `audio/manifest.json` 比对，覆盖率需 100%（缺的补生成；若是 collect-speech 与活动实现不一致，修正 collect-speech 使两者一致，并加测试）。
- `pnpm content:bundle` 生成 bundle.json；`pnpm content:zip content/packs/sprout-core --out release/` 产出可导入的包。

## 2. 全量构建
`pnpm -r typecheck`、`pnpm -r test`（串行或 `--workspace-concurrency=1`）、`pnpm build`（server / player（**用正式 bundle，不用夹具**）/ admin）。全部通过；失败就修。

## 3. 端到端验收（用 Playwright/Chrome headless，串行，用完关闭）
启动 `PORT=4310 SPROUT_DATA_DIR=<临时目录> node apps/server/dist/index.js`（服务器同时提供 `/` 播放端与 `/admin/`）：
1. 后台首次设置（密码、家庭名）→ 新建 3 个孩子：7 月龄、20 月龄、30 月龄（按今天日期推算生日）。
2. 检查三人的今日计划：7 月龄只出家长指引课（mode=parent-only）；20 月龄默认 parent-only，后台开启共看后出现 child 课；30 月龄 co-view；数量与时长符合阶段策略。
3. 播放端（1920×1080 视口，只用键盘方向键/Enter/Escape 模拟遥控器）：连接服务器 → 配对（后台输入配对码）→ 选孩子 → 首页 → 完成 1 节家长指引课（guide 暗屏计时可用加速/缩短方式，但不要改产品默认值）与 1 节共看课 → 结束页线下活动 → 回首页；后台"学习记录"能看到 session 且家长课不计入孩子屏幕时间。
4. 屏幕上限：把 30 月龄孩子每日上限设 1 分钟，验证休息页出现、家长门可临时延长。
5. 打印：后台 `/admin/print/theme/s1-t1`、`/admin/print/lesson/core.s3.find-animal` 截图（A4），图片无缺失。
6. **逐课巡检**：对全部 96 节课用播放端预览 `#/preview/<id>`（admin token）在 1920×1080 与 1024×768 两种视口下逐步推进（每步按 OK/右键直到 complete，最多 40 次按键/步），记录：控制台错误、破图（naturalWidth=0）、文字溢出容器、白屏、未知活动类型；每节课每步截一张图存 `qa-artifacts/lessons/<id>/`（加入 .gitignore）。
7. 插件：用示例插件 zip 在后台安装 → 新建自定义课使用 `example.hello-stars` → 播放端预览可运行。
8. 内容包：后台导出 sprout.core zip、再导入（同版本覆盖）成功；导入 `content/examples/hello-pack` 成功并出现在课程库。

## 4. 产出
- 修复过程中发现的 bug（任何模块，最小改动，补测试）。
- `docs/dev/qa-report.md`：验收清单与结果表、逐课巡检汇总（96 行：课程 id、步骤数、是否通过、问题）、截图目录说明、已知问题。
- 回报中单列"需要 Claude 决策"的内容问题清单。

## 5. Claude 决策的修正项（必须实现，附测试）
契约已更新（`packages/schema`：`TodayPlanItem.offlineOnly?`、`ScreenPolicy.childLessonsPerDay?`）：
1. **每日共看课数上限**：`@sprout/core` planToday 遵守 `stage.screen.childLessonsPerDay`（缺省不限）；在 `routes/_stages/s4.json` 的 screen 中加 `"childLessonsPerDay": 1`（这是唯一允许你改的课程数据字段）。
2. **仅线下版**：生效模式为 parent-only 且本阶段可用的 audience=parent 课程不足 `lessonsPerDay` 时，用本阶段（当前主题优先）的 child 课补足，并标记 `offlineOnly: true`。播放端对 offlineOnly 项：卡片显示"线下版"徽标，点开后只显示家长导语 + phrases + 线下活动（含 question / levels），不挂载任何活动步骤、不计入孩子屏幕时间（session audience 记为 parent）。后台今日计划同样显示"线下版"。
3. **共看知情提示**：孩子首次处于 co-view 模式时（24 月龄自动开启或家长手动开启），后台孩子页与播放端首页各显示一次可关闭的说明："中国卫健委/教育部对 0–3 岁的建议更严格（不接触/禁用视屏类产品）；本 App 的共看课是可选的、短时的、必须陪同的；您可以随时在后台切换为『仅家长指引』，课程会以线下版继续。"（播放端用 localStorage 记已读；后台用孩子设置里的一个本地已读标记即可。）
