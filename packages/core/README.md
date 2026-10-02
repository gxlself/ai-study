# @sprout/core

浏览器和 Node 共用的纯 TypeScript 逻辑，无文件系统、网络、时钟读取或随机数依赖。入口为 `src/index.ts`，导出 T1 的排课/屏幕/统计函数、`resolveChildMode`、`resolveSessionAudience`、`childScreenSeconds` 及 `Stats` 类型。输入为 schema 解析后的数据，所有函数均不修改输入。

## 验证

在仓库根运行：

```sh
pnpm --filter @sprout/core typecheck
pnpm --filter @sprout/core test
```

测试数据全部由 `test/fixtures.ts` 生成，不读取 `content/`。类型检查同时覆盖源码与测试。日期测试在独立 Vitest worker 内切换并恢复时区，覆盖 UTC、首尔、印度和纽约的本地午夜、夏令时切换及重复小时。

## 已落实的口径

- 月龄、日龄直接使用 schema 的 `ageOf`。主题起算日为生日加阶段起始月数，目标月没有对应日号时夹到月末。主题周序号从 0 起，以本地日历日计算，不用经过的小时数除以 24。
- 阶段年龄范围为闭区间；重叠时取路线顺序中的第一个匹配阶段。未覆盖的中间月龄返回 `null`，低于/高于整条路线范围则取首/末阶段。
- 主题轮换按主题原始索引及原始长度计算 `(index + localDay) mod length` 并升序排列，不因缺失或跳过课程重新编号。完成次数只计 `completed=true`；无效时间或计划日期之后的记录忽略。调用者负责提供近 60 天的历史。
- 严格按 pinned、当前主题、review、balance、当前主题余课的顺序填位。当前主题可占满全部名额，不预留 review。所有来源统一去重、排除 skipped、只选可用索引中的自有条目；skipped 也排除 pinned。
- review 只取上一主题的一课。“近 7 天”指今天及之前 6 个本地日，有任何 session 都算做过，包括未完成记录。第一主题不在本阶段内首尾回绕；手动主题的上一主题按该主题实际所属阶段定位。balance 仍只从年龄所属阶段中取主领域匹配的课，按路线顺序填剩余空位。
- 未满 18 月龄强制 parent-only；18 月龄以上显式 mode 优先，auto/缺省跟随阶段 childScreen。parent-only 所有来源包括 pinned 都只取 parent 指引课。共看模式允许两类课程。
- 预算使用 `dailyMaxMin`，不减去 `usedSec`；只尾删 child 共看课，parent 不占孩子预算，超过预算的单课也不例外保留。已用时间及窗口限制通过 `screen` 表达，禁用孩子屏幕时仍返回家长课程计划。
- `resolveScreenPolicy` 保持二参兼容，可选第三参数传实际月龄：18–23 月龄单次 ≤8 分钟，24+ ≤20 分钟且必须共看陪同。route 跨龄阶段应传实际月龄，二参时仅根据阶段下界计算。
- 屏幕窗口采用本地墙钟时间 `[start, end)`，支持跨午夜。空数组表示全天，起止相同表示零长度窗口；非法 HH:mm 和零长度窗口不开放时段。达到每日上限即禁止，优先返回 `daily-limit`。窗口外返回下一次有效开始时间的 HH:mm，可以是次日。
- 课程摘要包含 audience（缺省 child）与 hasPrintables。保留原始 cover 字段，包内图片默认映射为 `/packs/<packId>/<path>`，已有绝对路径或 URL 原样保留；传入的图片 resolver 优先。纯 concept 封面不猜测词库图片。`stepTypes` 按首次出现顺序去重。
- 统计窗口为包含今天的最近 `days` 个本地日，按日期升序补零。`lessons` 为 session 次数，不按课程去重；`completed` 为完成记录次数。parent 不进入屏幕秒数/总时长/领域秒数，但仍记录学习次数。Session 显式 audience 优先，缺失按课索引回退，未知课保守计 child。
- 领域秒数只归属课程 `domains[0]`，包含未完成 session 的全时长，不拆分、不向副领域重复累计。`domains` 仅包含实际遇到的主领域。
- `streakDays` 以窗口内有 session 的日子计算，未完成和零时长记录也算；今天没有记录时从昨天开始回溯，遇到空日停止，最长不超过请求的 `days`。非有限、非正 `days` 返回空统计，小数向下取整。

## 契约待确认

当前契约没有明确阶段重叠/空档、等起止窗口、review 的七日边界、跨阶段手动主题的 review/balance、摘要步骤类型是否去重、统计次数和 streak 的详细语义；上文列出了本实现的确定性约定，测试已固定这些行为，未修改任何契约文件。

schema 的 `ageOf` 按生日的原始日号计算整月，和主题起算的月末夹取不完全相同。例如 `2024-01-31` 出生，到 `2024-02-29` 仍为 0 整月，到 `2024-03-01` 才为 1 整月。实现遵循任务要求调用该函数；若希望月龄也按月末生日计算，需由契约维护者统一处理。
