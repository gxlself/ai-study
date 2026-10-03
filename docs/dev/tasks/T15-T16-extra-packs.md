# T15 / T16 — 扩展内容包（验证"后续新内容接入"流程）

## 共同要求
- 每个包是独立目录 `content/packs/<dir>/`，完整遵循 `docs/dev/content-pack-guide.md`（内容包制作指南）与 `docs/dev/tasks/T7-lessons.md` 的全部质量规则（循证、安全、温暖、中英准确、audience 规则：<18 月只能 parent 课，child 课起始月龄 ≥18、必须陪同）。
- 词条优先引用 `sprout.core` 词库（只读）；需要新词条时写在**本包自己的** `lexicon.json`（id 加前缀避免冲突，如 `fest-lantern`），图片映射写本包 `assets/sources.json`，自绘 SVG 放本包。
- 本包不提供 route（家长在后台课程库浏览、置顶）；pack.json `routes: []`。在包根写 `README.md`：内容说明、适龄、如何导入、素材许可。
- 完成后对本包运行：`pnpm content:assets --pack <dir>` → `pnpm content:audio --pack <dir>` → `pnpm content:validate --pack <dir> --strict`（0 error 0 warning）→ `pnpm content:bundle --pack <dir>` → `pnpm content:zip <dir> --out release/`。
- 所有权：仅 `content/packs/<你的目录>/**` 与 `release/<你的包>.zip`。不得修改 scripts、schema、core 包、其它包。脚本若有阻塞性 bug，写进回报。
- 只用公有领域旋律；文化内容以通行、温和、适合幼儿的方式呈现，避免迷信化、恐吓化表述（例如"年兽"故事要温和或不讲）；鞭炮/烟花只作为安全提示出现（远离、捂耳朵、由大人在合规场所燃放或不放）。

## T15 `content/packs/sprout-culture/`（包 id `sprout.culture`，name 中国传统节日 / Chinese Festivals）
约 12 节：春节（贴福字、拜年说"新年好 Happy New Year"、包饺子亲子活动）、元宵（灯笼、汤圆——安全：圆形黏食对幼儿有窒息风险，3 岁以下不建议整颗吃，切小/压扁并看护）、清明（春天踏青、种子）、端午（粽子（同样注意黏性食物）、香囊、划龙舟动作游戏）、中秋（月亮、月饼、赏月、团圆）、重阳（看望爷爷奶奶）、冬至（饺子/汤圆）、生日与家庭节日。每个节日 1 节家长指引课（6–36 月可用）+ 部分节日 1 节共看课（24–36 月，故事或 word-cards + choose），共看课 ≤10 分钟。
## T16 `content/packs/sprout-english/`（包 id `sprout.english`，name 英语日常 / Everyday English）
约 12 节：研究依据是"英语启蒙要靠真人互动、儿歌和固定短语，看视频几乎无效"（docs/research 第 4 节）——所以以**家长指引课为主**：每节给家长 5–8 句可以在日常场景里说的英文短语（起床 Good morning、穿衣 Arms up、吃饭 More please / All done、洗手 Wash wash wash、收玩具 Clean up、出门 Let's go、睡前 Good night、情绪 I feel happy），配发音提示（中文谐音不要用，给音标或"慢读"音频）与 TPR 动作游戏（Stand up / Sit down / Touch your nose / Jump）；24–36 月 3–4 节共看课（movement 跟做 TPR、song 原创词 + 公有领域旋律、word-cards 日常物品）。英文必须地道自然（美式常用表达），每句都有中文意思。
