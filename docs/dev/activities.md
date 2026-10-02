# 17 个内置活动

数据契约为 `packages/schema/src/activities.ts`、`lesson.ts`，课程分流以 `docs/curriculum/route-plan.md` 为准。内置活动顺序与 `BUILTIN_ACTIVITY_TYPES` 一致，第 17 个为 `guide`。部分 `BUILTIN_ACTIVITY_META.ageRange` 仍保留低月龄兼容元数据，**不代表允许这些月龄的宝宝看屏幕**；下方共看适龄遵守新的课程规则，不构成发展测评。

每个 JSON 块都是可放入相应类型 `Lesson.steps` 的一个步骤；后台只编辑 props 时复制其中 `props` 对象。宿主先用 `BUILTIN_ACTIVITY_PROPS[type].parse(props)` 补齐默认值再挂载。孩子侧语言随 `zh / zh-en / en-zh / en` 设置；`song` 使用单语行，`guide` 使用成人可读的中文指引与只显示、不朗读的中英短句。

## 家长指引与亲子共看

- `Lesson.audience: "parent"` 是家长指引课：屏幕给家长阅读或学唱，看完去陪玩，不给宝宝观看，不计入孩子屏幕时间。活动只能来自 `PARENT_ACTIVITY_TYPES = ["guide", "song"]`，不能把旧的屏幕活动标成 parent 来绕过限制。
- `Lesson.audience: "child"` 是亲子共看课，也是省略 `audience` 的含义。课程 `ageRange[0]` 必须 ≥18，必须家长陪同，使用 `coView: "required"`，不提供独自观看模式。

| 月龄 | 课程与可视化材料 | 孩子侧屏幕策略 |
| --- | --- | --- |
| 6–17 月 | 全部家长指引；宝宝看打印实体卡、真实物品，不看电子卡片 | `childScreen: "none"` |
| 18–23 月 | 家长指引为主，共看默认关闭，需家长主动开启 | `childScreen: "optional"`；共看每节 ≤8 分钟 |
| 24–36 月 | 家长陪同的共看课，结束后去线下互动 | `childScreen: "default"`；路线建议每节 10/15 分钟，单次硬上限 20 分钟 |

孩子设置 `screen.mode` 可为 `auto`（缺省、跟随阶段）、`parent-only`、`co-view`；18 月龄以下即使选择 co-view 也不能开放宝宝看屏幕。默认可用时段为 08:00–18:30。按 audience 计时、年龄门槛、无交互一段时间自动暂停及 `SessionInput.audience` 上报由宿主负责，不能仅靠活动元数据判断。家长主动开始的 `guide` 暗屏离线陪玩计时不属于背景播放，应豁免无人交互的 idle 暂停；切后台仍可 pause，暂停期间不消耗剩余陪玩时间。

`Lesson.printables` 支持 `cards`（词库/内联概念实体卡）和 `contrast`（高对比实体卡），不是要挂载的活动；低月龄使用 `guide` 指引家长拿打印卡陪玩。`validateLesson` 会检查 child 课起始月龄、parent 课活动白名单及 printables 的词库引用。每课仍须填写家长导语与 `offline`；线下活动可增加 `question` 开放问题和 `levels.easier/harder` 难度变体。

所有课程禁止背景播放、自动连播、积分、徽章、打卡、排行、推送与广告。`guide` 的暗屏陪玩计时不播放音乐或朗读；家长学唱的 `song` 也不能作为无人交互的背景音乐。

## 公共准备

- 本页使用小词库 id：`apple` 苹果、`ball` 皮球、`star` 星星、`flower` 小花、`hands` 拍拍手、`water` 清水、`towel` 毛巾。playground 的 `dev/samples.ts` 和 `dev/assets/` 已提供全部词条和本地 SVG；放进课程时把词条与图片复制到内容包，并使用包内相对 image 路径，不复制开发机绝对 URL。
- 字符串 `ConceptRef` 是词库 id，不是图片 URL；也可用内联 `{zh,en?,image}`。内联概念无 measure/plural 字段，需要准确量词/复数的数数课优先建正式词条。
- 选项、篮子 id 与 answer/bin 必须一致；schema 的结构合法不等于引用正确，要再做 `validateLesson` 的语义和词库检查。
- props 中的图片、poster、视频与字幕都是资源引用；内容包需包含相应文件。只有 web.url 必须是完整 HTTP(S) URL，且不能与宿主同源。
- 每次完成都停住，交宿主决定下一步。`accuracy` 仅用于家长报告，不作为孩子分数。

