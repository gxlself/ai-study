# 芽芽成长核心词库 / Sprout Core Lexicon

面向中国家庭的亲子谈话、实物指认和实体卡片。数据的唯一来源是 `content/packs/sprout-core/lexicon.json`；图片映射在同包 `assets/sources.json`。本表的图片路径均相对 `content/packs/sprout-core/`，不是外部图片网址。

## 选词原则

- 参考 MacArthur-Bates CDI 早期词汇的类别组织思路，兼顾动物与声音、食物、玩具、身体、人物、日常物品、动作和生活情境；补充中国家庭常见的米饭、面条、馒头、饺子及亲属称谓。这是原创教学词表，不是 CDI 量表的复制、译本或测评工具，不设达标词数。
- 中文用孩子日常听到的说法，英文用常用单数或自然的不可数名词、动作短语；不为了“一一对应”写出错误英语。`pants` 是英语固有复数名词，保留自然叫法，不造出单数 `pant`。
- 拼音以普通话词典读音为基础，轻声音节不标调，例如 `mā ma`、`pú tao`、`yǎn jing`。拼音供家长参考，不要求婴幼儿认字。
- 短句中英含义一致，中文不超过 10 个汉字。动物习性采用稳定、简单的描述；情绪没有“好坏”排名，不把害怕或难过当作需要纠正的表现。
- 拟声只是两种语言中的常见表达，不是动物录音或唯一“标准答案”。蜜蜂的 `嗡嗡 / buzz buzz` 指飞行时的振翅声。没有适合的日常拟声就留空，不编造。
- 家庭称谓反映孩子与亲人的关系；不根据年龄外貌认定一个人必须是某种亲属。家人不必全部到场或具有固定家庭组合。后台可上传真实家人照片替换：在自定义词条或课程内联概念中使用照片，保留核心包作为原始资料，不直接覆盖内置文件。
- 奶奶、爷爷用 `paternal` 标签，外婆、外公用 `maternal` 标签；英文分别均为 `grandma`、`grandpa`。哥哥与弟弟、姐姐与妹妹分别用 `older-sibling`、`younger-sibling`。照片与实际称谓优先于通用人物插画。
- 西红柿按家常烹饪习惯放在蔬菜类，标签 `culinary-vegetable` 不代表植物学分类。鲸鱼标记为哺乳动物；星星与风的图片属于示意符号，不是天体或风的真实外形。

参考入口：MacArthur-Bates CDI 官方 `https://mb-cdi.stanford.edu/`；本项目屏幕使用原则见 `docs/research/evidence-review.md` 第 9 节和 `docs/curriculum/route-plan.md`。

## 实体卡片与陪伴

- 6–17 月龄只使用家长指引课。家长先看指引，再关屏陪玩；宝宝看到的是实物、家人的脸或打印后的大卡，不在屏幕前看词库轮播。
- A4 大卡每页 2 张，建议彩色打印、保持原始比例；每个主体只配一个概念。不快速闪卡，不要求宝宝记忆、跟读或答对。根据宝宝注意和兴趣停下来回应。
- 图片均采用 SVG；自绘图为纯矢量，数字用路径而非字体，放大不依赖分辨率或特定字体。白色色块有浅灰描边，馒头、杯子等浅色主体有轮廓，在白纸上仍可辨认。颜色学习需要彩色打印，灰度打印不能保留颜色概念。
- “奶奶/外婆”等共用图只表示人物类别，不能用来测试宝宝能否靠同一张插画区分关系；请换用家人照片并用日常称谓。
- 图中食物只用于认识，不代表辅食时间、分量或饮食建议。气球、悠悠球等只在大人陪同下认识；不把图片中的物品作为宝宝可以独自拿取的实物清单。
- 18–23 月龄继续以家长指引为主；亲子共看默认关闭。24–36 月龄共看也必须有家长陪同，遵守课程时长，结束后回到实物和生活互动。

## 量词、复数与数数边界

量词表示表中中文词的自然搭配，不保证该图片适合直接数数。`plural` 仅保存默认复数规则无法得到的形式，如 `sheep`、`mice`、`fish`、`geese`、`feet`、`teeth`、`leaves`、`scarves`、`potatoes`；普通 `-s`、`-es`、`-ies` 由契约工具生成。`pants` 以相同复数形式保存并排除计数。

| 标签 | 含义与使用方式 |
|---|---|
| `non-count` | 不要直接用于 `count`、`subitize`、数量选择题或 `cardinalitySpeech`。这是内容约定，当前 schema 的计数函数不会自动拦截。 |
| `mass-noun` | 英文不可数用法，如奶、水、米饭、面包、肥皂、雨、风；中文的“杯/碗/块”等不能自动补成英文量词短语。 |
| `group-image` | 图中不止一个对象，如葡萄、樱桃、蓝莓、面条、叶子和积木；一张图片不等于“一颗/一根/一片/一块”。 |
| `slice-image` | 西瓜、蛋糕显示切块，不应直接读成一个完整物体；使用“块”指认，不用默认英文计数。 |
| `color-ambiguous` | Fluent 蓝莓图主体偏紫，不能仅凭“蓝莓”名字把它当作蓝色选项。明确的蓝色题请选 `blue` 色卡或该图确实为蓝色的 `fish`、`hat`。 |
| `plural-only` | `pants` 是复数形式；若要数裤子，课程需显式写 `a pair of pants / two pairs of pants`。 |
| `symbolic-image` | 星星、风是简化的概念示意，不用于推断真实形态。 |
| `observe-only` / `safety` | 图卡认识或需要看护的情境，不是独自操作邀请。 |

适合直接数数的例子：`dog`（两只小狗 / two dogs）、`fish`（两条小鱼 / two fish）、`apple`（两个苹果 / two apples）、`car`（两辆汽车 / two cars）、`book`（两本书 / two books）、`ball`（两个球 / two balls）。`socks`、`shoes`、`gloves` 的英文分别是 `sock`、`shoe`、`glove`，图中为单只，量词也是“只”；两只配成一双需另写双语短句。

颜色、数字、情绪和动作同样带 `non-count`。颜色“种”、动作“次”只是描述类别或发生次数，不应拼成“三次洗手 / three wash your hands”这类错误句子。数字卡用于辨认数字，不拿两张“3”图说成“两个三”来代替三件实物。

ID 注意：`orange` 是橙子，`orange-color` 是橙色；`star` 是星星，`star-shape` 是星形；`snow` 是雪花，英文 `snowflake`，没有单独的 `snowflake` ID。`chicken` 指母鸡，英文采用更准确的 `hen`。ID 是稳定引用键，不作为朗读文字。

量词不确定项：无。表中的“个”均为日常通用量词或概念符号用法，不是未知量词的兜底。

拟声不确定项：无。空白项表示不提供拟声，不表示该动物没有声音；有地方或家庭习惯时，可在自定义内容中调整。

