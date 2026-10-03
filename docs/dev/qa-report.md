# 芽芽成长 Sprout T9 集成验收报告

- 最新报告生成时间：2026-10-03 13:18:31（Asia/Seoul）。
- 集成验收日期：2026-10-03；正式 bundle 构建时间：2026-10-03T01:33:54.639Z。
- 验收 bundle SHA-256：62c04adfccd60d6da00b0bdaa4ea5c4e25cb22884632198f46393ec2ba326447。
- Headless Chrome：154.0.8037.97。
- 最新输入文件修改时间：2026-10-03 13:13:04（Asia/Seoul）。修改时间不等同于测试执行时间。
- 当前已纳入证据的结论：**通过**。流程检查 9 通过 / 0 失败 / 0 待验收；正式课程 96 通过 / 0 失败 / 0 待验收。

报告在运行时读取结构化 JSON 和日志，不运行测试、构建、浏览器或服务。缺失、未结束、重复或不完整记录不会被算作通过；技术修复说明不是测试结果。以下结论不涵盖 T8 原生验收。

## 正式内容与音频实际数量

| 项目 | 实际记录 |
| --- | --- |
| 正式包 | sprout.core @ 1.0.0 |
| 正式包课程 / 步骤 | 96 / 120（T9 目标 96 节） |
| 家长课 / 共看课 | 54 / 42 |
| 词条 / 路线 / 阶段 / 主题 | 220 / 1 / 6 / 32 |
| bundle 音频清单条目 | 1427 |
| 音频覆盖产物课程 / 步骤 / 逐步记录 | 96 / 120 / 120 |
| 所需文本 / 已覆盖 / 计数比例 | 1427 / 1427 / 100.0% |
| 缺失音频 / 未采集文本条目（逐步） | 0 / 0 |
| 运行时音频覆盖结论 | 通过；运行时所需 1427，已覆盖 1427；逐课逐步记录完整 |

计数取自本次读取的正式 bundle 和 audio-coverage.json；逐步 required 可能重复同一文本，不能相加替代全包去重所需数。比例只表示产物的数值比，完整通过还要求正式课程逐步证据、missing 与 uncollected 清单一致。生成器不重新生成或播放音频。

## 验收清单

| 验收项 | 结果 | 实际详情 / 问题 |
| --- | --- | --- |
| 后台首次设置与三个孩子档案 | 通过 | [{"name":"小芽20","birthday":"2025-02-03"},{"name":"小芽30","birthday":"2024-04-03"},{"name":"小芽7","birthday":"2026-03-03"}] |
| 分龄计划、每日共看上限与知情提示 | 通过 | {"ages":[7,20,30],"counts":[2,2,2],"enabledChildLessons":1} |
| 遥控器连接、后台配对、选孩子、家长暗屏与记录 | 通过 | {"pairing":true,"guideTimer":true,"guideIdleExempt":true,"parentScreenSec":0} |
| 共看课、结束线下活动及后台学习记录 | 通过 | {"lessonId":"core.s6.clap-pattern","sessionAudience":"child","completed":true} |
| 每日 1 分钟上限与家长门临时延长 | 通过 | {"dailyMaxSec":60,"rest":true,"extendedThroughGate":true} |
| parent-only 的仅线下计划、家长记录与后台徽标 | 通过 | {"offlineItems":2,"audience":"parent","mountedActivities":0} |
| A4 主题与单课打印无缺图 | 通过 | {"routes":["s1-t1","core.s3.find-animal"],"missingImages":0} |
| 后台安装插件、自定义课与真实插件预览 | 通过 | {"installed":"example.hello","customLesson":"custom.qa-hello-stars","activity":"example.hello-stars"} |
| 后台导出与同版本覆盖、hello-pack 导入课程库 | 通过 | {"sameVersion":true,"helloLessons":2,"coreLessons":96} |
| 正式 bundle 完整性 | 通过 | sprout.core，96 节，120 步 |
| 集成使用正式 bundle | 通过 | 使用正式 bundle，SHA-256 与当前源文件一致 |
| 逐课运行时音频覆盖 | 通过 | 运行时所需 1427，已覆盖 1427；逐课逐步记录完整 |
| 根工作区测试（Vitest + Node TAP） | 通过 | Vitest 通过 912；Node TAP 通过 10 |
| 内容流水线测试 | 通过 | Vitest 通过 296 |
| 严格内容校验 | 通过 | 有效课程 96，错误 0，警告 0 |
| 串行构建与正式包复制 | 通过 | server 成功标记 有；Vite 完成标记 3；正式包复制 有；SW 清单完成 有；串行/引号过滤 有；构建警告 4 |
| 正式课程双视口全量巡检 | 通过 | 192/192 个课程/视口组合有记录；详见逐课表 |
| 集成资源关闭 | 通过 | 集成 JSON 记录 resourcesClosed=true |
| 串行验证命令退出码 | 通过 | 见下方命令记录 |