实验台 `pnpm --filter @sprout/activities dev`，地址 `http://localhost:5312/`；离线素材和独立验证命令见 `packages/activities/dev/README.md`。本页示例会被 dev 测试逐个解析并验证引用。

## 1. contrast 高对比视觉 · 低月龄使用实体卡

用途：提供清晰几何图形，缓慢切换，不作快速闪卡。6–17 月龄课程必须用 `guide` + `printables.kind: "contrast"`，不能加入本屏幕活动；下面的步骤仅用于开发预览或满足 ≥18 月龄门槛的共看课。默认黑白、慢漂移、每图 8 秒。`patterns` 1–12 个，可选 bullseye/stripes/checker/dots/face/spiral/zigzag/circle/square/triangle/star/heart；palette 可 bw/bwr，motion 可 none/drift/pulse/rotate，停留 3–20 秒。

```json
{
  "type": "contrast",
  "props": {
    "patterns": ["circle", "stripes", "face"],
    "palette": "bw",
    "motion": "drift",
    "secondsPerPattern": 8,
    "narration": { "zh": "一起慢慢看", "en": "Let us look together." }
  }
}
```

OK、右键或点按提前下一张；全部结束后 complete。减少动画时关闭循环动效。可在屏幕外指认一张实体图卡。

## 2. word-cards 图像词卡 · 18–36 月共看

用途：图片与真实物体名称对应，重读或一起说短句。`items` 1–12；speak 为 name/name+sound/name+phrase/none，默认 name；自动翻页默认 null，需要时 4–30 秒。show 默认中英文开启、拼音关闭，语言模式仍决定主次顺序。

```json
{
  "type": "word-cards",
  "props": {
    "items": ["apple", "ball", "flower"],
    "show": { "text": true, "english": true, "pinyin": false },
    "speak": "name+phrase",
    "autoAdvanceSec": null,
    "intro": { "zh": "看看我们身边的东西", "en": "Look at the things around us." }
  }
}
```

OK/点卡重读，左右键/箭头翻卡，最后由“看完啦”完成。课后找真实的球或水果；不要逼孩子读字。

## 3. peekaboo 躲猫猫 · 18 月起共看

用途：共同关注、物体暂时被遮住后再出现。`items` 1–6，cover 为 hands/curtain/box/leaf/cloud；默认 curtain、hideSec 2 秒，可选 1–6 秒。ask/reveal 不填时由 schema 补默认问句/揭示句。

```json
{
  "type": "peekaboo",
  "props": {
    "items": ["ball", "apple"],
    "cover": "leaf",
    "hideSec": 2,
    "ask": { "zh": "去哪儿啦？", "en": "Where did it go?" },
    "reveal": { "zh": "在这儿！", "en": "Peekaboo!" }
  }
}
```

OK 提前揭开；每个物体慢慢出现、遮住、揭开，全部完成即停。线下用安全大玩具和小布重复，不把布盖到孩子口鼻。

## 4. bubbles 戳泡泡 · 18–24 月共看

用途：一次点按产生一次可观察结果，次数有限。items 最多 12 个，也可为空；pops 3–20，默认 8；sayName 默认 true；speed slow/normal，默认 slow。

```json
{
  "type": "bubbles",
  "props": {
    "items": ["apple", "star", "flower"],
    "pops": 4,
    "sayName": true,
    "speed": "slow"
  }
}
```

左右键选择，OK 或点按戳破。达到 pops 后告别并完成，不再生成无限泡泡。

## 5. count 数一数 · 18–36 月共看

用途：一一对应与基数，“二”用于唱数，“两”用于两只/两朵。rounds 1–5，每轮 count 1–10，layout 为 row/scatter/dice/ten-frame，默认 row；mode 默认 guided，也可 auto。showNumeral/cardinality 默认 true。

```json
{
  "type": "count",
  "props": {
    "rounds": [
      { "item": "apple", "count": 3, "layout": "row" },
      { "item": "flower", "count": 2, "layout": "dice" }
    ],
    "mode": "guided",
    "showNumeral": true,
    "cardinality": true
  }
}
```