## 词条总表

<!-- GENERATED_LEXICON_TABLES -->

共 **252 条、19 类**。

| 类别 | Category | 条数 |
|---|---|---|
| 动物 / Animals | animals | 31 |
| 水果 / Fruit | fruits | 12 |
| 蔬菜 / Vegetables | vegetables | 8 |
| 食物与饮品 / Food & Drinks | food | 12 |
| 交通工具 / Vehicles | vehicles | 13 |
| 身体 / Body | body | 15 |
| 家人 / Family | family | 11 |
| 家居与用品 / Household Objects | home | 24 |
| 衣物 / Clothing | clothes | 13 |
| 自然 / Nature | nature | 19 |
| 颜色 / Colors | colors | 10 |
| 形状 / Shapes | shapes | 8 |
| 数字 / Numbers | numbers | 11 |
| 情绪与感受 / Feelings | emotions | 8 |
| 动作 / Actions | actions | 27 |
| 玩具 / Toys | toys | 12 |
| 乐器 / Music | music | 8 |
| 场所 / Places | places | 7 |
| 其他 / Other | other | 3 |

### 动物 / Animals（30）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `dog` | `assets/images/animals/dog.svg` | 小狗 | xiǎo gǒu | dog | 只 | 汪汪 / woof woof |
| `cat` | `assets/images/animals/cat.svg` | 小猫 | xiǎo māo | cat | 只 | 喵喵 / meow meow |
| `cow` | `assets/images/animals/cow.svg` | 奶牛 | nǎi niú | cow | 头 | 哞哞 / moo moo |
| `duck` | `assets/images/animals/duck.svg` | 小鸭子 | xiǎo yā zi | duck | 只 | 嘎嘎 / quack quack |
| `pig` | `assets/images/animals/pig.svg` | 小猪 | xiǎo zhū | pig | 头 | 哼哼 / oink oink |
| `sheep` | `assets/images/animals/sheep.svg` | 绵羊 | mián yáng | sheep | 只 | 咩咩 / baa baa |
| `horse` | `assets/images/animals/horse.svg` | 小马 | xiǎo mǎ | horse | 匹 | 咴咴 / neigh neigh |
| `chicken` | `assets/images/animals/chicken.svg` | 母鸡 | mǔ jī | hen | 只 | 咯咯 / cluck cluck |
| `chick` | `assets/images/animals/chick.svg` | 小鸡 | xiǎo jī | chick | 只 | 叽叽 / cheep cheep |
| `rabbit` | `assets/images/animals/rabbit.svg` | 小兔子 | xiǎo tù zi | rabbit | 只 | 无 |
| `mouse` | `assets/images/animals/mouse.svg` | 小老鼠 | xiǎo lǎo shǔ | mouse | 只 | 吱吱 / squeak squeak |
| `bird` | `assets/images/animals/bird.svg` | 小鸟 | xiǎo niǎo | bird | 只 | 叽叽 / tweet tweet |
| `fish` | `assets/images/animals/fish.svg` | 小鱼 | xiǎo yú | fish | 条 | 无 |
| `turtle` | `assets/images/animals/turtle.svg` | 乌龟 | wū guī | turtle | 只 | 无 |
| `frog` | `assets/images/animals/frog.svg` | 青蛙 | qīng wā | frog | 只 | 呱呱 / ribbit ribbit |
| `panda` | `assets/images/animals/panda.svg` | 大熊猫 | dà xióng māo | panda | 只 | 无 |
| `bear` | `assets/images/animals/bear.svg` | 小熊 | xiǎo xióng | bear | 只 | 无 |
| `elephant` | `assets/images/animals/elephant.svg` | 大象 | dà xiàng | elephant | 头 | 无 |
| `giraffe` | `assets/images/animals/giraffe.svg` | 长颈鹿 | cháng jǐng lù | giraffe | 只 | 无 |
| `monkey` | `assets/images/animals/monkey.svg` | 小猴子 | xiǎo hóu zi | monkey | 只 | 无 |
| `lion` | `assets/images/animals/lion.svg` | 狮子 | shī zi | lion | 只 | 吼吼 / roar roar |
| `tiger` | `assets/images/animals/tiger.svg` | 老虎 | lǎo hǔ | tiger | 只 | 吼吼 / roar roar |
| `zebra` | `assets/images/animals/zebra.svg` | 斑马 | bān mǎ | zebra | 匹 | 无 |
| `butterfly` | `assets/images/animals/butterfly.svg` | 蝴蝶 | hú dié | butterfly | 只 | 无 |
| `bee` | `assets/images/animals/bee.svg` | 蜜蜂 | mì fēng | bee | 只 | 嗡嗡 / buzz buzz |
| `snail` | `assets/images/animals/snail.svg` | 蜗牛 | wō niú | snail | 只 | 无 |
| `ladybug` | `assets/images/animals/ladybug.svg` | 瓢虫 | piáo chóng | ladybug | 只 | 无 |
| `goose` | `assets/images/animals/goose.svg` | 大鹅 | dà é | goose | 只 | 嘎嘎 / honk honk |
| `whale` | `assets/images/animals/whale.svg` | 鲸鱼 | jīng yú | whale | 头 | 无 |
| `spider` | `assets/images/animals/spider.svg` | 小蜘蛛 | xiǎo zhī zhū | spider | 只 | 无 |
| `duckling` | `assets/images/animals/duckling.svg` | 小鸭 | xiǎo yā | duckling | 只 | 嘎嘎 / quack quack |

### 水果 / Fruit（12）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `apple` | `assets/images/fruits/apple.svg` | 苹果 | píng guǒ | apple | 个 | 无 |
| `banana` | `assets/images/fruits/banana.svg` | 香蕉 | xiāng jiāo | banana | 根 | 无 |
| `orange` | `assets/images/fruits/orange.svg` | 橙子 | chéng zi | orange | 个 | 无 |
| `grapes` | `assets/images/fruits/grapes.svg` | 葡萄 | pú tao | grape | 颗 | 无 |
| `strawberry` | `assets/images/fruits/strawberry.svg` | 草莓 | cǎo méi | strawberry | 颗 | 无 |
| `watermelon` | `assets/images/fruits/watermelon.svg` | 西瓜 | xī guā | watermelon | 块 | 无 |
| `pear` | `assets/images/fruits/pear.svg` | 梨 | lí | pear | 个 | 无 |
| `peach` | `assets/images/fruits/peach.svg` | 桃子 | táo zi | peach | 个 | 无 |
| `cherry` | `assets/images/fruits/cherry.svg` | 樱桃 | yīng táo | cherry | 颗 | 无 |
| `lemon` | `assets/images/fruits/lemon.svg` | 柠檬 | níng méng | lemon | 个 | 无 |
| `pineapple` | `assets/images/fruits/pineapple.svg` | 菠萝 | bō luó | pineapple | 个 | 无 |
| `blueberries` | `assets/images/fruits/blueberries.svg` | 蓝莓 | lán méi | blueberry | 颗 | 无 |

