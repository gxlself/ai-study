# 成长路线规划（课程编写的唯一依据）

> 路线 id `sprout.core.route`，6 个阶段 × 4–6 个主题 × 每主题 3 节课 = 96 节（家长指引课 54 + 亲子共看课 42）。
> 编写课程 JSON 时，**课程 id、主题 id、活动类型、核心内容以本表为准**；细节（文案、场景、家长导语、线下活动）由编写者按 `docs/dev/tasks/T7-lessons.md` 规则补全。
> 数学、英语不是"单独上课"，而是像线一样贯穿：每节课都按语言模式中英双语；数学概念（数量、比较、形状、规律、空间、顺序）在各主题中螺旋上升。

## 贯穿线（螺旋上升）

| 线 | 6–8 月 | 9–11 月 | 12–17 月 | 18–23 月 | 24–29 月 | 30–36 月 |
|---|---|---|---|---|---|---|
| 中文语言 | 听名字、儿向语言、儿歌节奏 | 叫名反应、手势（拜拜/拍手）、理解简单词 | 指认常见物、第一批词 | 词汇爆发、两词句 | 短句、对话式阅读 | 完整句、讲述、问为什么 |
| 英语启蒙 | 英文儿歌韵律 | 英文儿歌 + 问候 | 常见物英文名（听） | 英文名 + 简单短语 | 短句、指令 | 简单对话短语（please/thank you） |
| 数学思维 | （歌谣节奏 = 规律的萌芽） | 还要/没有了（more / all gone） | 一个与很多、数 1–2 | 数 1–3、大与小、形状 | 数 1–5、一眼看出 1–3、分类、空间方位 | 数 1–10、一眼看出 1–5、规律 AB、多与少、顺序 |
| 认知/科学 | 高对比视觉、追视 | 物体恒存、因果 | 动物/身体/交通 | 颜色/形状/大小 | 动物的家、天气 | 生命周期、昼夜、四季 |
| 社会情绪 | 面孔、依恋 | 互动游戏、分离小游戏 | 家人、模仿 | 情绪命名、安抚 | 轮流、分享、同理 | 入园准备、礼貌、自理 |
| 动作/音乐 | 趴、够、坐 | 爬、扶站、拍手 | 走、模仿动作 | 跑、跳、跟节拍 | 平衡、动作序列 | 动作规律、律动游戏 |

## 屏幕策略（循证决策，见 docs/research/evidence-review.md 第 9 节）

**两类课程**（`Lesson.audience`）：
- **家长指引课 `parent`**：屏幕给家长看（活动卡 `guide` / 儿歌学唱 `song`），读 1–3 分钟后屏幕变暗成陪玩计时器，真正的学习在屏幕外；配套**可打印实体卡片**（`printables`）作为宝宝的"可视化学习材料"。不计入孩子屏幕时间。
- **亲子共看课 `child`**：面向孩子的慢节奏互动，**必须家长陪同**（不提供儿童独自模式），每节结束都有线下延伸。起始月龄 ≥ 18。

| 阶段 | 月龄 | 课程类型 | 共看课单次上限 | 共看课每日上限 | 每日课数 | childScreen |
|---|---|---|---|---|---|---|
| s1 感知世界 | 6–8 | 全部家长指引课 | — | — | 2 | none |
| s2 互动探索 | 9–11 | 全部家长指引课 | — | — | 2 | none |
| s3 词语萌芽 | 12–17 | 全部家长指引课 | — | — | 2 | none |
| s4 语言爆发 | 18–23 | 每主题 2 家长指引 + 1 共看 | 8 分钟 | 10 分钟（1 节） | 2 | optional（默认关，家长可在后台开启） |
| s5 小小思考者 | 24–29 | 共看课 | 10 分钟 | 20 分钟 | 2 | default |
| s6 准备入园 | 30–36 | 共看课 | 15 分钟 | 30 分钟 | 2 | default |

硬性：共看课单次 ≤20 分钟（中国 2022 指南）；全天所有屏幕合计 ≤60 分钟、越少越好；默认可用时段 08:00–18:30（睡前 1 小时、用餐时不用）；s1–s4 的 `screen.coView` = `required`，s5–s6 也为 `required`（研究：不提供儿童独自模式）。
`screen` 字段写法：s1–s3 `{sessionMaxMin:3, dailyMaxMin:10, lessonsPerDay:2, coView:'required', childScreen:'none'}`（session/daily 此时约束家长阅读时长提示）；s4 `{8,10,2,'required','optional'}`；s5 `{10,20,2,'required','default'}`；s6 `{15,30,2,'required','default'}`。

