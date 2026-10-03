# 内容包制作指南

面向新增词条、课程与成长路线的作者。内容只写 JSON、文本与素材，不需要修改播放端。数据契约的唯一事实来源是 `packages/schema/src/*.ts`；以下示例对应 `schemaVersion: 1`，插件 SDK 为 `1.0.0`。

完整示例包在 `content/examples/hello-pack/`：两个自绘形状、一节家长指引课、一节亲子共看课、一条连续路线；不依赖核心包、Fluent Emoji 或第三方插件。音频、bundle 和 zip 由流水线生成，不能当成编辑入口。

## 1. 从可运行示例开始

所有命令在仓库根执行：

```sh
pnpm --dir scripts install --ignore-workspace
export pnpm_config_verify_deps_before_run=false
pnpm content:typecheck
pnpm content:test
pnpm content:assets --pack content/examples/hello-pack
pnpm content:validate --pack content/examples/hello-pack
```

最初没有音频时，普通 validate 应无 error，但会报告缺音 warning；`--strict` 有任何 warning 都失败。需要直接跑 vitest 时用 `npx --prefix scripts vitest run --config scripts/vitest.config.ts scripts`，保留单 worker 配置，不要依赖根目录能解析到 vitest。

为自己的包复制目录：

```sh
cp -R content/examples/hello-pack content/packs/my-shapes
```

若示例已运行过生成流程，不要把旧 `audio/`、`bundle.json` 或 zip 当成自己的源码；新包改完文本后重新生成。同步更换包 ID、课程 ID、词条 ID、路线、阶段、主题及所有引用，不只是改文件夹名。不要改动 `sprout.core` 来测试自己的内容。

## 2. 文件结构

```text
hello-pack/
  pack.json
  lexicon.json
  LICENSES.md
  README.md
  assets/
    sources.json
    images/shapes/circle.svg
    images/shapes/square.svg
  routes/hello-route.json
  lessons/hello.s1.shapes.json
```

生成阶段才添加：

```text
audio/manifest.json
audio/tts/zh/*.m4a
audio/tts/en/*.m4a
bundle.json
```

源码素材路径都以包根为起点。课程放在多级 `lessons/` 子目录也不改变图片解析起点；推荐正斜杠、稳定小写文件名，禁止 `..` 和本机绝对路径。zip 输出到包外的 `release/`。

## 3. pack.json 与版本

下面是可用于本示例的精简 manifest；目录中的实际文件额外包含描述、封面和署名细节：

```json
{
  "schemaVersion": 1,
  "id": "sprout.hello",
  "version": "1.0.0",
  "name": {"zh": "你好，形状", "en": "Hello, Shapes"},
  "author": "芽芽成长",
  "license": "CC0-1.0",
  "ageRange": [18, 26],
  "lexicon": "lexicon.json",
  "routes": ["routes/hello-route.json"],
  "lessonsDir": "lessons",
  "requires": {"sdk": "^1.0.0"},
  "credits": [
    {
      "name": "你好，形状原创示例",
      "license": "CC0-1.0",
      "note": "芽芽成长原创课程、词库、路线与简单 SVG 图形。"
    }
  ]
}
```

| 字段 | 规则 |
| --- | --- |
| `schemaVersion` | 固定为当前契约的 `1`，不是包发布版本 |
| `id` | 稳定身份；小写字母数字开头，后续允许小写字母、数字、`.`、`-`、`_` |
| `version` | 语义化版本字符串，如 `1.0.0`、`1.0.1`，同 ID 升级用更高版本 |
| `name` | `LText`，中文必填、英文可选 |
| `ageRange` | `[最小月龄, 最大月龄]`，整数闭区间 |
| `lexicon` | 默认 `lexicon.json`；可选词库缺失不等于引用自动有效 |
| `routes` | 默认 `[]`；只放真实存在的路线文件相对路径 |
| `lessonsDir` | 默认 `lessons`，递归读取其中的课程 JSON |
| `credits` | 默认 `[]`，发布时应填写每种素材真实来源与许可 |
| `cover` | 可选包内图片路径 |
| `requires.sdk` | SDK 版本范围，不是 schema 版本 |
| `requires.plugins` | 可选 `{"vendor.name":"^1.0.0"}`，仅第三方活动依赖 |