### 蔬菜 / Vegetables（8）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `carrot` | `assets/images/vegetables/carrot.svg` | 胡萝卜 | hú luó bo | carrot | 根 | 无 |
| `broccoli` | `assets/images/vegetables/broccoli.svg` | 西兰花 | xī lán huā | broccoli | 朵 | 无 |
| `corn` | `assets/images/vegetables/corn.svg` | 玉米 | yù mǐ | corn | 根 | 无 |
| `potato` | `assets/images/vegetables/potato.svg` | 土豆 | tǔ dòu | potato | 个 | 无 |
| `tomato` | `assets/images/vegetables/tomato.svg` | 西红柿 | xī hóng shì | tomato | 个 | 无 |
| `cucumber` | `assets/images/vegetables/cucumber.svg` | 黄瓜 | huáng guā | cucumber | 根 | 无 |
| `leafy-green` | `assets/images/vegetables/leafy-green.svg` | 青菜 | qīng cài | leafy vegetable | 棵 | 无 |
| `sweet-potato` | `assets/images/vegetables/sweet-potato.svg` | 红薯 | hóng shǔ | sweet potato | 个 | 无 |

### 食物与饮品 / Food & Drinks（12）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `milk` | `assets/images/food/milk.svg` | 奶 | nǎi | milk | 杯 | 无 |
| `water` | `assets/images/food/water.svg` | 水 | shuǐ | water | 杯 | 无 |
| `rice` | `assets/images/food/rice.svg` | 米饭 | mǐ fàn | rice | 碗 | 无 |
| `noodles` | `assets/images/food/noodles.svg` | 面条 | miàn tiáo | noodle | 根 | 无 |
| `egg` | `assets/images/food/egg.svg` | 鸡蛋 | jī dàn | egg | 个 | 无 |
| `bun` | `assets/images/food/bun.svg` | 馒头 | mán tou | steamed bun | 个 | 无 |
| `dumpling` | `assets/images/food/dumpling.svg` | 饺子 | jiǎo zi | dumpling | 个 | 无 |
| `bread` | `assets/images/food/bread.svg` | 面包 | miàn bāo | bread | 块 | 无 |
| `cookie` | `assets/images/food/cookie.svg` | 饼干 | bǐng gān | cookie | 块 | 无 |
| `cake` | `assets/images/food/cake.svg` | 蛋糕 | dàn gāo | cake | 块 | 无 |
| `cheese` | `assets/images/food/cheese.svg` | 奶酪 | nǎi lào | cheese | 块 | 无 |
| `sandwich` | `assets/images/food/sandwich.svg` | 三明治 | sān míng zhì | sandwich | 个 | 无 |

### 交通工具 / Vehicles（12）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `car` | `assets/images/vehicles/car.svg` | 汽车 | qì chē | car | 辆 | 嘀嘀 / beep beep |
| `bus` | `assets/images/vehicles/bus.svg` | 公交车 | gōng jiāo chē | bus | 辆 | 无 |
| `train` | `assets/images/vehicles/train.svg` | 火车 | huǒ chē | train | 列 | 呜呜 / choo choo |
| `airplane` | `assets/images/vehicles/airplane.svg` | 飞机 | fēi jī | airplane | 架 | 无 |
| `boat` | `assets/images/vehicles/boat.svg` | 小船 | xiǎo chuán | boat | 艘 | 无 |
| `bicycle` | `assets/images/vehicles/bicycle.svg` | 自行车 | zì xíng chē | bicycle | 辆 | 无 |
| `truck` | `assets/images/vehicles/truck.svg` | 卡车 | kǎ chē | truck | 辆 | 无 |
| `fire-engine` | `assets/images/vehicles/fire-engine.svg` | 消防车 | xiāo fáng chē | fire engine | 辆 | 无 |
| `ambulance` | `assets/images/vehicles/ambulance.svg` | 救护车 | jiù hù chē | ambulance | 辆 | 无 |
| `taxi` | `assets/images/vehicles/taxi.svg` | 出租车 | chū zū chē | taxi | 辆 | 无 |
| `tractor` | `assets/images/vehicles/tractor.svg` | 拖拉机 | tuō lā jī | tractor | 辆 | 无 |
| `helicopter` | `assets/images/vehicles/helicopter.svg` | 直升机 | zhí shēng jī | helicopter | 架 | 无 |
| `wheel` | `assets/images/vehicles/wheel.svg` | 轮子 | lún zi | wheel | 个 | 无 |

### 身体 / Body（12）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `eye` | `assets/images/body/eye.svg` | 眼睛 | yǎn jing | eye | 只 | 无 |
| `ear` | `assets/images/body/ear.svg` | 耳朵 | ěr duo | ear | 只 | 无 |
| `nose` | `assets/images/body/nose.svg` | 鼻子 | bí zi | nose | 个 | 无 |
| `mouth` | `assets/images/body/mouth.svg` | 嘴巴 | zuǐ ba | mouth | 张 | 无 |
| `hand` | `assets/images/body/hand.svg` | 小手 | xiǎo shǒu | hand | 只 | 无 |
| `foot` | `assets/images/body/foot.svg` | 小脚 | xiǎo jiǎo | foot | 只 | 无 |
| `tooth` | `assets/images/body/tooth.svg` | 牙齿 | yá chǐ | tooth | 颗 | 无 |
| `tongue` | `assets/images/body/tongue.svg` | 舌头 | shé tou | tongue | 条 | 无 |
| `arm` | `assets/images/body/arm.svg` | 胳膊 | gē bo | arm | 条 | 无 |
| `leg` | `assets/images/body/leg.svg` | 腿 | tuǐ | leg | 条 | 无 |
| `head` | `assets/images/body/head.svg` | 头 | tóu | head | 个 | 无 |
| `belly` | `assets/images/body/belly.svg` | 肚子 | dù zi | belly | 个 | 无 |
| `shoulder` | `assets/images/body/shoulder.svg` | 肩膀 | jiān bǎng | shoulder | 个 | 无 |
| `knee` | `assets/images/body/knee.svg` | 膝盖 | xī gài | knee | 个 | 无 |
| `hair` | `assets/images/body/hair.svg` | 头发 | tóu fa | hair | 缕 | 无 |