## 儿歌（只用公有领域旋律；中文词为传统词或本项目原创词）
小星星（Twinkle Twinkle，C 大调）· 两只老虎（Frère Jacques）· 王老先生有块地（Old MacDonald）· 如果感到幸福你就拍拍手（If You're Happy）· 头发肩膀膝盖脚（Head Shoulders Knees and Toes）· 划船歌（Row Row Row Your Boat）· 小雨快走开（Rain Rain Go Away）· 这样洗洗手（Mulberry Bush 旋律，原创词）· 玛丽有只小羊羔（Mary Had a Little Lamb）· 摇篮曲（Brahms Lullaby）· 小蜘蛛（Itsy Bitsy Spider）· 数鸭子（原创词，Mulberry Bush 或自编简单旋律）· 汽车开呀开（原创词，Mulberry Bush 旋律）。
**不用**：受版权保护的现代儿歌（如《小兔子乖乖》《拔萝卜》《世上只有妈妈好》《The Wheels on the Bus》原词），以及有不当历史背景的歌（如 Ten Little Indians）。

---

## s1 感知世界 Sensing the World（6–8 月）——全部家长指引课
重点：面对面"你来我往"（serve & return）、儿向语言、高对比追视（**实体卡片**）、物体恒存萌芽、儿歌韵律、每天俯卧累计 ≥30 分钟。
每课 = `guide`（必有）+ 可选 `song`（家长学唱）+ 可选 `printables`。

| 主题 | 周 | 课程 id | 标题 | 内容要点 | printables | 领域 |
|---|---|---|---|---|---|---|
| s1-t1 黑白红的世界 Black, White & Red | 3 | core.s1.contrast-shapes | 黑白卡片追视 | guide：卡片离眼 20–30cm，缓慢左右/上下移动，观察眼神追随，边看边说 | contrast bw: bullseye, stripes, checker, circle, dots | cognition |
| | | core.s1.contrast-faces | 看看脸，说说话 | guide：面对面夸张表情、模仿宝宝的咿呀、停顿等回应（回合对话）；配笑脸卡 | contrast bw: face, heart, dots | social, language |
| | | core.s1.tummy-time | 趴一趴，看一看 | guide：俯卧时把黑白红卡立在面前、家长趴下来与宝宝平视；每次几分钟、每天累计 ≥30 分钟 | contrast bwr: circle, star, heart, spiral | motor |
| s1-t2 你好，宝宝 Hello, Baby | 3 | core.s1.family-faces | 爸爸妈妈和宝宝 | guide：用家人照片（建议后台上传真实照片）指认与命名；叫宝宝名字等回应 | cards: mom, dad, baby, grandma-paternal, grandpa-paternal | social, language |
| | | core.s1.my-face | 眼睛鼻子嘴巴 | guide：换尿布/照镜子时轻触并命名五官（中英） | cards: eye, nose, mouth, ear | language, science |
| | | core.s1.twinkle | 小星星 | song（家长学唱：中文两段 + 英文一段）+ guide：抱在怀里唱、手指一闪一闪 | — | music, english |
| s1-t3 躲猫猫 Peekaboo | 3 | core.s1.peekaboo-hands | 躲猫猫 | guide：用手/纱巾遮脸，"宝宝在哪里？""在这儿！"，节奏放慢等宝宝期待 | — | social, cognition |
| | | core.s1.hide-toy | 玩具藏起来 | guide：玩具半盖在布下 → 全盖住，鼓励宝宝掀开（物体恒存） | cards: dog, cat, duck（做成可藏的卡） | cognition |
| | | core.s1.mirror | 镜子里的宝宝 | guide：安全镜子前互动、命名宝宝与家长、做表情 | — | social |
| s1-t4 动物的声音 Animal Sounds | 4 | core.s1.farm-sounds | 小动物怎么叫 | guide：拿卡或玩具，学叫声，等宝宝发声后回应 | cards: dog, cat, cow, duck | language, science |
| | | core.s1.old-macdonald | 王老先生有块地 | song（中 + 英）+ guide：唱到哪个动物举起哪张卡 | cards: cow, pig, duck, sheep | music, english |
| | | core.s1.lullaby | 摇篮曲 | song（Brahms，bpm 60，家长学会后**睡前不开屏幕**、直接哼唱）+ guide：睡前固定流程 | — | music, life |