缺少的预期流程检查仍保留为待验收行。checks.details 以实际 JSON 展示，passed 必须明确为 true；任何错误或重复检查都不能被后续通过记录掩盖。命令状态由串行验证器记录实际退出码，ZIP 制作结果另见 core-zip.log、hello-zip.log 与 release/ 产物。

| 命令 | 退出码 | 状态 | 详情 |
| --- | --- | --- | --- |
| pnpm -r --workspace-concurrency=1 typecheck | 0 | 通过 |  |
| pnpm content:typecheck | 0 | 通过 |  |
| pnpm -r --workspace-concurrency=1 test | 0 | 通过 |  |
| pnpm content:test | 0 | 通过 |  |
| node --test --test-concurrency=1 apps/player/scripts/tests/service-worker.node.mjs | 0 | 通过 |  |
| pnpm content:validate --pack content/packs/sprout-core --strict | 0 | 通过 |  |
| pnpm build | 0 | 通过 |  |

## 测试日志计数

| 测试范围 | 测试数 | 通过 | 失败 | 跳过 / 待办 | 测试文件数 | 状态 | 来源 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 根工作区 Vitest | 912 | 912 | 0 | 0 / 0 | 52 | 通过 | qa-artifacts/logs/tests.log |
| 根工作区 Node TAP（示例插件） | 10 | 10 | 0 | 0 / 0 | 不适用 | 通过 | qa-artifacts/logs/tests.log |
| 内容流水线 Vitest | 296 | 296 | 0 | 0 / 0 | 7 | 通过 | qa-artifacts/logs/pipeline-tests.log |

根工作区 Vitest 和 Node TAP 分开统计；示例插件 Node TAP 的 # pass 汇总为 10，不是 Service Worker 单测数。无测试文件的包不贡献测试数；未记录全部预期包、失败或缺少最终汇总的运行不会算作已通过。日志汇总状态不等于命令退出状态；验收清单还要求对应命令明确成功。

| Vitest 范围 | 测试文件数 | 测试数 | 通过数 | 汇总状态 |
| --- | --- | --- | --- | --- |
| packages/schema | 0 | 0 | 0 | 无测试文件 |
| packages/core | 9 | 215 | 215 | 已记录完整汇总 |
| packages/plugin-sdk | 1 | 41 | 41 | 已记录完整汇总 |
| apps/server | 4 | 138 | 138 | 已记录完整汇总 |
| packages/activities | 10 | 180 | 180 | 已记录完整汇总 |
| apps/admin | 13 | 155 | 155 | 已记录完整汇总 |
| apps/player | 15 | 183 | 183 | 已记录完整汇总 |

## 逐课双视口巡检

课程行来自正式 bundle，按 id 稳定排序；当前 96 行，目标 96 行。每行合并 1920x1080 与 1024x768，任一失败则整体失败，任一缺失或未完成则整体待验收。

| 课程 id | 步骤数 | 1920x1080 | 1024x768 | 整体 | 问题 |
| --- | --- | --- | --- | --- | --- |
| core.s1.contrast-faces | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.contrast-shapes | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.family-faces | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.farm-sounds | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.hide-toy | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.lullaby | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.mirror | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.my-face | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.old-macdonald | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.peekaboo-hands | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.tummy-time | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s1.twinkle | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.clap-wave | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.fruits | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.goodnight | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.hello-bye | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.home-things | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.if-happy | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.in-and-out | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.mealtime | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.more-all-gone | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.real-bubbles | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.row-boat | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s2.under-cup | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.body-parts | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.car-song | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.clothes | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.count-two | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.dress-up | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.duck-mom | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.farm-animals | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.find-animal | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.head-shoulders | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.little-tree | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.one-many | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.outdoors | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.rain-day | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.roll-car | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.touch-nose | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.two-tigers | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.vehicles | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s3.wash-hands | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.bath-time | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.bear-angry | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.big-small | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.blocks | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.brush-teeth | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.calm-down | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.circle-friends | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.color-hunt | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.count-life | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.count-three | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.feelings | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.find-red | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.grow-big | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.nesting | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.one-two-three | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.scribble | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.shape-hunt | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s4.wash-song | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.animal-homes | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.count-five | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.five-ducks | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.how-feel | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.itsy-spider | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.odd-one | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.panda-story | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.quick-look | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.rain-song | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.sort-color | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.sort-kind | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.take-turns | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.thank-you | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.up-down | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.weather | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.what-to-wear | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.where-cat | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s5.wild-animals | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.animal-pattern | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.body-move | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.clap-pattern | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.count-ten | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.day-night | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.dress-order | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.first-day | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.four-seasons | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.fruit-pattern | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.healthy-food | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.more-fewer | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.morning-routine | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.my-shoes | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.polite-words | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.quick-five | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.school-things | 1 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.seed-grow | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |
| core.s6.sleep-well | 2 | 通过 | 通过 | 通过 | 无（两种视口逐步记录均完整通过） |