### 家人 / Family（11）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `mom` | `assets/images/family/mom.svg` | 妈妈 | mā ma | mom | 位 | 无 |
| `dad` | `assets/images/family/dad.svg` | 爸爸 | bà ba | dad | 位 | 无 |
| `baby` | `assets/images/family/baby.svg` | 宝宝 | bǎo bao | baby | 个 | 无 |
| `grandma-paternal` | `assets/images/family/grandma-paternal.svg` | 奶奶 | nǎi nai | grandma | 位 | 无 |
| `grandpa-paternal` | `assets/images/family/grandpa-paternal.svg` | 爷爷 | yé ye | grandpa | 位 | 无 |
| `grandma-maternal` | `assets/images/family/grandma-maternal.svg` | 外婆 | wài pó | grandma | 位 | 无 |
| `grandpa-maternal` | `assets/images/family/grandpa-maternal.svg` | 外公 | wài gōng | grandpa | 位 | 无 |
| `brother-older` | `assets/images/family/brother-older.svg` | 哥哥 | gē ge | big brother | 个 | 无 |
| `sister-older` | `assets/images/family/sister-older.svg` | 姐姐 | jiě jie | big sister | 个 | 无 |
| `brother-younger` | `assets/images/family/brother-younger.svg` | 弟弟 | dì di | little brother | 个 | 无 |
| `sister-younger` | `assets/images/family/sister-younger.svg` | 妹妹 | mèi mei | little sister | 个 | 无 |

### 家居与用品 / Household Objects（21）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `cup` | `assets/images/home/cup.svg` | 杯子 | bēi zi | cup | 个 | 无 |
| `spoon` | `assets/images/home/spoon.svg` | 勺子 | sháo zi | spoon | 把 | 无 |
| `bowl` | `assets/images/home/bowl.svg` | 碗 | wǎn | bowl | 个 | 无 |
| `bed` | `assets/images/home/bed.svg` | 床 | chuáng | bed | 张 | 无 |
| `chair` | `assets/images/home/chair.svg` | 椅子 | yǐ zi | chair | 把 | 无 |
| `toothbrush` | `assets/images/home/toothbrush.svg` | 牙刷 | yá shuā | toothbrush | 把 | 无 |
| `towel` | `assets/images/home/towel.svg` | 毛巾 | máo jīn | towel | 条 | 无 |
| `soap` | `assets/images/home/soap.svg` | 肥皂 | féi zào | soap | 块 | 无 |
| `door` | `assets/images/home/door.svg` | 门 | mén | door | 扇 | 无 |
| `lamp` | `assets/images/home/lamp.svg` | 台灯 | tái dēng | lamp | 盏 | 无 |
| `book` | `assets/images/home/book.svg` | 书 | shū | book | 本 | 无 |
| `clock` | `assets/images/home/clock.svg` | 钟 | zhōng | clock | 个 | 滴答 / tick tock |
| `table` | `assets/images/home/table.svg` | 桌子 | zhuō zi | table | 张 | 无 |
| `sofa` | `assets/images/home/sofa.svg` | 沙发 | shā fā | sofa | 张 | 无 |
| `toilet` | `assets/images/home/toilet.svg` | 马桶 | mǎ tǒng | toilet | 个 | 无 |
| `bathtub` | `assets/images/home/bathtub.svg` | 浴缸 | yù gāng | bathtub | 个 | 无 |
| `umbrella` | `assets/images/home/umbrella.svg` | 雨伞 | yǔ sǎn | umbrella | 把 | 无 |
| `key` | `assets/images/home/key.svg` | 钥匙 | yào shi | key | 把 | 无 |
| `basket` | `assets/images/home/basket.svg` | 篮子 | lán zi | basket | 个 | 无 |
| `comb` | `assets/images/home/comb.svg` | 梳子 | shū zi | comb | 把 | 无 |
| `box` | `assets/images/home/box.svg` | 盒子 | hé zi | box | 个 | 无 |
| `mirror` | `assets/images/home/mirror.svg` | 镜子 | jìng zi | mirror | 面 | 无 |
| `plate` | `assets/images/home/plate.svg` | 盘子 | pán zi | plate | 个 | 无 |
| `toothpaste` | `assets/images/home/toothpaste.svg` | 牙膏 | yá gāo | toothpaste | 管 | 无 |

### 衣物 / Clothing（10）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `hat` | `assets/images/clothes/hat.svg` | 帽子 | mào zi | hat | 顶 | 无 |
| `shirt` | `assets/images/clothes/shirt.svg` | 上衣 | shàng yī | shirt | 件 | 无 |
| `pants` | `assets/images/clothes/pants.svg` | 裤子 | kù zi | pants | 条 | 无 |
| `socks` | `assets/images/clothes/socks.svg` | 袜子 | wà zi | sock | 只 | 无 |
| `shoes` | `assets/images/clothes/shoes.svg` | 鞋子 | xié zi | shoe | 只 | 无 |
| `coat` | `assets/images/clothes/coat.svg` | 外套 | wài tào | coat | 件 | 无 |
| `scarf` | `assets/images/clothes/scarf.svg` | 围巾 | wéi jīn | scarf | 条 | 无 |
| `gloves` | `assets/images/clothes/gloves.svg` | 手套 | shǒu tào | glove | 只 | 无 |
| `dress` | `assets/images/clothes/dress.svg` | 连衣裙 | lián yī qún | dress | 条 | 无 |
| `backpack` | `assets/images/clothes/backpack.svg` | 书包 | shū bāo | backpack | 个 | 无 |
| `rain-boots` | `assets/images/clothes/rain-boots.svg` | 雨靴 | yǔ xuē | rain boot | 双 | 无 |
| `underwear` | `assets/images/clothes/underwear.svg` | 内裤 | nèi kù | underwear | 条 | 无 |
| `undershirt` | `assets/images/clothes/undershirt.svg` | 贴身上衣 | tiē shēn shàng yī | undershirt | 件 | 无 |

### 自然 / Nature（16）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `sun` | `assets/images/nature/sun.svg` | 太阳 | tài yáng | sun | 轮 | 无 |
| `moon` | `assets/images/nature/moon.svg` | 月亮 | yuè liang | moon | 轮 | 无 |
| `star` | `assets/images/nature/star.svg` | 星星 | xīng xing | star | 颗 | 无 |
| `cloud` | `assets/images/nature/cloud.svg` | 云 | yún | cloud | 朵 | 无 |
| `rain` | `assets/images/nature/rain.svg` | 雨 | yǔ | rain | 场 | 无 |
| `snow` | `assets/images/nature/snow.svg` | 雪花 | xuě huā | snowflake | 片 | 无 |
| `rainbow` | `assets/images/nature/rainbow.svg` | 彩虹 | cǎi hóng | rainbow | 道 | 无 |
| `tree` | `assets/images/nature/tree.svg` | 树 | shù | tree | 棵 | 无 |
| `flower` | `assets/images/nature/flower.svg` | 花 | huā | flower | 朵 | 无 |
| `leaf` | `assets/images/nature/leaf.svg` | 叶子 | yè zi | leaf | 片 | 无 |
| `droplet` | `assets/images/nature/droplet.svg` | 水滴 | shuǐ dī | drop | 滴 | 无 |
| `mountain` | `assets/images/nature/mountain.svg` | 山 | shān | mountain | 座 | 无 |
| `wind` | `assets/images/nature/wind.svg` | 风 | fēng | wind | 阵 | 无 |
| `seed` | `assets/images/nature/seed.svg` | 种子 | zhǒng zi | seed | 颗 | 无 |
| `grass` | `assets/images/nature/grass.svg` | 小草 | xiǎo cǎo | grass | 丛 | 无 |
| `sea` | `assets/images/nature/sea.svg` | 大海 | dà hǎi | sea | 片 | 无 |
| `seedling` | `assets/images/nature/seedling.svg` | 幼苗 | yòu miáo | seedling | 棵 | 无 |
| `sapling` | `assets/images/nature/sapling.svg` | 小苗 | xiǎo miáo | sapling | 棵 | 无 |
| `bamboo` | `assets/images/nature/bamboo.svg` | 竹子 | zhú zi | bamboo | 根 | 无 |