## s2 互动探索 Interacting（9–11 月）——全部家长指引课
重点：因果、物体恒存、手势与模仿（拍手/挥手/指）、联合注意、"还要/没有了"、自主进食命名。

| 主题 | 周 | 课程 id | 标题 | 内容要点 | printables | 领域 |
|---|---|---|---|---|---|---|
| s2-t1 因果与藏找 Cause & Effect | 3 | core.s2.real-bubbles | 吹泡泡 | guide：家长吹真泡泡，宝宝追视/伸手，"泡泡！还要吗？"（安全：泡泡水勿入口/眼） | — | cognition, math |
| | | core.s2.in-and-out | 放进去，拿出来 | guide：积木/大块玩具放进盒子再倒出，"进去了""出来了"（空间词）；物件需大于 3.5cm | — | math, motor |
| | | core.s2.under-cup | 杯子下面有什么 | guide：玩具藏在 1 个→2 个杯子下，找一找 | cards: ball, teddy-bear, duck | cognition |
| s2-t2 拍拍手挥挥手 Clap & Wave | 3 | core.s2.clap-wave | 拍手和挥手 | guide：模仿游戏（拍手、挥手拜拜、做蛋糕拍拍 pat-a-cake） | — | motor, social |
| | | core.s2.if-happy | 如果感到幸福你就拍拍手 | song（中 + 英）+ guide：带动作唱 | — | music, english |
| | | core.s2.hello-bye | 你好和拜拜 | guide：门口迎送的问候仪式（你好/拜拜，hello/bye-bye），家人轮流示范 | — | social, english |
| s2-t3 好吃的 Yummy Food | 3 | core.s2.fruits | 认识水果 | guide：吃饭时摸、闻、尝真水果并命名（安全：葡萄等圆形食物纵向切成四份；软烂、小块） | cards: apple, banana, orange, watermelon, strawberry | language, english |
| | | core.s2.more-all-gone | 还要和没有了 | guide：进餐时的数字谈话："还要吗？""没有了！""一块、两块" | — | math, language |
| | | core.s2.mealtime | 吃饭啦 | guide：命名碗勺杯、让宝宝自己抓握进食、给二选一 | cards: bowl, spoon, cup, milk, rice | life, language |
| s2-t4 家里的东西 Things at Home | 3 | core.s2.home-things | 这是什么 | guide：跟随宝宝的目光/手指命名（联合注意），"你在看灯！灯亮了" | cards: cup, ball, book, shoes, bed | language |
| | | core.s2.goodnight | 晚安小书 | guide：把打印卡做成"晚安"小书，白天共读：指一指、说名字、等回应 | cards: moon, star, bed, bird, cat | language, life |
| | | core.s2.row-boat | 划船歌 | song（Row Row Row Your Boat + 中文原创词）+ guide：坐在腿上前后摇 | — | music, english, motor |

## s3 词语萌芽 First Words（12–17 月）——全部家长指引课
重点：指认（"哪个是…？"）、第一批词、模仿与假装、一个与很多、生活常规、户外探索。