## 插件与内容包集成

- 插件检查：通过；实际 details：{"installed":"example.hello","customLesson":"custom.qa-hello-stars","activity":"example.hello-stars"}。
- 上述检查对应 `scripts/qa-integration.mjs` 的链路：后台上传插件 ZIP 并确认信任；使用 admin token 经 `POST /api/lessons` 创建 `custom.qa-hello-stars`，再在播放端预览并推进 `example.hello-stars`。自定义课创建走管理端 API，不是后台编辑器表单验收。
- 内容包检查：通过；实际 details：{"sameVersion":true,"helloLessons":2,"coreLessons":96}。同版本覆盖只在 `sameVersion=true` 的实际检查记录中成立，核心课数与 hello-pack 课数按 details 展示。
- 家长课、共看课、offlineOnly、配对、学习记录、限时与家长门的实际结果分别见 checks 清单；不以单元测试或修复说明代替集成验收。

## 截图目录规则

- `qa-artifacts/lessons/<课程 id>/<1920x1080|1024x768>-step-<从 1 开始的步号>.png`：每个正式课程、每个视口、每一步的截图。
- `qa-artifacts/lessons/<课程 id>/<视口>-failure.png`：失败现场；不能替代缺少的步骤截图或通过记录。
- `qa-artifacts/flow/*.png`：档案、家长暗屏、结束页、学习记录、限时、线下版与插件预览；失败现场为 `admin-failure.png` / `player-failure.png`，弹层诊断为 `admin-failure-dom.json`。
- `qa-artifacts/print/theme-a4.png` / `lesson-a4.png`：A4 宽度视口、print 媒体下的主题和单课打印截图；相关路由为 `/admin/print/theme/s1-t1`、`/admin/print/lesson/core.s3.find-animal`。
- QA 截图与导出包属于本地验收产物，目录按 T9 规则由 `.gitignore` 排除。路径规范不代表文件已经存在；本生成器不巡检截图文件，也不修改忽略规则。

## 父任务已记录的技术修复

这些是父任务提供的修复记录，不自动赋予任何检查“通过”状态。

1. 路线合并：保留 `_stages/s1..s6.json` 源阶段，生成 `sprout.core.route`，按闭区间检查 6–36 月龄连续；s4 每日 child 共看课上限为 1。parent-only 不足额时用本阶段 child 课补齐并标记 `offlineOnly`，仅显示家长导语、phrases 与线下 question/levels，不挂载活动，session 记 parent，不计孩子屏幕时间；后台与播放端首次共看知情提示可关闭并记已读。
2. 朗读声明与采集对齐实际 `speeches(props)`、词库名称/拟声/短句、公共短句及 `cardinalitySpeech`，不递归采集家长导语、guide.say 或绘本家长提问等仅展示文字；song 歌词是旋律/显示内容，不当作 TTS 朗读采集，song 标题与 video 标题按实际朗读采集。
3. 内容包导入允许同 id 同版本的 installed 包覆盖内置包，保留启停状态；仍拒绝版本降级。同版本覆盖的集成成功以实际 checks 为准，不能推断降级路径也做过浏览器验收。
4. 根构建用串行 `--workspace-concurrency=1`，过滤器 `--filter './packages/*' --filter './apps/*'` 必须加引号，避免 shell 展开目录通配符。
5. reduced-motion 的全局 1ms 过渡曾破坏后台弹层 left/top 同步测量；现改为 `animation: none`、`transition: none`，并以 Ant Design `motion` token 响应减少动画偏好。
6. 服务端直接访问含点号课程 id 的打印路由（如 `core.s3.find-animal`）走已知打印路由的 SPA fallback，不把点号误当缺失静态文件扩展名；真正缺失的静态资源仍返回 404。
7. choose、sort、pattern、subitize 依据当前 DOM 焦点处理连续方向键和 OK，避免 React 状态尚未提交时丢键或选中非高亮项；增加快速连续按键、循环、换轮和暂停回归测试。顺序题焦点框与双语提示增加安全间距；纯图片缩放不再误报为文字溢出。
8. 提供项目已有芽芽图标的 favicon，避免首次打开页面的资源 404；显式线下版选择通过路由状态保留，不因后台模式刷新竞态挂载共看活动。
9. 播放端 Vitest 恢复测试文件隔离，仍保持单 worker、文件不并行，防止页面 mock 被后续宿主测试的模块缓存复用。

## 已知约束与未完成项