guided 每次 OK/点物体数一个；auto 每 1.5 秒数一个。每轮数完确认下一轮。词库 `measure`/`plural` 决定“一共两朵小花 / Two flowers!”；课后数两个安全的大物件。

## 6. subitize 一眼看出几个 · 24–36 月

用途：小数量整体感知。rounds 1–6，每轮 count 1–6，item 可省略；arrangement dice/line/random，默认 dice。showSec 默认 3，范围 2–10 秒；choices 默认 true，不做快闪。

```json
{
  "type": "subitize",
  "props": {
    "rounds": [
      { "item": "ball", "count": 2, "arrangement": "dice" },
      { "item": "star", "count": 3, "arrangement": "line" }
    ],
    "showSec": 3,
    "choices": true
  }
}
```

画面淡隐后问数量，选择温和反馈，答对后重现并数一遍。choices=false 时直接重现数数。可先从 1–3 个物件开始。

## 7. choose 找一找 · 18–36 月共看

用途：指认、颜色/形状/大小/数量比较。rounds 1–8，每轮 options 2–4；字符串选项的 id 就是词库 id。对象可带 concept/image/label/count/scale/tint；count 1–10，scale 0.3–1.5。showLabels 默认 false，hintAfter 默认 2、范围 1–3。

```json
{
  "type": "choose",
  "props": {
    "rounds": [
      {
        "prompt": { "zh": "苹果在哪里？", "en": "Where is the apple?" },
        "options": ["apple", "ball"],
        "answer": "apple",
        "explain": { "zh": "这是圆圆的苹果", "en": "Here is the round apple." }
      },
      {
        "prompt": { "zh": "哪边有两朵花？", "en": "Which side has two flowers?" },
        "options": [
          { "id": "one", "concept": "flower", "count": 1 },
          { "id": "two", "concept": "flower", "count": 2 }
        ],
        "answer": "two"
      }
    ],
    "showLabels": false,
    "hintAfter": 2
  }
}
```

方向键与 OK 或点选；答错温和再试，hintAfter 后提示正确项。accuracy 是首答正确轮数/总轮数，仅用于家长报告。

## 8. sort 分一分 · 24–36 月

用途：按相同属性分组。bins 2–3 个，每个有 id、label，可选 concept/image/color；items 2–10，每项的 bin 必须指向一个篮子 id。

```json
{
  "type": "sort",
  "props": {
    "prompt": { "zh": "放到一样的篮子里", "en": "Put it in the matching basket." },
    "bins": [
      { "id": "fruit", "label": { "zh": "苹果", "en": "Apples" }, "concept": "apple", "color": "#f8d6d8" },
      { "id": "toy", "label": { "zh": "皮球", "en": "Balls" }, "concept": "ball", "color": "#dff1fb" }
    ],
    "items": [
      { "item": "apple", "bin": "fruit" },
      { "item": "ball", "bin": "toy" }
    ]
  }
}
```

左右选篮子并按 OK，触屏直接点篮子，无需拖拽。放错回位温和再想，全部完成才结束。

## 9. sequence 排顺序 · 18–36 月

用途：熟悉生活中的简单前后顺序。mode show/order，默认 show；steps 2–6，每步必须有 concept 或 image，并有 caption，可选独立 say。

```json
{
  "type": "sequence",
  "props": {
    "mode": "show",
    "intro": { "zh": "洗完手再擦干", "en": "Wash, then dry our hands." },
    "steps": [
      { "concept": "water", "caption": { "zh": "清水洗一洗", "en": "Rinse with water." } },
      { "concept": "towel", "caption": { "zh": "毛巾擦一擦", "en": "Dry with a towel." } }
    ]
  }
}
```

show 按序展示，最后一起回顾；order 给出下一步选择。say 未填时读 caption。课后由家长陪同完成生活常规。

## 10. pattern 找规律 · 30–36 月

用途：ABAB 等简单重复规律。rounds 1–5；sequence 是已显示部分，长度 3–8，末尾问号不用写入数组；options 2–3 个词库 id，answer 必须在其中。

```json
{
  "type": "pattern",
  "props": {
    "intro": { "zh": "接下来是什么？", "en": "What comes next?" },
    "rounds": [
      {
        "sequence": ["apple", "ball", "apple"],
        "options": ["apple", "ball"],
        "answer": "ball"
      }
    ]
  }
}
```