| 主题 | 周 | 课程 id | 标题 | 内容要点 | printables | 领域 |
|---|---|---|---|---|---|---|
| s3-t1 动物朋友 Animal Friends | 4 | core.s3.farm-animals | 农场动物 | guide：卡片/玩具指认命名 + 叫声，等宝宝模仿 | cards: cow, pig, sheep, horse, chicken | language, science |
| | | core.s3.find-animal | 哪个是小狗？ | guide：地上放 2 张卡，"小狗在哪里？"让宝宝指/爬过去拿（理解性词汇） | cards: dog, cat, duck, fish, bird, rabbit | language, cognition |
| | | core.s3.duck-mom | 小鸭子找妈妈 | guide：用卡片当道具讲故事（脚本写在步骤里），问"是妈妈吗？" | cards: duck, chicken, cow, dog | language, social |
| s3-t2 我的身体 My Body | 4 | core.s3.body-parts | 我的身体 | guide：洗澡/穿衣时"鼻子在哪里？"，宝宝指自己再指家长 | cards: eye, ear, nose, mouth, hand, foot | language, science |
| | | core.s3.touch-nose | 摸摸小鼻子 | guide：动作游戏（摸鼻子、拍肚子、跺跺脚、举手） | — | motor, language |
| | | core.s3.head-shoulders | 头、肩膀、膝盖、脚 | song（中 + 英）+ guide：慢速带动作唱 | — | music, english, motor |
| s3-t3 车车出发 Let's Go | 4 | core.s3.vehicles | 嘀嘀叭叭 | guide：窗边/散步时看车、命名、学声音 | cards: car, bus, train, airplane, boat | language |
| | | core.s3.roll-car | 小车滑下去 | guide：用书/纸板搭斜坡滑小车："下去了！快/慢"（因果、物理初体验） | — | science, math |
| | | core.s3.car-song | 汽车开呀开 | song（原创词，Mulberry Bush 旋律，中 + 英）+ guide | — | music, english |
| s3-t4 一个和很多 One & Many | 4 | core.s3.one-many | 一个和很多 | guide：零食/积木"给你一个""这里有很多" | — | math |
| | | core.s3.count-two | 一、二 | guide：生活中数 1–2（两只手、两只鞋），数完说总数"两只鞋" | — | math, language |
| | | core.s3.two-tigers | 两只老虎 | song（两只老虎 + Are You Sleeping）+ guide | — | music, english |
| s3-t5 穿衣服 Getting Dressed | 4 | core.s3.clothes | 我的衣服 | guide：穿衣时命名、让宝宝伸手配合、二选一 | cards: hat, shirt, pants, socks, shoes | life, language |
| | | core.s3.dress-up | 出门啦 | guide：出门流程卡（袜子→鞋子→帽子→出门），贴在门边 | cards: socks, shoes, hat | life |
| | | core.s3.wash-hands | 洗手歌 | song（这样洗洗手，原创词 Mulberry Bush）+ guide：洗手流程 | — | life, music |
| s3-t6 去户外 Outdoors | 6 | core.s3.outdoors | 外面有什么 | guide：户外散步命名、摸树叶、捡落叶（每天户外活动） | cards: sun, tree, flower, bird, cloud | science, language |
| | | core.s3.rain-day | 下雨天 | guide：听雨声、穿雨靴踩水坑、撑伞（安全：防滑、看护） | — | science, motor |
| | | core.s3.little-tree | 像小树一样 | guide：模仿动物/植物动作（站直像小树、飞像小鸟、跳像小兔） | — | motor |

## s4 语言爆发 Word Explosion（18–23 月）——每主题 2 家长指引 + 1 共看（共看默认关闭）
重点：词汇爆发与两词句、颜色形状大小、数到 3、情绪命名与安抚、自理习惯。共看课 ≤8 分钟，结束立刻去线下操作。