契约没有 `requires.packs`。独立包应自带所用词条，不能虚构一个字段来声明核心包依赖。第三方活动 type 必须包含点号，内置 type 不含点号；未安装的第三方活动会产生 warning，严格发布前应解决。

`sprout.core` 保留给系统核心包，路线固定为 `sprout.core.route`。新包使用自己的命名空间，例如本示例的 `hello.circle`、`hello.s1.shapes`、`sprout.hello.route`。

## 4. 词库与自绘图片

词库中的中文名、英文名、图片只维护一份；活动通过 id 引用：

```json
{
  "schemaVersion": 1,
  "concepts": [
    {
      "id": "hello.circle",
      "category": "shapes",
      "zh": "圆形",
      "en": "circle",
      "measure": "个",
      "plural": "circles",
      "image": "assets/images/shapes/circle.svg",
      "phrase": {"zh": "圆圆的形状。", "en": "A circle is round."}
    },
    {
      "id": "hello.square",
      "category": "shapes",
      "zh": "方形",
      "en": "square",
      "measure": "个",
      "plural": "squares",
      "image": "assets/images/shapes/square.svg"
    }
  ]
}
```

- `Concept` 必填 `id`、`category`、`zh`、`en`、`image`；同包 id 不得重复。
- `category` 取 schema 枚举，例如 `shapes`、`colors`、`numbers`、`animals`、`home`、`actions`、`other`，不要自造分类。
- `measure` 是中文量词，省略时数量句默认“个”。`plural` 应填写不规则英文复数；省略时工具按常见规则处理。
- 颜色词条填 `color`，数字词条填 `value`；缺少时会 warning。`pinyin`、`tags`、`ageRange`、拟声 `sound` 与短句 `phrase` 可选。
- `sound`、`phrase` 一旦提供，词条契约要求同时有 `zh`、`en`。
- `ConceptRef` 也接受 `{ "zh": "圆形", "en": "circle", "image": "assets/images/shapes/circle.svg" }` 这种内联对象；复用内容优先使用词库。
- 运行时概念解析顺序是本包 → 核心包 → 其他启用包；流水线的引用检查范围为本包加核心包。为了独立交付，引用仍应在本包闭合。

本示例素材来源文件：

```json
{
  "schemaVersion": 1,
  "items": {
    "assets/images/shapes/circle.svg": {"source": "custom"},
    "assets/images/shapes/square.svg": {"source": "custom"}
  }
}
```

`custom` 表示素材由作者提供，不代表“自动获得许可”。本示例两个 SVG 是芽芽成长原创并以 CC0 提供。图片有 `viewBox`、百分比宽高、清楚轮廓，不包含脚本、外链字体或网络图片。

## 5. 两类课程

`Lesson.audience` 缺省为 `child`，不能用“没填”来表示家长课：

| 课程 | 字段与活动 | 屏幕与月龄 |
| --- | --- | --- |
| 家长指引课 | `audience: "parent"`，步骤只允许 `guide`、`song` | 屏幕给家长看，读完放下设备去陪玩，不计孩子屏幕时间；宝宝看实体卡和真实物品 |
| 亲子共看课 | `audience: "child"` 或缺省，`coView: "required"` | 起始月龄必须 ≥18，必须家长陪同；时长不超过所在阶段的单次上限，且不能超过20分钟 |

依据项目已确定的 `docs/curriculum/route-plan.md`：6–17 月龄全部家长课（`childScreen: "none"`）；18–23 月龄以家长课为主，共看默认关闭（`optional`），家长主动开启时每节 ≤8 分钟；24–36 月龄可选的短共看内容，必须陪同，单次硬上限20分钟。活动元数据的旧建议月龄不是儿童观看屏幕的许可。

无人互动需由播放端自动暂停；不得编写背景播放、自动连播、积分、徽章、打卡、排行、推送或广告。内容流水线校验静态 JSON，不替代播放端的这些运行时护栏。