### 颜色 / Colors（10）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `red` | `assets/images/colors/red.svg` | 红色 | hóng sè | red | 种 | 无 |
| `orange-color` | `assets/images/colors/orange-color.svg` | 橙色 | chéng sè | orange | 种 | 无 |
| `yellow` | `assets/images/colors/yellow.svg` | 黄色 | huáng sè | yellow | 种 | 无 |
| `green` | `assets/images/colors/green.svg` | 绿色 | lǜ sè | green | 种 | 无 |
| `blue` | `assets/images/colors/blue.svg` | 蓝色 | lán sè | blue | 种 | 无 |
| `purple` | `assets/images/colors/purple.svg` | 紫色 | zǐ sè | purple | 种 | 无 |
| `pink` | `assets/images/colors/pink.svg` | 粉色 | fěn sè | pink | 种 | 无 |
| `brown` | `assets/images/colors/brown.svg` | 棕色 | zōng sè | brown | 种 | 无 |
| `black` | `assets/images/colors/black.svg` | 黑色 | hēi sè | black | 种 | 无 |
| `white` | `assets/images/colors/white.svg` | 白色 | bái sè | white | 种 | 无 |

### 形状 / Shapes（8）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `circle` | `assets/images/shapes/circle.svg` | 圆形 | yuán xíng | circle | 个 | 无 |
| `square` | `assets/images/shapes/square.svg` | 正方形 | zhèng fāng xíng | square | 个 | 无 |
| `triangle` | `assets/images/shapes/triangle.svg` | 三角形 | sān jiǎo xíng | triangle | 个 | 无 |
| `rectangle` | `assets/images/shapes/rectangle.svg` | 长方形 | cháng fāng xíng | rectangle | 个 | 无 |
| `star-shape` | `assets/images/shapes/star-shape.svg` | 星形 | xīng xíng | star shape | 个 | 无 |
| `heart-shape` | `assets/images/shapes/heart-shape.svg` | 心形 | xīn xíng | heart shape | 个 | 无 |
| `oval` | `assets/images/shapes/oval.svg` | 椭圆形 | tuǒ yuán xíng | oval | 个 | 无 |
| `diamond` | `assets/images/shapes/diamond.svg` | 菱形 | líng xíng | diamond | 个 | 无 |

### 数字 / Numbers（11）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `num-0` | `assets/images/numbers/num-0.svg` | 零 | líng | zero | 个 | 无 |
| `num-1` | `assets/images/numbers/num-1.svg` | 一 | yī | one | 个 | 无 |
| `num-2` | `assets/images/numbers/num-2.svg` | 二 | èr | two | 个 | 无 |
| `num-3` | `assets/images/numbers/num-3.svg` | 三 | sān | three | 个 | 无 |
| `num-4` | `assets/images/numbers/num-4.svg` | 四 | sì | four | 个 | 无 |
| `num-5` | `assets/images/numbers/num-5.svg` | 五 | wǔ | five | 个 | 无 |
| `num-6` | `assets/images/numbers/num-6.svg` | 六 | liù | six | 个 | 无 |
| `num-7` | `assets/images/numbers/num-7.svg` | 七 | qī | seven | 个 | 无 |
| `num-8` | `assets/images/numbers/num-8.svg` | 八 | bā | eight | 个 | 无 |
| `num-9` | `assets/images/numbers/num-9.svg` | 九 | jiǔ | nine | 个 | 无 |
| `num-10` | `assets/images/numbers/num-10.svg` | 十 | shí | ten | 个 | 无 |

### 情绪与感受 / Feelings（8）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `happy` | `assets/images/emotions/happy.svg` | 开心 | kāi xīn | happy | 种 | 无 |
| `sad` | `assets/images/emotions/sad.svg` | 难过 | nán guò | sad | 种 | 无 |
| `angry` | `assets/images/emotions/angry.svg` | 生气 | shēng qì | angry | 种 | 无 |
| `scared` | `assets/images/emotions/scared.svg` | 害怕 | hài pà | scared | 种 | 无 |
| `surprised` | `assets/images/emotions/surprised.svg` | 惊讶 | jīng yà | surprised | 种 | 无 |
| `sleepy` | `assets/images/emotions/sleepy.svg` | 困了 | kùn le | sleepy | 种 | 无 |
| `calm` | `assets/images/emotions/calm.svg` | 平静 | píng jìng | calm | 种 | 无 |
| `love` | `assets/images/emotions/love.svg` | 爱 | ài | love | 份 | 无 |