选对补上最后一项，再从头读一遍；选错温和提示。可用两个不同的大玩具摆出线下 ABAB。

## 11. story 绘本故事 · 18–36 月共看

用途：共同看图、对话式阅读。title 必填，cover 可省略而使用首页场景；pages 1–16。每页 scene+text 必填，narrate 默认 true；prompts 每页最多 3 个，kind 为 completion/recall/open/wh/distancing/point。

```json
{
  "type": "story",
  "props": {
    "title": { "zh": "小花和皮球", "en": "The Flower and the Ball" },
    "pages": [
      {
        "scene": {
          "bg": "grass",
          "ground": "grass",
          "sprites": [
            { "concept": "flower", "x": 30, "y": 58, "size": 42, "anim": "sway" },
            { "concept": "ball", "x": 70, "y": 68, "size": 28, "anim": "none" }
          ]
        },
        "text": { "zh": "小花旁边有一个皮球。", "en": "A ball is beside the flower." },
        "narrate": true,
        "prompts": [{ "kind": "point", "zh": "皮球在哪里？", "en": "Where is the ball?" }]
      },
      {
        "scene": {
          "bg": "sky",
          "ground": "grass",
          "sprites": [{ "concept": "flower", "x": 50, "y": 55, "size": 48, "anim": "sway" }]
        },
        "text": { "zh": "我们向小花挥挥手。", "en": "Let us wave to the flower." },
        "prompts": [{ "kind": "distancing", "zh": "窗外有什么花？", "en": "What flowers are outside?" }]
      }
    ]
  }
}
```

Scene：bg 为 sky/grass/night/sea/room/sunset/snow/paper/forest 或 CSS 颜色；ground 为 none/grass/sand/water/floor/snow。sprites 的 x/y 为舞台百分比 0–100，size 为舞台高百分比 2–100、默认 30；可选 flip、delay(0–10 秒)、z，anim 为 none/bob/sway/hop/pulse/float/spin-slow。每个 sprite 必须有 concept 或 image。

左右翻页，OK 重读，最后确认讲完。prompts 是给家长的提问，不自动替家长作答；可停下来听孩子声音。

## 12. song 儿歌 · 6–36 月，低月龄家长学唱

用途：家长跟唱与轻柔动作，非连续音乐播放器。6–17 月龄只能放在 parent 课供家长学唱，随后关屏或进入 `guide` 陪玩，由家长给宝宝唱；≥18 月龄的共看须满足课程门槛。lines 1–24，每行 lang/text/notes；bpm 50–140、默认 90；instrument musicbox/marimba/flute/piano，默认 musicbox；repeat 1–3、默认 1。actions 最多 6 条，scene 可选。

```json
{
  "type": "song",
  "props": {
    "title": { "zh": "小星星", "en": "Twinkle, Twinkle" },
    "credit": "传统旋律（公有领域）；本样例中文歌词为原创",
    "bpm": 80,
    "instrument": "musicbox",
    "lines": [
      { "lang": "zh", "text": "小小星星亮晶晶", "notes": "C4/1 C4/1 G4/1 G4/1 A4/1 A4/1 G4/2" },
      { "lang": "en", "text": "Twinkle, twinkle, little star", "notes": "F4/1 F4/1 E4/1 E4/1 D4/1 D4/1 C4/2" }
    ],
    "scene": {
      "bg": "sky",
      "sprites": [{ "concept": "star", "x": 50, "y": 42, "size": 35, "anim": "pulse" }]
    },
    "actions": [{ "zh": "轻轻拍拍手", "en": "Clap gently." }],
    "repeat": 1
  }
}
```

音符用“音高/拍数”，如 `C4/1 D4/0.5 R/1`；音高 A–G、可带 #/b、八度 2–6，R 是休止。拍数应为正数，不用零拍/超长行；每拍秒数为 60/bpm。OK 暂停/继续，浏览器音频需先有用户手势。按指定 repeat 完成后停住；改编歌曲需核对歌词与旋律许可。

## 13. movement 动一动 · 18–36 月共看

用途：离开纯观看，跟家长做安全动作。moves 1–8，concept 或 image 必有其一，name 与 say 必填，seconds 3–30、默认 8；可选 intro、bpm(50–140)。