### 家长课、Guide 与实体卡

以下片段展示新增字段；完整可运行课程见 `lessons/hello.parent.shape-hunt.json`：

```json
{
  "audience": "parent",
  "ageRange": [18, 23],
  "printables": [
    {"kind":"cards","title":"形状实体卡","items":["hello.circle","hello.square"]},
    {"kind":"contrast","title":"黑白实体卡","patterns":["circle","square"],"palette":"bw"}
  ],
  "steps": [{
    "type": "guide",
    "props": {
      "goal": "先准备好实体卡片，放下屏幕后陪宝宝看实物。",
      "steps": [{"text":"指一指身边安全的圆形物品，停下来等回应。","concept":"hello.circle","say":{"zh":"圆圆的，像这个。"}}],
      "playMin": 3
    }
  }]
}
```

`guide.steps[].say` 只显示给家长参考，不生成朗读；家长课只收集 `song.title`，不收集歌词。`parentGuide`、线下活动、打印标题与打印卡引用也不是课程朗读。本包词库和固定 `PHRASES` 仍会全量预生成。

`printables` 最多4组。`cards.items` 为1–24个词库引用或内联概念；默认 `size: "large"`、`showText: true`、`showEnglish: true`，另可 `medium`、`small`。`contrast.patterns` 为1–12个高对比图案，默认 `palette: "bw"`，另可 `bwr`。打印卡字符串引用会检查词条所属包内的图片，内联图片也必须真实存在。图案卡由打印端渲染，不需要假造词库图片。

线下活动增加开放问题和难度调整，默认 `steps` 为中档：

```json
{
  "title": "在身边找形状",
  "steps": ["关掉屏幕，指一指安全物品的形状。"],
  "question": "你还发现了什么？",
  "levels": {"easier":"只观察一个形状。","harder":"用两张卡匹配眼前物品。"},
  "safety": "成人全程陪伴，不使用小零件或易碎物。"
}
```

### 一节完整的共看短课

`Lesson` 的必填项如下。这个示例只使用本包两个形状：

```json
{
  "schemaVersion": 1,
  "id": "hello.s1.shapes",
  "title": {"zh": "圆圆方方", "en": "Circles and Squares"},
  "ageRange": [24, 26],
  "audience": "child",
  "domains": ["cognition", "math"],
  "themeId": "hello.shapes",
  "durationMin": 1,
  "coView": "required",
  "objectives": [
    {"zh": "和家长一起观察形状。", "en": "Notice shapes together."}
  ],
  "parentGuide": {
    "intro": "陪宝宝慢慢看、指一指，再离开屏幕寻找真实的形状。"
  },
  "offline": [
    {
      "title": "在身边找形状",
      "steps": ["关掉屏幕，和宝宝一起指认房间里物品的圆形与方形轮廓。"],
      "safety": "成人全程陪伴，不提供小零件，不攀爬或触碰危险物品。"
    }
  ],
  "steps": [
    {
      "type": "word-cards",
      "props": {"items": ["hello.circle", "hello.square"]}
    },
    {
      "type": "count",
      "props": {"rounds": [{"item": "hello.circle", "count": 2}]}
    }
  ]
}
```

`domains` 的第一项是主领域，1–4 项，范围为 `language`、`english`、`math`、`cognition`、`science`、`social`、`music`、`art`、`motor`、`life`。`durationMin` 为 1–20 分钟；不要把 schema 上限当作推荐屏幕时长。

schema 的 `coView` 枚举为 `required`、`recommended`、`optional`，但共看课必须选 `required`，其他值会警告；家长课不套用孩子的时长计费。`objectives` 1–5 条，`offline` 1–4 个且每个有 1–8 条步骤。`parentGuide.intro` 最多 160 字，提示最多 6 条、每条最多 80 字；步骤 `parentTip` 最多 80 字，供家长看，不朗读。

schema 允许 1–8 个步骤，产品编课以 1–4 个慢节奏步骤为目标。每课必须有真实可执行的线下延伸，不将屏幕当作独立陪伴。课程月龄跨度超过 18 个月会 warning，应拆分适龄课而不是直接扩大范围。

