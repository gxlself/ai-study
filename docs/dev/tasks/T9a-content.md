# T9a — 内容流水线收口（路线合并 + 全量音频 + bundle）

## 所有权
`scripts/**`、根 `package.json` scripts、`content/packs/sprout-core/routes/sprout-core-route.json`（生成物）、`content/packs/sprout-core/routes/_stages/s4.json` 中**仅** `screen.childLessonsPerDay` 字段、`content/packs/sprout-core/audio/**`、`content/packs/sprout-core/bundle.json`、`release/`。
**不要修改**课程文案（`lessons/**` 只读）与词库（另一个任务正在扩充词库）。

## 任务
1. 执行 `docs/dev/tasks/T9-integration.md` 第 1 节全部内容（merge-route 脚本、content:all、音频覆盖率 100%、bundle、zip）。
2. 在 `_stages/s4.json` 的 screen 加 `"childLessonsPerDay": 1`。
3. 全包 `validate --strict`：0 error。warning 中属于课程内容的列入回报"需要 Claude 决策"，不要改课程。
4. 注意词库可能正在被扩充（新增词条，不删改旧词条），你的音频生成需在结束前再增量跑一次 `content:audio`，确保覆盖当时的词库。
