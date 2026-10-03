# T11-<stages> — 课程升级：换用新增词条

## 所有权
仅你负责阶段的 `content/packs/sprout-core/lessons/<stage>/*.json` 与 `docs/curriculum/<stage>.md`。
## 任务
读 `docs/curriculum/lexicon-upgrade-map.md` 与新版 `lexicon.json`：把本阶段课程中用近似词条代替的地方换成新词条（printables、guide 插图、story sprites、choose/word-cards 选项等），**不改变课程结构与教学设计**，只提升图文准确度；同时修正你在复读中发现的明显文字问题（错别字、中英不一致），重大改动写进回报。每改一节跑一次校验（`npx tsx scripts/validate-content.ts --pack content/packs/sprout-core`，只看本阶段相关问题），保持 0 error。更新阶段文档中"建议新增词条"段落为"已采用 / 仍待补充"。