### 文本、默认值与场景

- `LText`：`zh` 必填，`en` 可选。`Speech`：`zh`、`en` 至少一个，不写纯字符串。
- 中文字段用中文标点；英文标点只放在英文句子中。缺英文时可以只给中文，不填空字符串。
- 以下活动代码块是 **props 对象**。放进 `{"type":"对应类型","props":这里的对象}`，再放入课程 `steps`。
- 默认值只在字段省略时由 zod 补全；不要用 `null` 表示省略，只有明确可空的 `word-cards.autoAdvanceSec` 可以设 `null`。
- `Lesson.parse` 本身不足以补全活动 props；使用 `validateLesson`，然后取其返回的规范化课程。流水线生成 bundle 也遵循这个过程。
- `Scene` 默认 `bg: "sky"`、`ground: "none"`、`sprites: []`。`bg` 可用预设 `sky`、`grass`、`night`、`sea`、`room`、`sunset`、`snow`、`paper`、`forest`，或 CSS 颜色。
- `Sprite` 必须有 `concept` 或 `image` 以及 `x`、`y`（0–100 的舞台百分比）；默认 `size: 30`、`anim: "none"`。尺寸是舞台高度百分比，范围 2–100。可用 `flip`、`delay`、`z`，不要引入快速闪烁。
- 整课 `cover` 是 `{concept?, image?, bg?}`；绘本活动的 `cover` 则是 `Scene`，不要混淆。

## 6. 17 种内置活动最小 Props

每个代码块都满足对应 props schema；涉及概念的示例使用 hello-pack 的两个词条。下方参考月龄只是 `BUILTIN_ACTIVITY_META` 的活动能力标注，不能覆盖本指南的 audience 限制；18月龄以下只用 parent 的 guide/song 和实体打印材料。它们是分别选用的语法示例，不是把17种活动塞进同一节课。

### 1. contrast

参考月龄：6–12。最小示例：

```json
{"patterns":["circle"]}
```

默认 `palette: "bw"`、`motion: "drift"`、`secondsPerPattern: 8`。图案 1–12 个，取 `bullseye`、`stripes`、`checker`、`dots`、`face`、`spiral`、`zigzag`、`circle`、`square`、`triangle`、`star`、`heart`；调色板另可 `bwr`，动作另可 `none`、`pulse`、`rotate`。每图 3–20 秒，可加 `narration: Speech`。图案由活动绘制，不是词库 id。

### 2. word-cards

参考月龄：6–36。

```json
{"items":["hello.circle"]}
```

`items` 1–12 个。默认 `show: {"text":true,"english":true,"pinyin":false}`、`speak: "name"`、`autoAdvanceSec: null`（手动翻页）。朗读模式还可 `name+sound`、`name+phrase`、`none`；自动翻页若启用必须 4–30 秒，可加 `intro: Speech`。

### 3. peekaboo

参考月龄：7–18。

```json
{"items":["hello.circle"]}
```

`items` 1–6 个。默认 `cover: "curtain"`、`hideSec: 2`、`ask: {"zh":"去哪儿啦？","en":"Where did it go?"}`、`reveal: {"zh":"在这儿！","en":"Peekaboo!"}`。遮挡物还可 `hands`、`box`、`leaf`、`cloud`；隐藏时间 1–6 秒。省略的问答仍会进入音频收集。

### 4. bubbles

参考月龄：9–24。

```json
{}
```

默认 `items: []`、`pops: 8`、`sayName: true`、`speed: "slow"`。空数组代表不展示词条，可填最多 12 个概念；泡泡总数 3–20，速度还可 `normal`。总数有限，结束即停。

### 5. count

参考月龄：15–36。

```json
{"rounds":[{"item":"hello.circle","count":2}]}
```

1–5 轮，每轮数量 1–10；默认轮次 `layout: "row"`，还可 `scatter`、`dice`、`ten-frame`。活动默认 `showNumeral: true`、`cardinality: true`、`mode: "guided"`；`auto` 模式每 1.5 秒数一个。数量句由量词与英文复数生成，不要手拼不一致的朗读。

### 6. subitize