### 动作 / Actions（14）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `clap` | `assets/images/actions/clap.svg` | 拍手 | pāi shǒu | clap | 次 | 无 |
| `wave` | `assets/images/actions/wave.svg` | 挥手 | huī shǒu | wave | 次 | 无 |
| `raise-hands` | `assets/images/actions/raise-hands.svg` | 举手 | jǔ shǒu | raise your hands | 次 | 无 |
| `walk` | `assets/images/actions/walk.svg` | 走 | zǒu | walk | 次 | 无 |
| `run` | `assets/images/actions/run.svg` | 跑 | pǎo | run | 次 | 无 |
| `jump` | `assets/images/actions/jump.svg` | 跳 | tiào | jump | 次 | 无 |
| `dance` | `assets/images/actions/dance.svg` | 跳舞 | tiào wǔ | dance | 次 | 无 |
| `sleep` | `assets/images/actions/sleep.svg` | 睡觉 | shuì jiào | sleep | 次 | 无 |
| `eat` | `assets/images/actions/eat.svg` | 吃饭 | chī fàn | eat | 次 | 无 |
| `drink` | `assets/images/actions/drink.svg` | 喝水 | hē shuǐ | drink water | 次 | 无 |
| `brush-teeth` | `assets/images/actions/brush-teeth.svg` | 刷牙 | shuā yá | brush your teeth | 次 | 无 |
| `wash-hands` | `assets/images/actions/wash-hands.svg` | 洗手 | xǐ shǒu | wash your hands | 次 | 无 |
| `hug` | `assets/images/actions/hug.svg` | 抱抱 | bào bao | hug | 次 | 无 |
| `sit-down` | `assets/images/actions/sit-down.svg` | 坐下 | zuò xià | sit down | 次 | 无 |
| `wake-up` | `assets/images/actions/wake-up.svg` | 起床 | qǐ chuáng | wake up | 次 | 无 |
| `wash-face` | `assets/images/actions/wash-face.svg` | 洗脸 | xǐ liǎn | wash your face | 次 | 无 |
| `wet-hands` | `assets/images/actions/wet-hands.svg` | 湿手 | shī shǒu | wet hands | 次 | 无 |
| `rinse-hands` | `assets/images/actions/rinse-hands.svg` | 冲洗双手 | chōng xǐ shuāng shǒu | rinse your hands | 次 | 无 |
| `crawl` | `assets/images/actions/crawl.svg` | 爬 | pá | crawl | 次 | 无 |
| `duck-under` | `assets/images/actions/duck-under.svg` | 钻过 | zuān guò | duck under | 次 | 无 |
| `stamp-feet` | `assets/images/actions/stamp-feet.svg` | 轻跺脚 | qīng duò jiǎo | stamp your feet | 次 | 无 |
| `balance-with-support` | `assets/images/actions/balance-with-support.svg` | 扶稳抬脚 | fú wěn tái jiǎo | balance with support | 次 | 无 |
| `bend-gently` | `assets/images/actions/bend-gently.svg` | 轻轻弯腰 | qīng qīng wān yāo | bend gently | 次 | 无 |
| `turn-slowly` | `assets/images/actions/turn-slowly.svg` | 慢慢转身 | màn màn zhuǎn shēn | turn slowly | 次 | 无 |
| `morning-breakfast` | `assets/images/actions/morning-breakfast.svg` | 早上吃早饭 | zǎo shàng chī zǎo fàn | have breakfast | 次 | 无 |
| `daytime-walk` | `assets/images/actions/daytime-walk.svg` | 白天散步 | bái tiān sàn bù | take a daytime walk | 次 | 无 |
| `bedtime-reading` | `assets/images/actions/bedtime-reading.svg` | 睡前读书 | shuì qián dú shū | read at bedtime | 次 | 无 |

### 玩具 / Toys（10）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `ball` | `assets/images/toys/ball.svg` | 球 | qiú | ball | 个 | 无 |
| `teddy-bear` | `assets/images/toys/teddy-bear.svg` | 泰迪熊 | tài dí xióng | teddy bear | 只 | 无 |
| `blocks` | `assets/images/toys/blocks.svg` | 积木 | jī mù | block | 块 | 无 |
| `balloon` | `assets/images/toys/balloon.svg` | 气球 | qì qiú | balloon | 个 | 无 |
| `kite` | `assets/images/toys/kite.svg` | 风筝 | fēng zheng | kite | 只 | 无 |
| `puzzle` | `assets/images/toys/puzzle.svg` | 拼图 | pīn tú | puzzle piece | 块 | 无 |
| `doll` | `assets/images/toys/doll.svg` | 娃娃 | wá wa | doll | 个 | 无 |
| `crayon` | `assets/images/toys/crayon.svg` | 蜡笔 | là bǐ | crayon | 支 | 无 |
| `yo-yo` | `assets/images/toys/yo-yo.svg` | 悠悠球 | yōu yōu qiú | yo-yo | 个 | 无 |
| `toy-car` | `assets/images/toys/toy-car.svg` | 玩具车 | wán jù chē | toy car | 辆 | 无 |
| `ramp` | `assets/images/toys/ramp.svg` | 斜坡 | xié pō | ramp | 个 | 无 |
| `single-block` | `assets/images/toys/single-block.svg` | 单块积木 | dān kuài jī mù | single block | 块 | 无 |

### 乐器 / Music（8）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `drum` | `assets/images/music/drum.svg` | 鼓 | gǔ | drum | 面 | 咚咚 / boom boom |
| `piano` | `assets/images/music/piano.svg` | 钢琴 | gāng qín | piano | 架 | 无 |
| `guitar` | `assets/images/music/guitar.svg` | 吉他 | jí tā | guitar | 把 | 无 |
| `violin` | `assets/images/music/violin.svg` | 小提琴 | xiǎo tí qín | violin | 把 | 无 |
| `flute` | `assets/images/music/flute.svg` | 笛子 | dí zi | flute | 支 | 无 |
| `bell` | `assets/images/music/bell.svg` | 铃铛 | líng dang | bell | 个 | 叮铃 / ding ding |
| `xylophone` | `assets/images/music/xylophone.svg` | 木琴 | mù qín | xylophone | 架 | 无 |
| `tambourine` | `assets/images/music/tambourine.svg` | 铃鼓 | líng gǔ | tambourine | 面 | 无 |

### 场所 / Places（6）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `home` | `assets/images/places/home.svg` | 家 | jiā | home | 个 | 无 |
| `school` | `assets/images/places/school.svg` | 幼儿园 | yòu ér yuán | preschool | 所 | 无 |
| `hospital` | `assets/images/places/hospital.svg` | 医院 | yī yuàn | hospital | 家 | 无 |
| `shop` | `assets/images/places/shop.svg` | 商店 | shāng diàn | shop | 家 | 无 |
| `park` | `assets/images/places/park.svg` | 公园 | gōng yuán | park | 座 | 无 |
| `playground` | `assets/images/places/playground.svg` | 游乐场 | yóu lè chǎng | playground | 个 | 无 |
| `slide` | `assets/images/places/slide.svg` | 滑梯 | huá tī | slide | 架 | 无 |

### 其他 / Other（3）

| ID | 图片路径 | 中文 | 拼音 | English | 量词 | 拟声（中 / 英） |
|---|---|---|---|---|---|---|
| `sprout` | `assets/images/other/sprout.svg` | 小芽 | xiǎo yá | sprout | 棵 | 无 |
| `teacher` | `assets/images/other/teacher.svg` | 老师 | lǎo shī | teacher | 位 | 无 |
| `caregiver` | `assets/images/other/caregiver.svg` | 照护者 | zhào hù zhě | caregiver | 位 | 无 |

<!-- END_GENERATED_LEXICON_TABLES -->

## 素材与复核

