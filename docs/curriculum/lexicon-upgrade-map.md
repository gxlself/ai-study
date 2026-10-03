# 词库升级替换建议

本表供后续课程升级任务使用。表中“当前近似词条”是课程现在用于示意的词条或素材；本任务只新增词库和素材，没有修改课程 JSON。替换时仍需重新运行课程校验、资源校验和音频收集。

| 新增词条 id | 建议替换或补充的课程 | 当前近似词条 | 说明 |
|---|---|---|---|
| `mirror` | `core.s1.mirror`、`core.s1.my-face` | `baby`、`happy` | 镜子目前主要写在家长导语和材料中，新增独立镜子图后可作为材料或步骤示意。 |
| `shoulder` | `core.s3.head-shoulders` | `head`、`foot` | 歌曲中的肩膀目前只有文字；补入身体部位图示。 |
| `knee` | `core.s3.head-shoulders` | `head`、`foot` | 膝盖目前只有歌词和动作文字；补入身体部位图示。 |
| `hair` | `core.s4.wash-song` | `comb` | 梳子是工具，不等于头发；梳头段可同时展示 `hair` 与 `comb`。 |
| `rain-boots` | `core.s3.rain-day`、`core.s5.what-to-wear` | `walk`、`umbrella` | 雨天动作和穿戴选择可从泛化的走路或雨伞扩展为雨靴。 |
| `ramp` | `core.s3.roll-car` | `toy-car` | 课程已有玩具车，但斜坡只在文字中出现；补入低矮斜坡图。 |
| `duckling` | `core.s3.duck-mom`、`core.s5.five-ducks` | `duck` | 幼鸭找妈妈和小鸭歌可把泛化的鸭子替换为幼鸭，成人鸭仍可保留 `duck`。 |
| `wheel` | `core.s4.circle-friends` | `bicycle` | 当前用自行车图表示轮子；改为独立轮子后语义更准确。 |
| `plate` | `core.s4.shape-hunt`、`core.s4.big-small` | `bowl` 或文字中的盘子 | 圆盘边缘和餐桌盘子不再借用碗图。 |
| `toothpaste` | `core.s4.brush-teeth`、`core.s6.sleep-well` | `toothbrush` | 牙刷和牙膏分别展示，保留成人控制用量的安全文案。 |
| `teacher` | `core.s6.first-day`、`core.s6.school-things`、`core.s6.polite-words` | `school` 或纯文字 | 老师目前刻意不借家人图片冒充；新增包容的人物图后可补到场景。 |
| `slide` | `core.s5.take-turns`、`core.s6.school-things` | `ball` | 滑梯轮流课和幼儿园物品课不再用球替代滑梯。 |
| `underwear` | `core.s6.dress-order` | `shirt` | 课程已注明上衣图不是内裤；升级时用得体的内裤图。 |
| `wake-up` | `core.s6.morning-routine` | `bed` | 起床步骤目前借床图表示，改为动作词条更直接。 |
| `wash-face` | `core.s6.morning-routine` | `brush-teeth` | “洗脸刷牙”目前共用刷牙动作图，可拆出洗脸图。 |
| `seedling` | `core.s6.seed-grow` | `sprout` | 发芽阶段使用幼苗图，和小芽吉祥物区分。 |
| `sapling` | `core.s6.seed-grow` | `sprout`、`leaf` | 长叶小苗阶段用独立植物阶段图，不把叶子单独当成整株小苗。 |
| `single-block` | `core.s3.one-many`、`core.s4.blocks`、`core.s6.first-day`、`core.s6.school-things` | `blocks` | 群体积木图不适合“一块”的精确指认；数量课改用单块积木。 |
| `caregiver` | `core.s1.family-faces`、`core.s1.mirror`、`core.s1.twinkle` | `mom`、`dad` 或纯文字“家长” | 用角色词条表达任意稳定照护者，避免默认家庭成员或性别。 |
| `bamboo` | `core.s5.panda-story` | `tree`、`grass` | 熊猫吃竹子的故事场景不再用树和草作近似环境。 |
| `undershirt` | `core.s6.dress-order` | `shirt` | 课程当前用上衣图示意贴身上衣；替换后可准确区分 `shirt` 与 `undershirt`。 |
| `wet-hands` | `core.s3.wash-hands`、`core.s4.wash-song` | `wash-hands`、`droplet` | 洗手流程的第一步用湿手动作图，水滴可继续作为水的辅助概念。 |
| `rinse-hands` | `core.s3.wash-hands`、`core.s4.wash-song` | `wash-hands`、`droplet` | 冲洗步骤用独立动作图，避免把“洗手”一词覆盖完整流程。 |
| `crawl` | `core.s5.up-down` | `head` | 地面钻行的动作目前借身体部位图提示，可用动作图替换。 |
| `duck-under` | `core.s5.up-down` | `head` | “钻过大人手臂下面”目前用 `head` 示意，改为动作图并保留成人看护。 |
| `stamp-feet` | `core.s6.clap-pattern` | `foot` | 身体规律课的跺脚动作可从身体部位图改为动作图。 |
| `balance-with-support` | `core.s6.body-move` | `foot` | 扶稳抬脚目前只有小脚图；补入成人支持下的完整动作示意。 |
| `bend-gently` | `core.s6.body-move` | `foot` | 轻弯腰目前借小脚图提示；改为完整姿势图。 |
| `turn-slowly` | `core.s6.body-move` | `dance` | 慢慢转身目前借跳舞动作图；改为明确的慢转动作图。 |
| `morning-breakfast` | `core.s6.day-night` | 内联 `actions/eat.svg` | 明确“早上吃早饭”的时段情境，不把一般吃饭图当作时间卡。 |
| `daytime-walk` | `core.s6.day-night` | 内联 `actions/walk.svg` | 明确“白天散步”的时段情境。 |
| `bedtime-reading` | `core.s6.day-night`、`core.s6.sleep-well` | 内联 `home/book.svg`、`book` | 明确睡前读书情境，仍需保持睡前关屏和纸书原则。 |