参考月龄：24–36。

```json
{"rounds":[{"count":2}]}
```

1–6 轮，每轮数量 1–6，`item` 可省略，也可给 `"hello.circle"`。默认每轮 `arrangement: "dice"`，另可 `line`、`random`；活动默认 `showSec: 3`、`choices: true`。展示时间 2–10 秒，编课以小数量为主。

### 7. choose

参考月龄：12–36。

```json
{
  "rounds":[{
    "prompt":{"zh":"找一找圆形。"},
    "options":["hello.circle","hello.square"],
    "answer":"hello.circle"
  }]
}
```

1–8 轮，每轮 2–4 个选项；默认 `showLabels: false`、`hintAfter: 2`（可为 1–3）。可加 `explain: Speech`。字符串选项既是词条 id，也是答案 id；对象选项必须有独立 `id`，可配 `concept`、`image`、`label`、`count`、`scale`、`tint`，并提供能显示的内容。`answer` 必须出现在本轮选项 id 中。

### 8. sort

参考月龄：24–36。

```json
{
  "prompt":{"zh":"把一样的形状放在一起。"},
  "bins":[
    {"id":"round","label":{"zh":"圆形"}},
    {"id":"square","label":{"zh":"方形"}}
  ],
  "items":[
    {"item":"hello.circle","bin":"round"},
    {"item":"hello.square","bin":"square"}
  ]
}
```

没有额外默认字段。篮子 2–3 个，物体 2–10 个；每个 `bin` 必须匹配篮子的 `id`，不是匹配中文标签。篮子可额外设置 `concept`、`image`、`color`。篮子 id 自行保持唯一，交互不要求孩子拖拽。

### 9. sequence

参考月龄：18–36。

```json
{
  "steps":[
    {"concept":"hello.circle","caption":{"zh":"先看圆形。"}},
    {"concept":"hello.square","caption":{"zh":"再看方形。"}}
  ]
}
```

默认 `mode: "show"`，还可 `order`；2–6 步，每步必须有 `concept` 或 `image` 和 `caption: LText`。可加活动 `intro` 与每步 `say`；省略 `say` 时朗读 `caption`。这是顺序语法示例，正式生活常规课应配对应动作素材。

### 10. pattern

参考月龄：30–36。

```json
{
  "rounds":[{
    "sequence":["hello.circle","hello.square","hello.circle"],
    "options":["hello.circle","hello.square"],
    "answer":"hello.square"
  }]
}
```

没有额外默认字段，可加 `intro`。1–5 轮，序列 3–8 项，选项 2–3 项。`options` 与 `answer` 都是字符串词条 id，不能填内联对象；答案必须在 options 中。示例是圆、方、圆后接方的 AB 规律。

### 11. story

参考月龄：9–36。

```json
{
  "title":{"zh":"你好，圆形"},
  "pages":[{
    "scene":{"sprites":[{"concept":"hello.circle","x":50,"y":50}]},
    "text":{"zh":"圆形来和我们打招呼。"}
  }]
}
```

1–16 页，每页 `narrate` 默认 `true`；`scene` 与 sprite 按前文补默认值。可加 `cover: Scene`。每页最多 3 个家长提问 `prompts`，形如 `{"kind":"point","zh":"请指一指圆形。"}`；kind 可为 `completion`、`recall`、`open`、`wh`、`distancing`、`point`。标题和启用 `narrate` 的正文进入朗读，提问给家长看。

### 12. song

参考月龄：6–36。

```json
{
  "title":{"zh":"形状问好"},
  "credit":"芽芽成长原创示例词曲，CC0-1.0",
  "lines":[{"lang":"zh","text":"圆圆你好","notes":"C4/1 D4/1 E4/1 C4/1"}]
}
```

默认 `bpm: 90`、`instrument: "musicbox"`、`repeat: 1`；语法上可省略 `credit`，但其默认值会是“传统儿歌（公有领域）/ Traditional, public domain”，所以这个原创示例显式写真实来源。不要把默认 credit 当作任意歌曲的授权。