- Fluent Emoji 使用 Microsoft 的 `Color` SVG；支持肤色的人物和手势使用 `Default`（黄色）版本。家人允许复用同一上游 SVG，但每个词条保留自己的包内路径。
- 自绘图形使用同一色板与圆润轮廓；形状统一蓝色 `#5DA9E9`，数字统一暖橙 `#F08A5D`，颜色卡为同一造型，避免形状差异干扰颜色识别。
- 自绘素材由芽芽成长原创，按 CC0 提供；Fluent Emoji 按 MIT 使用。完整署名与许可由 T5 维护在内容包 `LICENSES.md`。
- 自绘图、馒头、橙子、杯子、毛巾及日常动作不依赖近似 emoji。T6 只维护映射和自绘素材；Fluent 文件由 T5 的 `content:assets` 下载。

<!-- GENERATED_ASSET_VERIFICATION -->

### 2026-10-02 上游素材树核对结果

已从以下 GitHub API 递归树取得完整 JSON，并按 `name`、`style`、`skinTone` 逐条检查每个 Fluent 映射：

`https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1`

- commit tree SHA：`1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`
- tree 条目：27,127
- `truncated`：`false`
- Fluent 映射：159
- custom 自绘：61
- Fluent 唯一路径：155（家人词条有预期复用）
- 缺失或多匹配：0
- T5 的实际 `parseAssetSource` / `resolveFluentPath` 集成解析：159 / 159 通过

本次完整响应在临时目录 `/tmp/sprout-t6-qHgDnM/fluent-tree-verified.json`，未写入仓库；映射逐条结果在 `/tmp/sprout-t6-qHgDnM/mapping-check.json`。这些临时证据文件不属于内容包发布物。

### 白纸大卡检查

本次额外把 155 个唯一 Fluent SVG 下载到临时目录，并用 tree 中的 Git blob SHA 校验内容；没有写入 T5 所有的下载素材目录。连同 61 个自绘图，共检查 216 个唯一文件、220 个词条映射：

- 全部通过 `xmllint`，无位图、字体依赖、外部图片或脚本资源。
- 在 100 mm 宽图片尺寸下，最细的显式描边约 0.156 mm；自绘显式描边至少 2 个 viewBox 单位。主体以矢量填充轮廓为主，不靠极细线条表达概念。
- 单一 Chromium 实例逐图渲染至 768 × 768 像素；220 项均非空，白纸上有可辨识轮廓。自绘图最小透明边距为 13.7%，没有裁切。
- A4 每页两张大卡的预览已检查：白色色块浅灰轮廓可辨，刷牙动作清楚，数字无需安装字体。
- 本次没有实际纸张或打印机色彩校样；不同打印机的显色仍有差异。颜色学习应使用彩色打印。

预览及像素检查证据：`/tmp/sprout-t6-qHgDnM/a4-two-large-cards.png`、`print-custom-1.png`、`print-custom-2.png`、`print-fluent-emoji-1.png` 至 `print-fluent-emoji-5.png`、`print-render-check.json`。浏览器已关闭，没有留下开发服务器。

### 2026-10-03 T10 第二批复核结果

- 新增 **32 条**，总词条 **252 条**；新增类别分布为 animals 1、vehicles 1、body 3、home 3、clothes 3、nature 3、actions 13、toys 2、places 1、other 2。
- 新增 Fluent 映射 6 条：`Wheel`、`Mirror`、`Briefs`、`Seedling`、`Playground slide`、`Teacher/Default`；沿用已取得的官方完整树快照（tree SHA `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`，`truncated=false`），T5 的 `resolveFluentPath` 对全包 **165 / 165** 条 Fluent 映射解析通过。
- 新增 custom 自绘 26 条；全包 custom 87 条。所有新增 SVG 均为 `viewBox="0 0 256 256"`，无脚本、外链或位图引用；26 / 26 文件存在并通过 XML 解析。
- `pnpm content:assets --pack content/packs/sprout-core`：下载 6、跳过 159、自绘已检查 87、错误 0、警告 0。
- `Lexicon.parse` 通过，`validateConcepts` 为 0 error / 0 warning；整包 `content:validate` 为 0 error、1 warning，252 词条、96 节有效课程。
- 本批新增文字尚未由 T5 生成离线音频：整包音频覆盖为 1427 / 1552（91.9%），缺失 125 条。播放端仍可按契约回退系统朗读；音频生成不在 T10 所有权内。
- 本批新增量词均按单个可见对象或日常动作填写；`hair` 的“缕”仅适用于发丝，`bamboo` 的“根”仅适用于单根竹秆，两者均标记 `non-count`，不进入数量活动。新增词条没有增加拟声不确定项。

### 复核命令

在仓库根运行，词库验收本身不需要服务器：

T6 基线结果：`Lexicon.parse` 通过、`validateConcepts` 0 error / 0 warning、下方内容回归测试 8 / 8 通过、本地 schema `tsc` 通过。schema 包的 vitest 脚本退出 0，但该包暂时没有测试文件；不能把 `--passWithNoTests` 当作内容测试覆盖。T10 第二批的复核结果见下方。

```bash
npx tsx -e 'import fs from "node:fs"; import assert from "node:assert/strict"; import {Lexicon,validateConcepts} from "@sprout/schema"; const x=Lexicon.parse(JSON.parse(fs.readFileSync("content/packs/sprout-core/lexicon.json","utf8"))); assert.equal(x.concepts.length,252); assert.deepEqual(validateConcepts(x.concepts),[]); console.log("252 concepts, 0 issues");'
pnpm --filter @sprout/schema typecheck
pnpm --filter @sprout/schema test --maxWorkers=1
```

若本地 pnpm 的运行前依赖检查触发自动安装，可直接使用已装好的命令；它们对应 schema 包脚本，不需要重新安装依赖：

```bash
./node_modules/.bin/tsc -p packages/schema/tsconfig.json --pretty false
(cd packages/schema && ./node_modules/.bin/vitest run --passWithNoTests --maxWorkers=1)
```

下面的内容回归测试只读文件，不下载图片、不起服务，也不修改其它任务的目录。`xmllint` 为 macOS 自带的 XML 校验工具；测试在同一进程中串行运行。

