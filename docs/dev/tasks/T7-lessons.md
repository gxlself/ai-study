# T7-sN — 编写阶段 sN 的课程（N = 1…6，每个阶段一个 Codex）

## 所有权（只写你负责的阶段）
- `content/packs/sprout-core/lessons/sN/*.json`（本阶段每节课一个文件，文件名 = 课程 id 的 slug，如 `core.s3.find-animal` → `lessons/s3/find-animal.json`）
- `content/packs/sprout-core/routes/_stages/sN.json`（本阶段 `Stage` 对象，Claude 会合并为完整路线）
- `docs/curriculum/sN.md`（本阶段家长指南）

**只读**：`content/packs/sprout-core/lexicon.json`（词库，不得修改；缺词条时用最接近的已有词条替代，并在回报中列出"建议新增词条"）、`docs/curriculum/route-plan.md`、`docs/research/evidence-review.md`、`content/milestones/milestones.json`、`packages/schema/src/*.ts`、`docs/dev/activities.md`（若已存在）。

## 必须遵守
0. **课程类型（循证决策，最重要）**：先读 `docs/research/evidence-review.md` 第 9 节与 route-plan 的"屏幕策略"。
   - s1–s3 全部为**家长指引课**：`audience: "parent"`，steps 只能用 `guide`（必有，放第一步）和 `song`（家长学唱）；屏幕给家长看，宝宝的可视化材料通过 `printables`（打印实体卡）提供；`durationMin` 写家长阅读时长（2–3 分钟），guide 的 `playMin` 写陪玩时长（5–15 分钟）。
   - s4 按表中"类型"列：parent 同上；child 为亲子共看课（`audience: "child"`，`ageRange` 起点 ≥18，`durationMin` ≤8）。
   - s5–s6 全部 `audience: "child"`，`coView: "required"`。
   - guide 写法：`goal` 一句话；`steps` 3–6 步，每步一个具体动作（"把卡片放在宝宝眼前 20–30 厘米，慢慢向左移"），`say` 给出家长可说的中英短句；`observe` 写 2–3 条观察要点（"宝宝的眼睛是否跟着卡片移动"）；`safety` 写清风险；`concept` 可配示意图。
   - 每个 `offline` 活动尽量写 `question`（开放式问题）与 `levels`（easier / harder 两档），体现"引导式游戏"。
1. **以 `docs/curriculum/route-plan.md` 中你阶段的表格为准**：主题 id、周数、课程 id、标题、活动类型与要点都按表实现；表中写"?"或"用词库已有"的地方，选词库里存在且语义准确的词条。
2. Stage 对象：id `sN`；title/subtitle 中英；ageRange 按表（s1 [6,8]、s2 [9,11]、s3 [12,17]、s4 [18,23]、s5 [24,29]、s6 [30,36]）；focus 4–6 条中英；screen 按 route-plan 的屏幕策略表；themes（id 如 `s3-t1`，title 中英，description，weeks，domains，lessons 顺序，offlineFocus 2–4 条）；dailyRhythm 5–8 条（一日生活中的学习机会，如换尿布时说身体部位、吃饭时数勺子）；milestonesAt（本阶段覆盖的里程碑月龄，取 6/9/12/15/18/24/30/36 中落在阶段内或阶段末的）。
3. 课程 JSON 严格符合 `Lesson` schema：`schemaVersion: 1`、`themeId` = 所在主题、`ageRange` 落在阶段内（可向前/后延伸 ≤3 个月）、`domains` 按表（首个为主）、`durationMin` ≤ 阶段单次上限、`coView` 全部 `required`、`objectives` 1–3 条中英、`cover`（concept 选最具代表性的词条）。
4. **文字质量**（最重要）：
   - 中文：儿向语言，短句（s1–s3 每句 ≤ 12 字，s4–s6 ≤ 20 字），自然口语，标点用中文全角；不出现生僻字、成语堆砌。
   - 英文：简单、地道、语法正确；与中文意思一致（不必逐字）。
   - 积极、温暖、尊重；无恐吓式教育（不说"不听话就…"）、无性别刻板印象（爸爸也做饭、女孩也玩车）、家庭形态包容；不含危险示范。
   - 科学事实准确（动物习性、天气、身体）；不确定的不写。
5. **家长导语 parentGuide**：intro ≤160 字说清"这节课怎么陪"；tips 2–4 条可操作技巧（如"指着图慢慢说，停顿等宝宝回应"）；phrases 3–6 条家长可说的中英短句；why ≤120 字说明理念依据，并在 refs 中引用 `docs/research/evidence-review.md` 参考文献编号（如 "R5"，与该文件文献列表编号一致；若该文件编号形式不同，按其实际形式引用）。
6. **线下延伸 offline**（每课 1–2 个，屏幕外才是重点）：用家里常见物品；具体步骤 2–6 条；`safety` 必须写清相关风险（小物件直径 < 3.5cm 有窒息风险、水边全程看护、热/尖锐/高处等）；适龄。
7. 步骤 props 严格按 `packages/schema/src/activities.ts`：
   - 所有字符串 concept 引用必须存在于词库。
   - **story**：原创故事，每页一句到两句；场景 sprites 2–5 个，位置合理（x/y 为中心点百分比，地面上的物体 y≈70–80，天上的 y≈15–30，主体 size 30–45，配角 15–25），bg/ground 与情节相符；每课 1–3 页带 `prompts`（对话式阅读 CROWD/PEER：completion/recall/open/wh/distancing/point）。
   - **song**：只用公有领域旋律（route-plan 儿歌清单）；`notes` 使用正确的音高与节奏（以 C 大调或 F/G 大调常见版本为准），每行音符数（不含 R）**等于**该行中文字数或英文音节数，便于跟唱；中文原创词注明 credit："旋律：传统（公有领域）；中文词：芽芽成长原创"。
   - **count / subitize / choose(count)**：数量严格按表；`item` 用可数的具体物体。
   - **choose**：每轮 2–4 个选项、语义无歧义（例如问"哪个是红色的"时，干扰项不能也是红色）；`answer` 为选项 id。
   - **sort**：物体归属必须无争议（例如"水里/天上"不放会飞又会游的鸭子）。
   - **sequence**：步骤符合真实生活顺序。
   - **pattern**：序列至少重复两个完整单元再留空。
   - **movement**：动作安全、适龄（s1–s2 由家长带着做），seconds 合理。
8. 每写完一节课就用 `npx tsx scripts/validate-content.ts --pack content/packs/sprout-core` 或（脚本不可用时）用 tsx 调 `@sprout/schema` 的 `validateLesson` + 词库 id 集合自检，**零 error** 才算完成。
9. 不要修改其它阶段的文件，不要修改词库、脚本、schema。

## 阶段家长指南 `docs/curriculum/sN.md`
结构：本阶段宝宝在发展什么（引用研究与里程碑，通俗）→ 屏幕使用方式（时长、怎么陪、什么时候不用）→ 主题与课程一览（表格：课程、目标、线下延伸）→ 一日生活中的学习（dailyRhythm 展开）→ 中文与英语怎么带（语言模式建议、自然输入方式）→ 数学启蒙怎么带（生活中的数学）→ 本阶段里程碑观察（引用 milestones.json 对应月龄条目的中文，附"不是诊断工具"声明）→ 什么时候咨询医生（只写 CDC/卫健委通用建议：如失去已掌握的能力、对声音无反应等，措辞谨慎）。

## 回报
课程数量与清单、自检结果（validate 输出摘要）、使用的儿歌与旋律来源、建议新增的词条、任何你认为需要 Claude 决策的问题。