1–24 行，每行必填 `lang`（`zh` 或 `en`）、歌词 `text`、`notes`。音符按空格分隔 `音高/拍数`，音高范围 C2–B6，可带 `#` 或 `b`，休止为 `R`，例如 `C4/1 F#4/0.5 R/1`；作者应使用正拍数。速度 50–140，乐器还可 `marimba`、`flute`、`piano`，重复 1–3 次。可加 `scene`、最多 6 条 `actions: LText[]`。只为标题生成 TTS，歌词由家长跟唱，旋律由活动合成。

### 13. movement

参考月龄：9–36。

```json
{
  "moves":[{
    "concept":"hello.circle",
    "name":{"zh":"画个圆"},
    "say":{"zh":"和家长一起，用手在空中慢慢画个圆。"}
  }]
}
```

1–8 个动作，每项必须有 `concept` 或 `image`，以及 `name`、`say`；默认每项 `seconds: 8`，范围 3–30 秒。可加活动 `intro`、`bpm`（50–140）。这个示例只借圆形示意轨迹；正式课程应配合适的动作图，并写清安全空间与成人陪伴。

### 14. calm

参考月龄：12–36。

```json
{}
```

默认 `visual: "balloon"`、`cycles: 4`、`inhaleSec: 3`、`exhaleSec: 4`。图形另可 `star`、`flower`、`moon`；循环 2–8 次，吸气 2–6 秒，呼气 2–8 秒。可加 `say`。不要求孩子屏气或完成固定节奏，家长可随时结束。

### 15. video

参考月龄：18–36。

```json
{"src":"assets/video/hello.mp4"}
```

没有自动补齐的可选字段。可加 `poster` 图片路径、`title: LText`、`captions` 字幕路径、`maxSec`（整数 10–1200）。

这是合法 props，不是 hello-pack 已附的视频：本示例不分发视频。复制到真实课程前必须提供 `assets/video/hello.mp4`，以及实际引用的海报、字幕和许可；否则整包资源校验应失败。不得为凑齐示例生成空视频。视频不能自动连播。

### 16. web

参考月龄：24–36。

```json
{"url":"https://example.invalid/sprout-activity"}
```

默认 `allowFullscreen: false`；可加 `title: LText`、`maxSec`（整数 10–1800）。`url` 必须是完整 URL，不是包内相对路径。

上面的 `.invalid` 是不供实际访问的占位地址，仅用于展示合法 URL 语法。发布前必须换成经过审核、无广告、无追踪、无不当内容的自有页面；本 hello-pack 不包含该步骤，不依赖网络。运行于 iframe 沙箱的页面通过 `postMessage({type:"sprout:complete"})` 通知宿主结束，具体运行时要求见插件契约。

### 17. guide

给家长使用，可覆盖6–36月龄；不是给18月龄以下宝宝看的屏幕活动：

```json
{
  "goal": "读完指引后放下屏幕，与宝宝一起观察实物。",
  "steps": [{"text":"指认身边一个安全的圆形物品，等待回应。","concept":"hello.circle","say":{"zh":"圆圆的，像这个。"}}]
}
```

默认 `materials: []`、`playMin: 5`。`goal` 不超过80字；`steps` 为1–8条，每条 `text` 不超过80字，`say` 可有中英文但只显示，不朗读；`concept` 或 `image` 是给家长的可选示意图。`playMin` 为0–30分钟，0表示不计时直接结束；陪玩时间不是孩子屏幕时间。`observe` 最多4条、每条60字，另可加 `safety`。

## 7. 路线、主题与连续月份

下面是仅含共看阶段的独立路线写法。完整 hello-pack 还包含18–23月龄家长课阶段，随后连续接入24–26月龄共看阶段，每课只归一个主题：

```json
{
  "schemaVersion": 1,
  "id": "sprout.hello.route",
  "title": {"zh": "形状小旅程"},
  "stages": [
    {
      "id": "hello.s1",
      "title": {"zh": "一起发现形状"},
      "ageRange": [24, 26],
      "focus": [{"zh": "观察简单形状，一起点数。"}],
      "screen": {
        "sessionMaxMin": 2,
        "dailyMaxMin": 2,
        "lessonsPerDay": 1,
        "coView": "required",
        "childScreen": "default"
      },
      "themes": [
        {
          "id": "hello.shapes",
          "title": {"zh": "圆圆方方"},
          "weeks": 1,
          "domains": ["cognition", "math"],
          "lessons": ["hello.s1.shapes"]
        }
      ]
    }
  ]
}
```