```json
{
  "type": "movement",
  "props": {
    "moves": [
      {
        "concept": "hands",
        "name": { "zh": "拍拍手", "en": "Clap" },
        "say": { "zh": "和家长一起轻轻拍拍手", "en": "Clap gently with your grown-up." },
        "seconds": 6
      },
      {
        "concept": "flower",
        "name": { "zh": "轻轻摇", "en": "Sway" },
        "say": { "zh": "坐稳，像小花一样轻轻摇", "en": "Sit safely and sway like a flower." },
        "seconds": 6
      }
    ]
  }
}
```

倒计时结束自动下一动作，OK 可跳过。动作由成人照看，保持安全空间；不设计屏幕前快速追跑或要求孩子独自攀爬。

## 14. calm 安静时刻 · 18–36 月共看

用途：温和收尾、随后离开屏幕，不是医疗呼吸训练。visual balloon/star/flower/moon，默认 balloon；cycles 2–8、默认 4；inhaleSec 2–6、默认 3，exhaleSec 2–8、默认 4。say 可选。

```json
{
  "type": "calm",
  "props": {
    "visual": "flower",
    "cycles": 2,
    "inhaleSec": 3,
    "exhaleSec": 4,
    "say": { "zh": "我们一起慢慢呼吸", "en": "Let us breathe slowly." }
  }
}
```

图形慢慢放大缩小，减少动画时不循环缩放。结束后 complete。家长示范即可，不要求婴幼儿屏息或追求节拍准确。

## 15. video 视频 · 18–36 月

用途：有明确开始与结束的短片，先人工播放。src 必填，poster/title/captions 可选；maxSec 10–1200 秒，可省略。视频 fixture、poster 和字幕在 `dev/assets/`，用于真实课程时复制到下列包内路径。

```json
{
  "type": "video",
  "props": {
    "src": "assets/video/quiet-shape.mp4",
    "poster": "assets/video/video-poster.svg",
    "captions": "assets/video/quiet-shape.vtt",
    "title": { "zh": "草地上的方块", "en": "A Square on the Grass" },
    "maxSec": 10
  }
}
```

本地 fixture 为六秒无音轨 H.264 视频，不自动播放；有 poster 时初始画面不空白。OK 或播放按钮播放/暂停；ended 或 maxSec 完成。时长上限不是素材推荐长度。

## 16. web 网页互动 · 24–36 月

用途：经过审查、能明确结束的 H5 互动。url 必填，title 可选，maxSec 10–1800 秒，allowFullscreen 默认 false。以下可复制示例只用于宿主位于 `http://localhost:5312` 的本地实验台，另一回环域名的同端口 fixture 发送完成消息；不引外网内容。

```json
{
  "type": "web",
  "props": {
    "url": "http://127.0.0.1:5312/assets/web-fixture.html?parentOrigin=http%3A%2F%2Flocalhost%3A5312",
    "title": { "zh": "和太阳打招呼", "en": "Hello, Sun" },
    "maxSec": 60,
    "allowFullscreen": false
  }
}
```

宿主以 `127.0.0.1:5312` 打开时，样例代码会反向使用 `localhost:5312` 并更新 parentOrigin；更换端口也沿用当前端口。发布课程时必须改成实际可访问的独立可信 H5 来源与预期父来源，不能把开发 fixture URL 当成生产资产。

安全约束：iframe 带 `allow-scripts allow-same-origin`，实现拒绝与宿主同源，禁止通过放宽 sandbox 绕过。完成消息为 `{type:"sprout:complete"}`，接收时同时验证来源 origin 与 iframe window；发送使用精确 parent origin，不用 `"*"`。本地示例点“你好”结束，也受 maxSec 限制。跨来源 iframe 不会自动收到父窗口的遥控器事件，嵌入内容自身仍需适配输入。

## 17. guide 亲子活动指引 · 6–36 月，面向家长

用途：家长自己读指引，然后放下屏幕陪宝宝玩，不朗读任何指引或 `say`。`goal` 必填、≤80 字；`materials` 最多 8 项、默认空；`steps` 1–8 步，每步 `text` 必填、≤80 字，可带 `concept` 或 `image` 小插图及 `say.zh/en`“可以这样说”短句。`observe` 最多 4 项、每项 ≤60 字；`safety` 可选；`playMin` 为 0–30 分钟、默认 5，可用小数。

