# 所有 Codex 任务的共同规则（必读）

项目：芽芽成长 Sprout —— 6 个月–3 岁亲子共学大屏课程（电视/iPad 播放端 + 后台 + 插件化内容）。
仓库根：`<repo-root>`（pnpm workspace，Node 22，依赖已装好）。

## 开工前必读
1. `docs/dev/architecture.md`（架构、目录所有权、技术选型——已定，不讨论）
2. `packages/schema/src/*.ts`（数据契约，唯一事实来源）
3. 与你任务相关的：`docs/dev/api.md`、`packages/plugin-sdk/src/types.ts`、`packages/plugin-sdk/src/tokens.css`、`docs/dev/visual-guidelines.md`
4. 你自己的任务单 `docs/dev/tasks/T*-*.md`

## 硬规则
- **只修改你任务单"所有权"列出的目录/文件。** 有其他多个 Codex 正在并行修改其它目录，越界会互相覆盖。需要别的模块改动时，写进最终回报的"需要协调"一节，不要自己改。
- `packages/schema/src/**` 与 `packages/plugin-sdk/src/types.ts`、`tokens.css` 是契约：**不得修改**（若发现无法编译的错误，可做最小修复并在回报中逐条说明）。
- 依赖已预装。确需新依赖：`pnpm --filter <你的包名> add <dep>`；若报锁冲突，等待 30 秒重试。不要删除/改写他人 package.json。不要运行 `pnpm install --force` 或删除 node_modules。
- TypeScript strict；代码注释用中文、简洁，只在必要处写。不要留 TODO 糊弄；做不到的写进回报。
- 内容安全：面向婴幼儿，任何文字/图片不得含暴力、恐怖、不当内容；不得引入广告、追踪、外部统计。
- 不要 `git commit`（由 Claude 统一验收后提交），不要改 git 配置。
- 不要启动常驻进程后不关；需要启动服务验证时，用完 kill 掉。端口：server 4310，player dev 5310，admin dev 5311，activities playground 5312（别的任务可能同时占用端口，必要时用 +100 的备用端口，如 4410）。

## 完成标准
- 你负责的包 `pnpm --filter <包> typecheck` 通过，`test` 通过（写有意义的单元测试）。
- 有 build 脚本的包 `build` 通过。
- 最终回复（会被 Claude 读取）用中文，结构：
  1. 完成内容清单（文件/功能）
  2. 如何运行 / 验证（命令）
  3. 测试结果（命令 + 结果摘要）
  4. 已知问题 / 未完成项
  5. 需要协调（需要其他模块配合的改动）