- 路线至少 1 个阶段，每个阶段至少 1 个主题，每个主题至少 1 节真实存在的课。
- 多阶段按月龄排序，下一段起点是上一段终点加 1。正确：`[24,26]`、`[27,29]`；重叠：`[24,26]`、`[26,29]`；缺月：`[24,26]`、`[28,29]`。
- 主题 id 在整包中保持唯一；一节课出现且仅出现于一个主题，否则 warning。同主题的课程可以由排课器反复安排，不要通过多次列出同一课制造复习。
- `screen.childScreen` 为 `none` 的阶段只允许 `audience: "parent"`，混入 child 为 error；`optional` 表示共看默认关闭、家长可开启；缺省与 `default` 表示默认可共看。child 课 `coView` 不是 `required`、或 `durationMin` 超过所属阶段 `sessionMaxMin` 都会 warning。
- 课程 `themeId` 必须等于所在主题 id，否则 error；课程与阶段月龄无交集会 warning。建议直接让包、阶段、课程月龄范围明确对齐。
- `weeks` 为 1–8，主题 `domains` 至少一项。`offlineFocus`、阶段 `dailyRhythm`、`milestonesAt` 可选；不填写未经核对的里程碑编号。
- `screen` 没有默认值：单次 1–30 分钟、每日 1–60 分钟、每天 1–4 节和 `coView` 都要写。上限是技术边界，不是对所有年龄的建议；保持短时、共看与离屏互动。

## 8. 素材与许可

### 自绘

提交真实 SVG 与 `assets/sources.json` 的 `custom` 条目，声明实际作者和许可。主体清楚、配色柔和、没有脚本、远程依赖或闪烁。图形以 `viewBox` 适配大屏，保留周围安全边距；不要把桌面截图当成内容插画。

hello-pack 的 JSON、文字和两个 SVG 为原创 CC0，详情见包内 `LICENSES.md`。之后加入第三方图片、录音或视频时须重新列出其来源与分发条件；`custom` 不能替代核对。

### Fluent Emoji

需要时按任务契约加入来源项：

```json
{
  "source": "fluent-emoji",
  "name": "Dog",
  "style": "Color"
}
```

它应放在 `assets/sources.json.items` 某个目标图片路径下面，不是整个来源文件。带肤色的素材另设 `skinTone`；路径解析由 assets 脚本完成。

官方项目为 Microsoft Fluent Emoji，许可 MIT。2026-10-02 核对的官方原文版权行为 `Copyright (c) Microsoft Corporation.`，没有附猜测的年份或其他作者。来源：

```text
https://github.com/microsoft/fluentui-emoji
https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE
https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/LICENSE
```

使用这些素材时在 `pack.json.credits` 标明 Microsoft、MIT、官方链接，并附许可全文；本项目已核对的全文位于 `content/packs/sprout-core/LICENSES.md`。不要把 Fluent Emoji 标成 CC0，也不要把 `sprout.core` 的许可声明机械复制到完全不使用它的 hello-pack。

### 音乐、音频与隐私

儿歌的词、曲、录音分别核对来源，不因旋律熟悉就写“公有领域”。合成旋律不免除词曲来源要求。系统声音生成的音频在对外分发前同样要确认适用条件；源码图形的 CC0 声明不会自动覆盖后加的系统录音。

不要包含孩子姓名、照片、声音或家庭位置等未经授权的个人内容。包内不放 token、账号、广告、追踪脚本或外部统计。

## 9. 校验、构建与后台导入

在 macOS 上完整生成独立示例：

```sh
pnpm content:audio --pack content/examples/hello-pack --dry-run
pnpm content:all --pack content/examples/hello-pack
pnpm content:validate --pack content/examples/hello-pack --strict
pnpm content:zip content/examples/hello-pack --out release/
```