- 浏览器 QA 串行使用单个 headless Google Chrome（Playwright chromium 驱动，可创建多个隔离 context），不是多浏览器兼容验收；context 设置 `serviceWorkers: block`。Service Worker 的独立 Node 单测由串行验证器执行，其退出码不等于真实设备离线验收。
- QA context 用 `page.clock.runFor` / `fastForward` 加速家长暗屏与活动计时，媒体播放速率在 QA 注入脚本中调整；没有缩短或改变生产默认陪玩时长、屏幕上限与活动默认值。
- 1920x1080 与 1024x768 是浏览器视口；方向键、Enter、Escape 模拟遥控器，后台表单也使用浏览器操作/API。并非 Android TV、iPad、iOS/Android 原生真实设备、硬件遥控器或触屏验收。
- T8 所有权目录 `apps/player/android/`、`apps/player/ios/`、`deploy/`、`docs/deploy/` 排除在本报告验收范围外；本 sidecar 只实现报告生成器，未编辑这些目录或任何课程内容源。
- 逐步图像/溢出检测只覆盖脚本指定 DOM 与截图时刻，截图为步骤推进前的现场，不代表全部动画帧、可访问性、听感或真实打印机效果。报告生成器不重新打开页面验证。
- 报告核对正式 bundle 的 SHA-256、课程 id、步骤数和活动类型；这不替代对 JS/CSS 构建变更的追溯，最终验收应在构建稳定后完整执行。
- 本次先完整扫描 96 课双视口，再对修复涉及的全部活动课程回归，最后重跑九项流程。原始结果保存在 `qa-artifacts/initial-full-results.json`，回归日志为 `browser-retest.log`，最终流程日志为 `browser-final-flow.log`；报告使用同一 bundle 哈希下的合并结果。
- `SPROUT_QA_PHASE`、`SPROUT_QA_IDS`、`SPROUT_QA_TYPES` 可限制单次范围；`SPROUT_QA_MERGE=1` 仅允许在前次资源已关闭且 bundle 哈希一致时替换对应真实记录，不能用子集代表未检查课程。

已纳入证据未记录失败；范围外项目与上述约束仍不代表已验收。

构建日志告警（与内容 warning 决策分开）：
- 第 68 行：(!) Some chunks are larger than 500 kB after minification. Consider:
- 第 71 行：- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
- 第 87 行：(!) Some chunks are larger than 500 kB after minification. Consider:
- 第 90 行：- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.

## 需要 Claude 决策（内容）

内容 warning 决策清单：空。严格日志明确记录 sprout.core 错误 0、警告 0，且未检测到告警明细或命令错误。

## 复现命令

以下供父任务按阶段执行，不是本生成器自动执行的命令。最终集成应取消子集环境变量；报告生成应在结果 JSON 和日志写完之后进行。

```sh
cd '<repo-root>/'
export pnpm_config_verify_deps_before_run=false
pnpm content:route
pnpm content:all --pack content/packs/sprout-core --prune
pnpm content:validate --pack content/packs/sprout-core --strict
pnpm content:bundle --pack content/packs/sprout-core
pnpm content:zip content/packs/sprout-core --out release/
pnpm content:zip content/examples/hello-pack --out release/
pnpm -r --workspace-concurrency=1 typecheck
pnpm content:typecheck
pnpm -r --workspace-concurrency=1 test
pnpm content:test
pnpm --dir plugins/examples/hello-plugin build
pnpm build
# 根 build 实际展开为：pnpm -r --workspace-concurrency=1 --filter './packages/*' --filter './apps/*' build
unset SPROUT_QA_PHASE SPROUT_QA_IDS
node scripts/qa-integration.mjs
node scripts/qa-verify.mjs
node scripts/qa-report.mjs
```

单独生成报告只需 `node scripts/qa-report.mjs`，无需 pnpm 或启动服务。所有输入/输出路径都由生成器的 `import.meta.url` 定位仓库根，运行目录不影响读取；报告仅写入 `docs/dev/qa-report.md`。

## 输入证据

| 文件 | 修改时间（Asia/Seoul） | 读取状态 |
| --- | --- | --- |
| qa-artifacts/integration-results.json | 2026-10-03 13:13:04 | JSON 可解析 |
| qa-artifacts/audio-coverage.json | 2026-10-03 12:55:17 | JSON 可解析 |
| content/packs/sprout-core/bundle.json | 2026-10-03 10:33:54 | JSON 可解析 |
| qa-artifacts/logs/tests.log | 2026-10-03 12:55:16 | 日志可读取 |
| qa-artifacts/logs/pipeline-tests.log | 2026-10-03 12:55:18 | 日志可读取 |
| qa-artifacts/logs/strict-validate.log | 2026-10-03 12:55:19 | 日志可读取 |
| qa-artifacts/logs/build.log | 2026-10-03 12:55:24 | 日志可读取 |
| qa-artifacts/verification-results.json | 2026-10-03 12:55:24 | JSON 可解析 |