```json
{
  "type": "guide",
  "props": {
    "goal": "轮流拍手，等待宝宝回应。",
    "materials": ["柔软地垫"],
    "steps": [
      {
        "text": "和宝宝面对面，轻轻拍拍手，再停下来等回应。",
        "say": { "zh": "我拍拍，轮到你啦。", "en": "My turn. Your turn." },
        "image": "assets/images/hands.svg"
      }
    ],
    "observe": ["留意宝宝的目光、笑容或动作。"],
    "safety": "不拉拽宝宝的手臂，不想玩时就停下。",
    "playMin": 1
  }
}
```

家长正文使用中文 `--sp-font-md` 级别，步骤为编号列表，材料、观察、安全提示分区；安全提示用柔和警示色。指引是给成人读的，不因孩子语言设置而隐藏中文正文。

`playMin > 0` 时按“开始陪玩 N 分钟”进入 `#0b0b0b` 暗屏，只保留中央缓慢呼吸的暗色小圆点与低亮度剩余时间；按键或点按显示“结束陪玩”。到时柔和 chime 后显示“宝宝今天的反应？”与“很喜欢 / 一般 / 还不感兴趣”，选择后 `ctx.log("reaction", {value})` 并 complete，不计分。`playMin = 0` 时显示“完成”，直接 complete。全流程支持遥控器与触屏，减少动画时关闭呼吸循环。暗屏离线计时不因缺少输入触发 idle 暂停，切后台仍可由宿主 pause；pause/abort/unmount 必须停止声音与计时。

## 共享高对比 SVG 与打印

活动与后台实体卡使用同一个纯函数，不复制另一套图形。Node/打印端使用独立子路径，不加载 React、DOM 或活动样式：

```ts
import { contrastSvg, type ContrastPattern } from '@sprout/activities/contrast-svg';

const pattern: ContrastPattern = 'bullseye';
const svg = contrastSvg(pattern, 'bw', { invert: false, size: 512 });
```

签名为 `contrastSvg(pattern: ContrastPattern, palette: "bw" | "bwr", opts?: {invert?: boolean; size?: number}): string`，返回带命名空间、背景和 `viewBox="0 0 200 200"` 的完整静态 SVG。`size` 是正有限数值，默认 200，设定宽高而不改变图案坐标；`invert` 默认 false。bw 交换黑白前景/背景；bwr 使用红色前景，反转时只切换黑白背景，红色不变。活动保持原来的黑白交替、每第三张加入红色及慢速动画，打印输出没有动画。

包主入口也导出 `contrastSvg`；打印端推荐 `@sprout/activities/contrast-svg`。schema 的 `ContrastPattern` 是 Zod 枚举值，此子路径导出的同名 TypeScript 类型来自 `ContrastProps["patterns"][number]`，不修改 schema 契约。函数只接受白名单图案/调色板与合法尺寸，不接收任意 SVG、CSS 或资源 URL；非法图案、调色板、尺寸抛出 `RangeError`，非布尔 invert 抛出 `TypeError`。页面仍需给输出图片提供相应语义标签。

## 音频与验收边界

`speeches(props)` 没有词库 helpers，**无法解析字符串词库 id 对应的名称、拟声、短句或量词/复数**。词库音频必须由内容流水线独立遍历生成；固定提示取 `PHRASES`，唱数/基数用 schema 工具，最后以 `speechKey` 去重。仅抓取活动 props 中的文本不能代表全部所需音频，详见插件指南。

`guide.speeches(props)` 必须始终为 `[]`，包括步骤的中英 `say` 和插图词条名称，均不朗读、不作为本活动的 TTS 请求。`preload` 仍收集步骤图片与 concept 图片；计时结束的 chime 是音效，不是语音。

本页说明活动契约与可复制参数，不替代运行验收：集成方还需对 17 个活动检查 mount/unmount、暂停/继续、触屏/遥控器、四种语言、素材存在、减少动画、视频不自动播放、web 完成校验、无空白/控制台错误。新增检查包括 guide 阅读/暗屏/反馈/零时长、无任何朗读、宿主 idle 暂停及 guide 暗屏计时豁免、家长课不计入孩子屏幕时间，以及打印 SVG 的 12 图案/两调色板/反转/尺寸/输入安全。缺词条和缺素材应如实展示温和错误状态，不用外部随机资源补齐。