`content:all` 的独立 runner 把 `--pack` 传给 route → assets → audio → validate → bundle，不包含 zip。route 仅为核心包合并六个源阶段，独立包保持自己的路线。它也把 `--force`、声音/语速/`--prune`、`--strict` 分别传给 assets、audio、validate；不接受 `--dry-run`。默认 validate 不是严格模式，发布时传 `--strict` 或像上例单独严格检查。需要逐步运行或自选声音时：

```sh
pnpm content:assets --pack content/examples/hello-pack
pnpm content:audio --pack content/examples/hello-pack --voice-zh Tingting --voice-en Samantha --rate 165
pnpm content:validate --pack content/examples/hello-pack --strict
pnpm content:bundle --pack content/examples/hello-pack
pnpm content:zip content/examples/hello-pack --out release/
```

非 macOS 的 audio 会说明环境并退出 0，不生成离线音频；普通校验仍会显示缺音，strict 会失败。应在 macOS 完成音频交付，而非伪造 manifest。修改或删除文本后的增量及 `--prune` 行为详见流水线指南。

bundle 只包含校验通过的课程，props 已补默认值。坏课会被跳过，其他好课仍能写出；**如果报告有 error，命令仍非零退出，不能据“生成了 bundle”就发布。** 路线里引用的坏课也需要修复。

### 导入步骤

1. 用管理员身份进入后台内容包管理，选择导入并上传本次生成的 zip。
2. 服务端入口为 `POST /api/packs/import`，multipart 字段名 `file`，需要 admin token。zip 根应有 `pack.json`，或只有一层外目录包含它。
3. 阅读返回的校验 issues，确认包 ID、版本、词条数、课程数和启用状态，必要时启用该包。
4. 为孩子选择 `sprout.hello.route`，而不是保持默认的 `sprout.core.route`。本例覆盖 `[18,26]`：18–23为家长课，24–26为亲子共看课，其他年龄不会自动排入。
5. 在播放端查看封面、词卡、数量句，分别试听中文和英文；测试暂停、退出以及结束后的线下提示。确认无自动连播。

服务器把导入包放在 `data/packs/<id>/`。同 ID 同版本可覆盖（用于备份回导），也可升级，不能降级；导入版优先于同版本内置包，保留启停状态。源码包仍由原目录维护，不通过修改 `data/packs/` 来替代可复现的版本构建。只有 `content/examples/hello-pack` 源码存在时，后台不会自动列出它。

## 10. 升级与发布检查

保持 `pack.id` 不变，增大 `version`，例如修正文案 `1.0.0 → 1.0.1`、增加课程 `1.0.1 → 1.1.0`。`schemaVersion` 仍为 `1`；只有契约迁移时才由契约维护者升级，不能用它解决导入版本冲突。

已有课程、词条、路线 id 尽量稳定，避免让历史学习记录和排课引用失联；重命名时逐项迁移引用，不只修改文件名。使用本机生成的旧音频需按文本 key 更新；声音或语速变化会根据已有生成记录触发重配音。若旧音频缺少声音/语速记录，需要按流水线指南显式处理，不能只看文件名判断录制参数。

发布检查：

- `pnpm content:typecheck`、`pnpm content:test` 成功。
- 目标包 `content:validate --strict` 无 error、无 warning。
- 包内词条、路线、课程、图片闭合，示例没有偷偷依赖核心包。
- bundle 是本次校验后的产物，没有被跳过的坏课；音频覆盖与试听均完成。
- zip 包含全部必要资源和许可全文，不包含缓存、临时文件、旧 zip 或凭据。
- 管理后台同 ID 高版本导入通过；课程、路线和启用状态正确，孩子实际可以进入。
- 亲子陪伴、慢节奏、温和反馈、短时使用与线下活动都落实在课程中。

若核心包正在由其他任务补齐，单独校验它可能因声明路线缺失而 error，或因词库、课程、音频未完成而报告缺失。不要改掉核心 manifest、造占位素材或忽略其汇总来让命令变绿；独立示例应照常用自己的词条与资源通过结构检查。
