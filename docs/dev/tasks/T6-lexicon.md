# T6 — 核心词库（中英双语概念卡）+ 素材映射 + 自绘图形

## 所有权
`content/packs/sprout-core/lexicon.json`、`content/packs/sprout-core/assets/sources.json`、`content/packs/sprout-core/assets/images/**` 中 **source=custom 的自绘 SVG**、`docs/curriculum/lexicon.md`（新建：词库总表，供家长查阅）

Fluent Emoji 文件由 T5 的脚本下载，你只写映射；但你**必须确认每个映射名真实存在**：自己拉取 `https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1`（可缓存到你的临时目录，不要写进 scripts/），逐条核对 `assets/<Name>/...` 路径存在，并在回报中附核对结果。

## 格式（契约）
- `lexicon.json`：`Lexicon`（`packages/schema/src/lexicon.ts`），schemaVersion 1。
- `sources.json`：见 `docs/dev/tasks/T5-pipeline.md` 的"约定"。
- 图片路径统一：`assets/images/<category>/<id>.svg`。

## 内容要求（面向 6–36 月中国家庭，**准确第一**）
- 约 220 个词条，覆盖：animals(~30)、fruits(~12)、vegetables(~8)、food(~12，含 奶/水/米饭/面条/鸡蛋/馒头或包子/饺子)、vehicles(~12)、body(~10)、family(~10：妈妈、爸爸、宝宝、奶奶、爷爷、外婆、外公、哥哥、姐姐、弟弟/妹妹按需；奶奶/外婆可共用老奶奶图，英文均为 grandma，在 tags 标注 paternal/maternal)、home(~20：杯子、勺子、碗、床、椅子、牙刷、毛巾、肥皂、门、灯、书、钟…)、clothes(~10)、nature(~16：太阳、月亮、星星、云、雨、雪、彩虹、树、花、叶子、水、山、风…)、colors(10：红橙黄绿蓝紫粉棕黑白)、shapes(8：圆形、正方形、三角形、长方形、星形、心形、椭圆形、菱形)、numbers(0–10)、emotions(8：开心、难过、生气、害怕、惊讶、困了、平静、爱)、actions(~14：拍手、挥手、举手、走、跑、跳、跳舞、睡觉、吃饭、喝水、刷牙、洗手、抱抱、坐下)、toys(~10：球、泰迪熊、积木、气球、风筝、拼图、鼓…)、music(~8)、places(~6：家、学校/幼儿园、医院、商店、公园…)、other（`sprout` 小芽，应用吉祥物）。
- 每个词条：`zh` 用孩子常用叫法（"小狗""小猫""苹果""汽车"），`en` 小写单数常用词，`pinyin` 带声调（对应 zh），`measure` 正确量词（只/头/匹/条/个/辆/架/艘/朵/棵/本/把/张/件/双/块/片/颗…，**必须准确**，不确定时用"个"且在回报中列出），`plural` 仅不规则复数填写（sheep、mice、fish、feet、teeth、children、geese、people…），动物填 `sound`（中文常用拟声 + 英文常用拟声，如 小狗 汪汪 / woof woof；猫 喵喵 / meow；牛 哞 / moo；没有公认拟声的动物不填），适合的词条填 `phrase`（一句简单的描述，中英意义一致，≤10 个汉字，如 "小鸭子会游泳 / The duck can swim."），颜色填 `color`（柔和但可辨识的 hex），数字填 `value`。
- id：小写英文，唯一，见名知意（dog、grandma-paternal、num-3、red、circle、brush-teeth）。
- 不放可能引起不适的词条（武器、恐怖形象、危险行为示范）；"火"如收录需 tags `safety`，phrase 为安全提示（"火很烫，不能摸"）。
- emoji 选择：优先 Fluent "Color" 风格（渐变彩色 SVG）；人物类用 Default（黄色）肤色；家人用 Man/Woman/Old man/Old woman/Boy/Girl/Baby；动作类用合适的手势/人物 emoji。确保图片真实表达词义（例如 "rain" 用 Cloud with rain，"snow" 用 Snowflake；"milk" 用 Glass of milk）。
- **自绘 SVG**（source=custom）：shapes 8 个（统一用柔和蓝 #5DA9E9 填充 + 稍深描边，圆角，居中，viewBox 0 0 256 256，留 12% 边距）、colors 10 个（同一种"颜料团/圆形色块"造型，各自颜色，带轻微高光；黑与白要在奶油背景上可辨：白色加浅灰描边）、numbers 0–10（圆润粗体数字，单色暖橙 #F08A5D，用 path 或 `<text>` 均可，若用 text 需指定通用字体族并确保居中；更推荐 path）、积木 blocks（若 Fluent 无合适图）、`sprout` 吉祥物（两片嫩叶的小芽，可爱，带小脸可选）。风格：扁平、圆润、无文字（数字除外）、与 Fluent Color 风格协调。

## 文档
`docs/curriculum/lexicon.md`：按类别列出全部词条表格（图片路径、中文、拼音、英文、量词、拟声），以及选词原则（参考 MacArthur-Bates CDI 早期词汇类别与中国家庭日常词汇；双语对照）。

## 验收
- 用 `npx tsx -e` 加载 `@sprout/schema` 的 `Lexicon` 解析通过、`validateConcepts` 无 error、所有 custom 图片文件存在且为合法 SVG、所有 fluent 映射在仓库树中存在（附统计）。
- 在回报中列出：词条总数（按类别）、量词不确定项、拟声不确定项。