```bash
npx tsx -e '
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {test} from "node:test";
import {Lexicon,validateConcepts,pluralEn} from "@sprout/schema";
const root="content/packs/sprout-core";
const raw=JSON.parse(fs.readFileSync(`${root}/lexicon.json`,"utf8"));
const {concepts}=Lexicon.parse(raw);
const sources=JSON.parse(fs.readFileSync(`${root}/assets/sources.json`,"utf8"));
const get=(id:string)=>concepts.find(c=>c.id===id)!;
const custom=Object.entries(sources.items).filter(([,s]:any)=>s.source==="custom").map(([p])=>p);
test("契约、总数、类别与唯一 ID",()=>{
  assert.equal(raw.schemaVersion,1);
  assert.equal(concepts.length,252);
  assert.equal(new Set(concepts.map(c=>c.id)).size,252);
  assert.deepEqual(validateConcepts(concepts),[]);
  const expected={animals:31,fruits:12,vegetables:8,food:12,vehicles:13,body:15,family:11,home:24,clothes:13,nature:19,colors:10,shapes:8,numbers:11,emotions:8,actions:27,toys:12,music:8,places:7,other:3};
  for(const [category,n] of Object.entries(expected))assert.equal(concepts.filter(c=>c.category===category).length,n,category);
});
test("每条词的名称、拼音、量词与短句",()=>{
  for(const c of concepts){
    assert.equal(c.en,c.en.toLowerCase(),c.id);
    assert.match(c.pinyin!,/^[a-züāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ ]+$/u,c.id);
    assert.match(c.pinyin!,/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/u,c.id);
    assert.equal(Array.from(c.measure!).length,1,c.id);
    if(c.phrase){assert.ok((c.phrase.zh.match(/\p{Script=Han}/gu)??[]).length<=10,c.id);assert.ok(c.phrase.en.trim(),c.id);}
    if(c.plural)assert.notEqual(c.plural,pluralEn(c.en,2),c.id);
  }
});
test("映射完整、一词一路径",()=>{
  assert.equal(sources.schemaVersion,1);
  assert.equal(Object.keys(sources.items).length,252);
  assert.equal(new Set(concepts.map(c=>c.image)).size,252);
  for(const c of concepts){
    assert.equal(c.image,`assets/images/${c.category}/${c.id}.svg`,c.id);
    const s=sources.items[c.image];assert.ok(s,c.id);
    assert.ok(s.source==="custom"||s.source==="fluent-emoji",c.id);
    if(s.source==="fluent-emoji"){assert.equal(s.style,"Color",c.id);assert.ok(s.name,c.id);if(s.skinTone)assert.equal(s.skinTone,"Default",c.id);}
  }
  assert.equal(custom.length,87);
});
test("自绘 SVG 合法、纯矢量、打印轮廓",()=>{
  const files=custom.map(p=>path.join(root,p));
  const xml=spawnSync("xmllint",["--noout",...files],{encoding:"utf8"});
  assert.equal(xml.status,0,xml.stderr);
  for(const p of custom){
    const svg=fs.readFileSync(path.join(root,p),"utf8");
    assert.match(svg,/viewBox="0 0 256 256"/,p);
    assert.doesNotMatch(svg,/<(?:image|text|script|foreignObject|animate|filter)\b|(?:href|onload)=/i,p);
    assert.match(svg,/stroke-width="[2-9][.\d]*"/,p);
    for(const m of svg.matchAll(/stroke-width="([\d.]+)"/g))assert.ok(Number(m[1])>=2,p);
  }
});
test("十种色值与数字 0–10",()=>{
  const palette={red:"#E86F6B","orange-color":"#F2A15F",yellow:"#F3CE58",green:"#77B77D",blue:"#5DA9E9",purple:"#AB8BC8",pink:"#EDABC3",brown:"#A67C63",black:"#404247",white:"#FFFDF8"};
  for(const [id,color] of Object.entries(palette)){
    assert.equal(get(id).color,color);
    const svg=fs.readFileSync(`${root}/${get(id).image}`,"utf8");assert.ok(svg.includes(`fill="${color}"`),id);
  }
  for(let n=0;n<=10;n++){
    assert.equal(get(`num-${n}`).value,n);
    const svg=fs.readFileSync(`${root}/${get(`num-${n}`).image}`,"utf8");assert.match(svg,/<path /);assert.ok(svg.includes("#F08A5D"));
  }
});
test("关系标签、复数与非计数边界",()=>{
  for(const id of ["grandma-paternal","grandpa-paternal"])assert.ok(get(id).tags?.includes("paternal"));
  for(const id of ["grandma-maternal","grandpa-maternal"])assert.ok(get(id).tags?.includes("maternal"));
  for(const [id,plural] of Object.entries({sheep:"sheep",mouse:"mice",fish:"fish",goose:"geese",foot:"feet",tooth:"teeth",leaf:"leaves"}))assert.equal(pluralEn(get(id).en,2,get(id).plural),plural);
  for(const c of concepts.filter(c=>["colors","numbers","emotions","actions"].includes(c.category)||c.tags?.some(t=>["mass-noun","group-image","slice-image","plural-only"].includes(t))))assert.ok(c.tags?.includes("non-count"),c.id);
  assert.equal(get("orange").category,"fruits");assert.equal(get("orange-color").category,"colors");
});
test("词表与数据没有遗漏",()=>{
  const doc=fs.readFileSync("docs/curriculum/lexicon.md","utf8");
  for(const c of concepts)assert.ok(doc.includes(`| \`${c.id}\` | \`${c.image}\` | ${c.zh} | ${c.pinyin} | ${c.en} | ${c.measure} |`),c.id);
  assert.ok(doc.includes("后台可上传真实家人照片替换"));
});
test("校验器拒绝重复 ID 与越界路径",()=>{
  assert.ok(validateConcepts([concepts[0],concepts[0]]).some(i=>i.level==="error"));
  assert.equal(Lexicon.safeParse({schemaVersion:1,concepts:[{...concepts[0],image:"../escape.svg"}]}).success,false);
});
'
```

素材下载与整体内容校验由 T5 维护。不要因课程、路线或音频还未生成，就把词库的结构校验和整包校验混为同一结果：

```bash
pnpm content:assets --pack content/packs/sprout-core
pnpm content:validate --pack content/packs/sprout-core
```

重新核对上游映射时，先把完整仓库树缓存到临时目录，不写进其它任务拥有的 `scripts/`。只有 `truncated: false` 的完整 JSON 可作为全量证据：

```bash
curl --fail --location --compressed \
  'https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1' \
  --output /tmp/sprout-fluent-tree.json
FLUENT_TREE=/tmp/sprout-fluent-tree.json npx tsx -e '
import fs from "node:fs";
import assert from "node:assert/strict";
const root="content/packs/sprout-core";
const {items}=JSON.parse(fs.readFileSync(`${root}/assets/sources.json`,"utf8"));
const tree=JSON.parse(fs.readFileSync(process.env.FLUENT_TREE!,"utf8"));
assert.equal(tree.truncated,false);
let fluent=0,custom=0;
for(const [target,s] of Object.entries(items) as [string,any][]){
  if(s.source==="custom"){assert.ok(fs.existsSync(`${root}/${target}`),target);custom++;continue;}
  const prefix=`assets/${s.name}/${s.skinTone ? `${s.skinTone}/` : ""}${s.style}/`;
  const matches=tree.tree.filter((e:any)=>e.type==="blob" && e.path.startsWith(prefix) && e.path.endsWith(".svg"));
  assert.equal(matches.length,1,`${target}: ${prefix}`);
  fluent++;
}
console.log({sha:tree.sha,fluent,custom,missing:0});
'
```
