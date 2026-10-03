# T23–T26 — 最终验收并行拆分

背景：所有开发已完成。T9c 负责端到端流程 + 修复 + QA 报告；以下任务并行执行"巡检 / 原生"，**巡检任务不修改任何产品代码与内容**（apps/**、packages/**、content/**、scripts/** 只读），只产出证据与问题清单，修复由 T9c 统一完成。

## 巡检通用做法（T23/T24/T25）
1. 隔离环境：把当前 `apps/server/dist`、`apps/player/dist`、`apps/admin/dist` 复制到你自己的临时目录（快照，避免 T9c 重建时干扰）；若 dist 不存在或明显过期，先在临时目录外**不要**重建——改为在回报中说明并用 `pnpm --filter <pkg> build` 的产物快照（构建串行，构建完立即复制）。
2. 启动：`PORT=<你的端口> SPROUT_DATA_DIR=<临时目录> SPROUT_PLAYER_DIST=<快照> SPROUT_ADMIN_DIST=<快照> node <快照>/server/index.js`（server dist 若依赖相对路径，复制整个 apps/server/dist 并在原位置运行亦可，但数据目录必须独立）。端口：T23=4501，T24=4502，T25=4503。
3. 通过 API：`/api/setup` 初始化 → 建孩子（按需月龄）→ `POST /api/preview/token` 取 previewToken（10 分钟过期，过期重取）。
4. 每节课在 **1920×1080 与 1024×768** 打开 `http://127.0.0.1:<端口>/#/preview/<课程id>?previewToken=<token>`，只用键盘（方向键 / Enter / Escape）推进：每步按 OK/右键直到步骤完成（每步最多 40 次），guide 课的陪玩计时可用页面提供的结束按钮跳过。记录：控制台错误、未处理异常、破图（img naturalWidth=0 / SVG 加载失败）、文字溢出容器、白屏、未知活动类型、无法完成的步骤、焦点丢失（按键无反应）、家长页在 1920×1080 是否一屏放下（T17 要求）、音频请求 404。
5. 每步截图存 `qa-artifacts/<任务>/<课程id>/<视口>-step-<n>.png`；结构化结果 `qa-artifacts/<任务>/results.json`（每课：步骤数、各视口是否通过、问题列表含复现步骤）。
6. 你自己写的巡检脚本放 `qa-artifacts/<任务>/script/`（不写入 scripts/ 或 apps/）。
7. 浏览器同一时间只开 1 个；结束关闭浏览器与服务、删除临时数据。
8. 回报：通过/失败统计、问题清单（按严重度，含课程 id、视口、步骤、截图路径、复现、疑似根因文件），写入 `qa-artifacts/<任务>/findings.md`。

## T23 — 巡检 s1–s3（42 节，核心包）
## T24 — 巡检 s4–s6（54 节，核心包）
## T25 — 巡检扩展包 + 打印
- `sprout.culture`（20 节）与 `sprout.english`（12 节）全部课程按上面方法巡检（需确认两包被服务端加载）。
- 打印：后台 `/admin/print/theme/<themeId>`（核心包全部 28 个主题）与 `/admin/print/lesson/<id>`（抽 10 节含 printables 的课）用 A4 尺寸截图（可用 page.pdf 或 A4 视口截图），检查缺图、裁切、分页错乱、文字溢出。
## T26 — 原生重建与模拟器实测
所有权：`apps/player/android/**`、`apps/player/ios/**`、`release/`、`docs/deploy/validation.md`。
- 用当前最新代码与正式内容：`pnpm --filter @sprout/player build`（若 prebuild 因内容 bundle 过期失败，先运行 `pnpm content:bundle --pack content/packs/sprout-core`，这是唯一允许的内容操作）→ `android:all` 产出 debug/release APK 覆盖 `release/`（附 sha256）→ `ios:build`。
- Android TV 模拟器（已有 AVD 优先用 TV 镜像）：安装 release APK，用 `adb shell input keyevent`（DPAD_*、ENTER/DPAD_CENTER、BACK）实测：离线体验建档（7 月龄与 30 月龄各一次）→ 首页 → 家长指引课（含暗屏陪玩开始/结束）→ 共看课完成 → 结束页 → 返回键家长门；截图存 `apps/player/test-artifacts/android-final/`。
- iPad 模拟器：安装启动，横屏截图首页与一节课。
- 更新 `docs/deploy/validation.md`（本轮结果、APK 大小与 sha256、内置课程/词条/音频数量）。
- 注意：T9c 之后若修复了播放端代码，会再触发一次快速重建，你的脚本需可重复运行（写成 `apps/player/scripts/native-final-check.sh` 之类，放在你的所有权目录 android/ 或 docs 外的已有 scripts 位置需避免冲突——放 `apps/player/android/scripts/`）。