| 主题 | 周 | 课程 id | 类型 | 标题 | 内容要点 | 领域 |
|---|---|---|---|---|---|---|
| s4-t1 颜色 Colors | 4 | core.s4.color-hunt | parent | 找颜色 | guide：家里找红色的东西、按颜色收袜子；printables cards: red, yellow, blue | cognition, english |
| | | core.s4.find-red | child | 红色在哪里？ | word-cards(red, yellow, blue) + choose(3 轮，干扰项颜色明确不同) | cognition, language |
| | | core.s4.scribble | parent | 涂鸦彩虹 | guide：粗蜡笔涂鸦、命名颜色（安全：无毒蜡笔、看护勿入口） | art, cognition |
| s4-t2 形状 Shapes | 4 | core.s4.shape-hunt | parent | 找圆形 | guide：家里找圆的（盘子、钟、球），形状配对玩具；printables cards: circle, square, triangle | math |
| | | core.s4.circle-friends | child | 圆圆找朋友 | story(5 页：太阳、皮球、饼干、轮子都是圆的；prompts) + choose(2 轮找圆形) | math, language |
| | | core.s4.blocks | parent | 搭积木 | guide：叠高 3–4 块、推倒再搭，"高了！倒了！"（空间、因果） | math, motor |
| s4-t3 数一数 1-2-3 | 4 | core.s4.count-three | child | 数到三 | count(1 bird、2 fish、3 apples；guided) + choose(哪边多：1 vs 3) | math |
| | | core.s4.count-life | parent | 生活中数一数 | guide：数台阶、勺子、鞋（≤3），**数完说总数**；对眼前实物点数 | math, language |
| | | core.s4.one-two-three | parent | 一二三，木头人 | guide：数到 3 定住的动作游戏 | math, motor |
| s4-t4 我的心情 Feelings | 4 | core.s4.feelings | parent | 开心和难过 | guide：日常命名情绪、照镜子做表情；printables cards: happy, sad, angry, scared | social, language |
| | | core.s4.bear-angry | child | 小熊生气了 | story(6 页：积木倒了小熊生气→妈妈说"你生气了"→一起深呼吸→重新搭) + calm(balloon) | social |
| | | core.s4.calm-down | parent | 情绪来了怎么办 | guide：命名情绪→抱抱/深呼吸→给两个选择（情绪辅导） | social |
| s4-t5 洗洗刷刷 Clean & Healthy | 4 | core.s4.brush-teeth | parent | 刷牙 | guide：每天两次，3 岁以下米粒大小含氟牙膏、家长帮刷（遵循儿科/口腔指南） | life |
| | | core.s4.bath-time | parent | 洗澡玩水 | guide：沉浮游戏、命名身体部位（安全：全程不离开、水温） | life, science |
| | | core.s4.wash-song | child | 这样洗洗手 | song(原创词 Mulberry Bush：洗手/刷牙/梳头) + sequence(show 洗手四步) | music, life |
| s4-t6 大和小 Big & Small | 6 | core.s4.big-small | child | 大象和小老鼠 | story(5 页) + choose(3 轮找大的/小的，scale 1.2 vs 0.6) | math, language |
| | | core.s4.nesting | parent | 套杯子 | guide：套杯/大小碗排序，"大的、小的、更小的" | math |
| | | core.s4.grow-big | parent | 变大变小 | guide：蹲下变小、站起变大、伸手变高 | motor, math |

## s5 小小思考者 Little Thinker（24–29 月）——亲子共看课（audience child，coView required）
重点：数到 5 与一一对应、一眼看出 1–3、分类、空间方位、动物与自然常识、轮流分享。

