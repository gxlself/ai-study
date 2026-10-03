# T10 — 词库扩充（第二批）

## 所有权
同 T6：`content/packs/sprout-core/lexicon.json`（**只新增词条，不得修改或删除已有词条的 id 与字段**）、`assets/sources.json`、新增自绘 SVG、`docs/curriculum/lexicon.md`；完成后运行 `pnpm content:assets --pack content/packs/sprout-core` 下载新增 Fluent 素材（0 错误）。

## 新增词条（来自各阶段写课 Codex 的建议，汇总在 docs/curriculum/s1..s6.md 的"建议新增词条"段落，请全部读取后去重）
至少包括：mirror 镜子、shoulder 肩膀、knee 膝盖、hair 头发、rain-boots 雨靴、ramp 斜坡（可自绘）、duckling 小鸭、wheel 轮子、plate 盘子、toothpaste 牙膏、teacher 老师、slide 滑梯（可自绘）、underwear 内衣/内裤（用衣物类合适 emoji 或自绘，得体）、wake-up 起床、wash-face 洗脸、seedling 幼苗、sapling 长叶小苗（可自绘）、single-block 单块积木（自绘）、caregiver 照护者（可用合适人物）。各阶段文档中的其它合理建议一并加入（总新增建议 20–40 条）。
规范、量词、复数、拟声、phrase、图片选择与核对方法全部遵循 `docs/dev/tasks/T6-lexicon.md`。
## 产出
回报中给出"新增词条 id → 建议替换哪些课程中的哪个近似词条"的映射表（供后续课程升级任务使用），并写入 `docs/curriculum/lexicon-upgrade-map.md`。