| 主题 | 周 | 课程 id | 标题 | 步骤 | 领域 |
|---|---|---|---|---|---|
| s5-t1 分一分 Sorting | 4 | core.s5.sort-color | 红的和蓝的 | sort(bins 红/蓝；物体：apple, strawberry, tomato, blueberries, (blue)car? 用词库中主色明确的物体) | math, cognition |
| | | core.s5.sort-kind | 动物和水果 | sort(bins 动物/水果；6 个物体) | cognition |
| | | core.s5.odd-one | 哪个不一样？ | choose(4 轮：3 个同类 + 1 个不同类，"哪个不一样？") | cognition, math |
| s5-t2 数到五 Count to 5 | 4 | core.s5.count-five | 数到五 | count(3 轮：3 ducks、4 apples、5 stars；scatter/row) | math |
| | | core.s5.quick-look | 一眼看出几个 | subitize(4 轮：1、2、3、2；dice) | math |
| | | core.s5.five-ducks | 五只小鸭子 | song(原创词：五只小鸭去游泳，一只一只回家，倒数 5→1；简单旋律) + count(5 ducks) | math, music |
| s5-t3 动物的家 Animal Homes | 4 | core.s5.animal-homes | 谁住在哪里 | sort(bins 水里/天上；fish, whale, bird, butterfly, duck?→避免歧义只用明确的) | science, cognition |
| | | core.s5.wild-animals | 动物园 | word-cards(elephant, lion, giraffe, monkey, panda, zebra；name+phrase) | science, english |
| | | core.s5.panda-story | 熊猫的一天 | story(6 页：熊猫吃竹子、爬树、睡觉——真实习性) | science, language |
| s5-t4 轮流与分享 Taking Turns | 4 | core.s5.take-turns | 轮流玩滑梯 | story(6 页：小兔和小熊抢滑梯→排队轮流→一起开心) | social |
| | | core.s5.how-feel | 他觉得怎么样？ | choose(3 轮：情境图 + 情绪脸选择：气球飞走了→难过) | social, language |
| | | core.s5.thank-you | 请和谢谢 | story(4 页：please / thank you / sorry / you're welcome 场景) | social, english |
| s5-t5 上下里外 Where Is It? | 4 | core.s5.where-cat | 小猫在哪里？ | story(6 页：小猫在箱子里/箱子上/桌子下/门后面…；prompts 让孩子指) | math, language |
| | | core.s5.up-down | 上和下 | movement(手举上、放下、转个圈、钻到下面) | math, motor |
| | | core.s5.itsy-spider | 小蜘蛛 | song(Itsy Bitsy Spider 英文 + 中文原创词：上去、下来) | music, english |
| s5-t6 天气 Weather | 6 | core.s5.weather | 晴天雨天 | word-cards(sun, cloud, rain, snow, wind, rainbow) | science, english |
| | | core.s5.what-to-wear | 下雨带什么？ | choose(3 轮：下雨→umbrella；下雪→coat/scarf；晴天→hat) | science, life |
| | | core.s5.rain-song | 小雨快走开 | song(Rain Rain Go Away 英文 + 中文) | music, english |

## s6 准备入园 Ready for Preschool（30–36 月）——亲子共看课（audience child，coView required）
重点：规律、数到 10 与一一对应到 5+、顺序与计划、自理、入园分离准备、礼貌与情绪调节、生命周期。

| 主题 | 周 | 课程 id | 标题 | 步骤 | 领域 |
|---|---|---|---|---|---|
| s6-t1 找规律 Patterns | 4 | core.s6.fruit-pattern | 水果排排队 | pattern(3 轮：apple-banana-apple-banana-?；red-blue-red-blue-?；circle-square-…) | math |
| | | core.s6.clap-pattern | 拍手跺脚 | movement(规律动作：拍手-跺脚-拍手-跺脚…) | math, motor |
| | | core.s6.animal-pattern | 动物排队 | pattern(3 轮 ABB/AAB 简单变式：cat-dog-dog-cat-dog-dog-?) | math |
| s6-t2 数到十 Count to 10 | 4 | core.s6.count-ten | 数到十 | count(3 轮：6、8、10；ten-frame) | math |
| | | core.s6.quick-five | 一眼看出 1-5 | subitize(5 轮：4、5、3、5、4；dice/line) | math |
| | | core.s6.more-fewer | 多一些还是少一些 | choose(4 轮：count 3 vs 5、6 vs 4… "哪边少？""哪边多？") | math |
| s6-t3 我会自己做 I Can Do It | 4 | core.s6.dress-order | 穿衣服的顺序 | sequence(order：穿内衣→穿裤子→穿袜子→穿鞋子) | life, math |
| | | core.s6.morning-routine | 早上的事情 | sequence(order：起床→上厕所→洗脸刷牙→吃早饭→出门) | life |
| | | core.s6.my-shoes | 我自己穿鞋 | story(5 页：小熊学穿鞋，左右不分→再试试→成功了，鼓励坚持) | life, social |
| s6-t4 上幼儿园 Off to Preschool | 4 | core.s6.first-day | 第一天上幼儿园 | story(7 页：说再见的约定、老师和小朋友、玩积木、午睡、妈妈准时来接) | social |
| | | core.s6.school-things | 幼儿园里有什么 | word-cards(school, book, blocks, crayon, slide?/ball, teacher？用词库已有) | language, english |
| | | core.s6.polite-words | 你好、谢谢、再见 | choose(3 轮情境：收到礼物说什么→thank you；见到老师→hello；离开→bye-bye) + song(两只老虎旋律原创问好歌) | social, english |
| s6-t5 健康的我 Healthy Me | 4 | core.s6.healthy-food | 每天吃什么 | sort(bins 每天吃/偶尔吃：apple, carrot, rice, egg, milk / cake, candy?, cookie…) | life, science |
| | | core.s6.body-move | 身体动起来 | movement(跑步原地、跳跳、单脚站、弯腰摸脚尖、转圈) + calm(star) | motor |
| | | core.s6.sleep-well | 好好睡觉 | story(5 页：晚上的流程：洗澡→刷牙→讲故事→关灯→晚安) + song(摇篮曲) | life |
| s6-t6 大自然的变化 Nature Changes | 6 | core.s6.seed-grow | 种子长大了 | sequence(order：种子→发芽→长叶→开花) + story(4 页) | science |
| | | core.s6.day-night | 白天和黑夜 | sort(bins 白天/晚上：sun, moon, star, breakfast?…用明确词条) + word-cards | science |
| | | core.s6.four-seasons | 四季 | story(4 页：春花、夏雨、秋叶、冬雪) + word-cards(flower, sun, leaf, snowflake) | science, english |
