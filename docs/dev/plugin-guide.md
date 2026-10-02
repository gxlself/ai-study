# Sprout 插件开发指南

本文对应 `SDK_VERSION = 1.0.0`、内容 `schemaVersion = 1`。数据以 `packages/schema/src/` 为准，运行时以 `packages/plugin-sdk/src/types.ts` 为准，视觉令牌以 `tokens.css` 为准。SDK 与 schema 均通过 workspace 的 TypeScript 源文件导出，不要引用一个不存在的 SDK `dist`。

## 1. 插件边界

一个活动只负责在宿主给定的 16:9 容器内呈现一个有限的互动。宿主负责课程、孩子与语言设置、资源解析、空间导航、计时、家长门、音频后备与学习记录。插件不能自行连播下一节课、绕过休息限制或操作容器外 DOM。

内置活动共 17 个，type 无点号，顺序与 `BUILTIN_ACTIVITY_TYPES` 一致，末项为 `guide`；第三方 type 必须形如 `example.hello-stars`。插件包 id 与活动 type 不是一回事：一个 `example.hello` 包可以导出多个命名空间活动。

### 家长指引课与亲子共看课

`Lesson.audience` 可选，缺省为 `child`，不能从活动类型、孩子月龄或是否有计时器猜测。`parent` 课屏幕仅供家长阅读或学唱，看完去陪玩，不计入孩子屏幕时间；`PARENT_ACTIVITY_TYPES = ["guide", "song"]` 是明确白名单，第三方活动不能靠更改 audience 加入 parent 课。

6–17 月龄全部 parent 课，宝宝使用 `printables` 的 cards/contrast 打印实体卡及实物，不看屏幕。18–23 月龄以 parent 为主，共看默认关闭，家长开启后每节 ≤8 分钟。24–36 月龄提供 child 共看课，必须家长陪同，单次硬上限 20 分钟（路线默认分别为 10/15 分钟）。所有课程用 `coView: "required"`，不提供独自观看模式；活动旧的低月龄 `ageRange` 元数据不等于屏幕许可。

`validateLesson` 检查 child 课 `ageRange[0] >= 18`、parent 课活动白名单和 printables 词库引用。宿主按阶段 `ScreenPolicy.childScreen` 的 `none/optional/default` 与 `ChildScreenSettings.mode` 的 `auto/parent-only/co-view` 决定入口，默认时段 08:00–18:30；18 月龄以下强制 parent-only。宿主上报 `SessionInput.audience` 并计算孩子屏幕时间，插件不得修改或绕过这些规则。`ActivityContext.lesson` 仍只有原来的 id/title/stepIndex/stepCount，不擅自扩展 SDK 契约读取 audience。

具体路线见 `docs/curriculum/route-plan.md`；完整课程仍需 `offline`，可用 `question` 与 `levels.easier/harder` 编写线下提问和难度变体。打印材料不属于活动步骤，不能将输出 SVG 的显示时长当成家长课来规避孩子计时。

最小包：

```text
plugin.json
index.js          # 单 ESM，默认导出 ActivityPlugin 或 ActivityPlugin[]
assets/           # 可选，使用本包资源时必须随 ZIP 交付
```

推荐从 `plugins/examples/hello-plugin/` 开始。该示例使用原生 DOM，没有 React 运行时依赖；样式内置，ZIP 只有清单与单个 ESM。`src/index.ts` 默认导出插件，并导出 `HelloProps` 类型和 props 解析函数。

## 2. 清单与 JSON Schema

`plugin.json` 由 `PluginManifest` 校验。`entry` 是安装后相对路径或远程绝对 URL；ZIP 示例用 `index.js`。`sdk` 是兼容范围，`version` 是插件自身版本。`permissions` 可列 `network`、`microphone`、`camera`、`storage`，不用的能力不要声明。

以下 JSON 可作为一个最小声明，完整可构建版本在示例目录：

```json
{
  "schemaVersion": 1,
  "id": "example.hello",
  "version": "1.0.0",
  "name": { "zh": "你好，星星", "en": "Hello, Stars" },
  "sdk": "^1.0.0",
  "entry": "index.js",
  "permissions": [],
  "activities": [{
    "type": "example.hello-stars",
    "name": { "zh": "一起数星星", "en": "Count the Stars" },
    "ageRange": [18, 36],
    "propsSchema": {
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "count": { "type": "integer", "minimum": 1, "maximum": 5, "default": 3 }
      }
    },
    "defaultProps": { "count": 3 }
  }]
}
```

JSON Schema 使用 draft 2020-12。明确枚举、上下限、嵌套 required 和额外字段策略。JSON Schema 的 `default` 是描述，不要假定任何校验器都会替你赋值；运行时仍做防御与补默认。后台 `defaultProps` 用于初始化编辑表单，需与解析器一致。`propsSchema` 描述 props，不要包上 `ActivityStep` 外层。

## 3. 生命周期

```ts
import type { ActivityPlugin, ActivityContext } from '@sprout/plugin-sdk';

interface Props { message: string }

const plugin: ActivityPlugin<Props> = {
  type: 'example.message',
  version: '1.0.0',
  name: { zh: '说你好', en: 'Say hello' },
  mount(el, ctx: ActivityContext<Props>) {
    const button = el.ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.focusable = '';
    button.textContent = ctx.props.message;
    let done = false;
    let paused = false;
    let disposed = false;
    const choose = () => {
      if (done || paused || disposed || ctx.signal.aborted) return;
      done = true;
      ctx.log('message:confirmed');
      ctx.complete({ data: { confirmed: true } });
    };
    const unmount = () => {
      if (disposed) return;
      disposed = true;
      button.removeEventListener('click', choose);
      ctx.signal.removeEventListener('abort', unmount);
      button.remove();
      ctx.stopSpeaking();
      ctx.setParentHint(null);
    };
    button.addEventListener('click', choose);
    ctx.signal.addEventListener('abort', unmount, { once: true });
    if (ctx.signal.aborted) unmount();
    else { el.append(button); ctx.focus.refresh(); }
    return {
      unmount,
      onKey(key) {
        if (key !== 'ok') return false;
        choose();
        return true;
      },
      pause() { paused = true; ctx.stopSpeaking(); },
      resume() { paused = false; },
    };
  },
};
export default plugin;
```

`mount(el, ctx)` 可同步或异步返回 `ActivityInstance`。异步加载期间也需检查 signal；卸载是幂等的，清理所有 DOM、事件监听、订阅、计时器、WebAudio 节点及未决工作。`ctx.complete` 后不再触发交互、日志或下一轮计时，插件自身也需限制完成一次。

`pause()` 停住互动、声音与计时；`resume()` 从剩余进度恢复，不把后台停留计入活动时长。按 audience 计时与 idle 自动暂停由宿主负责；插件不能用循环计时、自动翻页或播放事件冒充用户输入。家长学唱的 song 也不是背景音乐模式。家长主动开始的 guide 暗屏离线陪玩计时不持续播音、不属于背景播放，应豁免无人交互的 idle 暂停；切后台仍可 pause，暂停不消耗剩余陪玩时间。仅仅在 DOM 上设置 disabled 不会停止 timer；显式维护剩余时长。中止不能依赖某个 `speak()` Promise 一定会及时 resolve：使用 AbortSignal 或代次标记，让旧 Promise 无法推进新实例。

## 4. ActivityContext 能力

| 能力 | 使用方式 |
| --- | --- |
| `props` | 已解析的活动参数；内置活动由对应 Zod schema 补默认 |
| `sdkVersion` | 当前宿主契约版本 |
| `lesson` / `child` | 当前课程、步骤索引/总数、孩子名字与月龄；只取互动必需字段 |
| `locale.mode` | `zh`、`zh-en`、`en-zh`、`en` |
| `locale.pick(text)` | 得到 `primary` / 可选 `secondary`；不要把中文固定成所有模式的主语言 |
| `locale.showPinyin` | 拼音显示偏好 |
| `input.mode` / `input.onChange(cb)` | `dpad`、`touch`、`pointer`，订阅返回退订函数 |
| `reducedMotion` | 关闭循环动画、减弱过渡；也尊重系统 CSS 媒体查询 |
| `resolveAsset(path)` | 内容包相对路径或 URL 转为可访问资源地址 |
| `concept(ref)` | 字符串词库 id 或内联 `{zh,en?,image,...}` 转 `ConceptView`；找不到返回 undefined |
| `speak(speech, options?)` | `Speech` 或中文字符串；按语言模式读，支持 mode/gapMs/interrupt |
| `say(lang, text)` | 读单语文字 |
| `stopSpeaking()` / `sfx(name)` | 停朗读；柔和音效，合法名字见类型契约 |
| `playAudio(url)` | 播放已解析音频，结束 resolve |
| `audioContext()` | 宿主共享 AudioContext，首次用户交互后才能发声；插件只清理自己的节点，不关闭宿主共享 context |
| `complete(result?)` | 结束本步；accuracy 0–1 仅用于家长报告，绝不作为孩子分数 |
| `log(type, data?)` | 关键交互事件；不写隐私、不记录高频逐帧噪音 |
| `setParentHint(text\|null)` | 不朗读的家长提示；退出前清空 |
| `focus.refresh/focus/current` | DOM 变化后重新扫描、主动定位、读取当前焦点 |
| `signal` | 宿主中止，必须立即停止计时与声音 |

`Speech`、`LText`、`ConceptRef`、`LanguageMode` 等数据类型从 `@sprout/schema` 导入；`ActivityPlugin`、`ActivityContext`、`ConceptView`、`NavKey`、`InputMode`、`ActivityResult` 从 `@sprout/plugin-sdk` 导入。不要假设 SDK 重导出所有 schema 类型。

## 5. 输入与视觉

元素加 `data-focusable`，宿主以 `.sp-focused` 标记选中态。DOM 更新后调用 `ctx.focus.refresh()`。`onKey` 接收 `up/down/left/right/ok/back`，已处理才返回 true；否则宿主做默认空间导航/点击。`back` 通常返回 false，交家长门。避免同时在 DOM keydown 和 onKey 处理一次 OK。

触屏与遥控器共享同一业务动作。不可依赖拖拽；焦点和点按目标都要足够大。输入提示订阅模式变化，在“按 OK”与“点一点”之间切换，卸载时退订。异步讲话过程中可以暂时禁用重复动作，不能重复计数。

宿主加载 `packages/plugin-sdk/src/tokens.css`，活动复用 `--sp-*`，不另起全局调色板。16:9 舞台四周留 `--sp-safe`，主体清晰大、文字少、无重叠，焦点使用 `--sp-focus-ring`。样式必须带自己的前缀；禁止 `body`、全局 `button` 等影响其它活动的选择器。慢动画 ≥450ms，不闪烁，减少动画时关闭循环。声音低音量，合成主增益 ≤0.25；不设刺耳音、红叉、金币、排名或成瘾奖励。

### guide 的成人阅读与陪玩流程

`GuideProps` 从 `@sprout/schema` 导入。goal 与 steps 必填，materials 默认空；步骤 text 使用中文成人正文 `--sp-font-md`，编号列表可附小图与“可以这样说”的 `say.zh/en`。materials、observe、safety 分区显示，safety 用柔和警示色。这里不是孩子识字界面，不用孩子侧主词字号或按语言模式隐藏家长中文正文。

`playMin > 0`：大按钮“开始陪玩 N 分钟”进入 `#0b0b0b` 暗屏，只保留中央暗色缓慢呼吸小圆点与低亮度倒计时；按键/点按显示“结束陪玩”。计时结束播放柔和 chime，显示“宝宝今天的反应？”的“很喜欢 / 一般 / 还不感兴趣”三个选项，选择后 `ctx.log("reaction", {value})`，再 complete，不计分或发奖励。`playMin = 0` 时“完成”直接 complete。

从阅读、开始、结束陪玩到反馈均需遥控器/触屏可操作，尊重 pause/abort/unmount 与 reducedMotion。guide 的 goal、步骤、say、observe、safety 全部由家长自己读，不调用 speak/say/playAudio；定时结束 chime 不是朗读。暗屏离线计时豁免 idle 自动暂停，但不绕过切后台 pause 或宿主中止。完整 props 示例见 `docs/dev/activities.md` 第 17 项，playground 的 `samples.guide` 提供短示例。

## 6. React 辅助与 Mock

框架无关契约不要求 React。内置活动可以使用：

```tsx
import * as React from 'react';
import * as ReactDOMClient from 'react-dom/client';
import { defineReactActivity, useActivityKeys, useActivityPaused } from '@sprout/plugin-sdk';
import type { ActivityContext } from '@sprout/plugin-sdk';

function Component({ ctx }: { ctx: ActivityContext<{ title: string }> }) {
  const paused = useActivityPaused();
  const finish = () => { if (!paused && !ctx.signal.aborted) ctx.complete(); };
  useActivityKeys((key) => {
    if (key !== 'ok') return false;
    finish();
    return true;
  });
  return <button data-focusable disabled={paused} onClick={finish}>{ctx.props.title}</button>;
}

export default defineReactActivity({
  type: 'example.react-hello', version: '1.0.0', name: { zh: '你好' },
  React, ReactDOMClient, Component,
});
```

`defineReactActivity` 显式接收 React/ReactDOMClient，或复用 `globalThis.SproutHost.React` / `ReactDOMClient`。不要仅把 React 标成 external 后留下浏览器无法解析的裸导入；打包策略必须匹配宿主能力。`defineActivity` 只是类型辅助。其它工具有确定性 `shuffle(items, seed)`、可取消 `wait(ms, signal)`、字符串转完整选项的 `chooseOptions`。

调试上下文按当前 SDK：

```ts
import { createMockContext } from '@sprout/plugin-sdk';
import type { ConceptView } from '@sprout/plugin-sdk';

const concepts: ConceptView[] = [
  { id: 'star', zh: '星星', en: 'star', imageUrl: '/assets/star.svg', measure: '颗' },
];
const controller = new AbortController();
const ctx = createMockContext({ count: 3 }, {
  concepts,
  locale: { mode: 'zh-en' },
  input: { mode: 'dpad' },
  reducedMotion: true,
  signal: controller.signal,
  complete: (result) => console.log('complete', result),
  log: (type, data) => console.log(type, data),
});
ctx.mock.setInputMode('touch');
controller.abort();
```

`locale`、`input` 接受部分字段；词库可传 `ConceptView[]`。外部 signal 由传入的 controller 中止，不要指望 `ctx.mock.abort()` 中止外部 controller。样例不应把未解析的最简 props 直接交给内置活动，应先 `BUILTIN_ACTIVITY_PROPS[type].parse(...)`。

## 7. 资源与语音生成边界

`preload(props, helpers)` 返回完整图片/音频资源 URL，词库图片从 `helpers.concept(ref)?.imageUrl` 取；包内路径用 `helpers.resolveAsset`。词库缺失时给温和占位，不抛错、不让 `<img>` 请求字符串 `"undefined"`。

**`speeches(props)` 的契约限制：它没有词库 helpers 或 ctx，因此无法从字符串词库 id 解析中文名、英文名、拟声、短句、量词或英文复数。** 不能返回 id 假装是朗读文字，也不能在这里请求运行时词库。它能收集 props 中实际存在的文字、内联概念的文字与可推导的固定提示。

`guide.speeches(props)` 明确返回 `[]`，不能因为 props 含有 `say.zh/en` 或内联概念就递归收集成语音。guide 的步骤插图仍走 preload，使用 `helpers.resolveAsset` 或 `helpers.concept` 解析；它们与打印实体卡都不应触发自动朗读。

音频流水线必须独立遍历内容包词库，生成中英名称、sound、phrase，以及数数所需的基数句；固定提示统一来自 `@sprout/schema` 的 `PHRASES`，唱数来自 `COUNT_RANGE`/数字工具。最终按 `speechKey(lang,text)` 去重，写 `audio/manifest.json`。只调用每个活动 `speeches(props)` 不能覆盖全部词库音频。播放端依次使用预生成音频、可用的 Web Speech、静默文字后备。

插件自带资源与课程内容包资源不要混淆：`ctx.resolveAsset` 面向课程包。插件模块自己的资产可用 `new URL('./assets/file.svg', import.meta.url)` 定位并一起打包；本原生示例没有外部资产。

### 高对比实体卡的纯 SVG 子路径

后台打印和 Node 内容工具共用内置图形，不 import 含 React/CSS 的活动模块：

```ts
import { contrastSvg, type ContrastPattern } from '@sprout/activities/contrast-svg';

const pattern: ContrastPattern = 'heart';
const svg: string = contrastSvg(pattern, 'bwr', { invert: false, size: 512 });
```

签名为 `contrastSvg(pattern: ContrastPattern, palette: "bw" | "bwr", opts?: {invert?: boolean; size?: number}): string`，也从 `@sprout/activities` 主入口导出函数。子路径直接指向 `src/contrast-svg.ts`，只有 type import，不依赖 DOM、React、运行时 schema 或页面样式；返回完整带 xmlns、背景及 `viewBox="0 0 200 200"` 的静态 SVG，不嵌音频、脚本或外链。

`size` 默认 200，须为正有限数值，修改的是宽高；`invert` 默认 false。bw 交换黑白；bwr 前景为红色、invert 切换黑白背景，红色不变。12 个图案与 schema 枚举一致，类型别名使用 `ContrastProps["patterns"][number]`，因为 schema 只导出同名 Zod 枚举值。非法图案/调色板/尺寸抛 `RangeError`，非布尔 invert 抛 `TypeError`，不进行字符串数值转换。内置 contrast 复用这些静态图形，动画仍由活动自身负责，打印端不会引入循环动效。

生成器只接收固定白名单与合法数值，不接受 SVG 源码；不要把用户输入拼进其返回值或把这种受限生成器当成任意 HTML 安全清洗器。给插入页面的图案提供对应可访问名称。

## 8. 打包、安装与远程登记

不安装新依赖的构建与测试命令：

```bash
node node_modules/typescript/bin/tsc -p plugins/examples/hello-plugin/tsconfig.json
node --import tsx --test plugins/examples/hello-plugin/test/*.test.mjs
node --import tsx plugins/examples/hello-plugin/scripts/build.mjs
```

ZIP 为 `plugins/examples/hello-plugin/dist/example.hello-1.0.0.zip`，不是把整个仓库或 dist 外层文件夹压进去。构建脚本验证只有一个 ESM、无动态/静态外部导入、默认导出存在，并用 fflate 检查 ZIP 内容。

后台上传 ZIP 对应 `POST /api/plugins/install`，multipart 字段 `file`，需管理员 token。安装位置 `data/plugins/<id>/`，入口访问 `/plugins/<id>/<entry>`。可用后台或以下本地命令，token 由你现有登录提供，不写入文件或提交：

```bash
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@plugins/examples/hello-plugin/dist/example.hello-1.0.0.zip" \
  http://localhost:4310/api/plugins/install
```

远程登记走 `POST /api/plugins/remote`，JSON `{ "manifestUrl": "https://你的插件域名/plugin.json" }`。远程服务器需提供浏览器可 import 的 JavaScript MIME、允许宿主来源的 CORS，清单相对 entry 按清单 URL 解析。只登记自己信任且可维护的服务，不把外部内容当作已审查内容。

查询 `GET /api/plugins`；启停 `PUT /api/plugins/:id` 的 `{enabled}`；删除非 builtin 插件 `DELETE /api/plugins/:id`。只上传/登记不会自动把活动加入课程；在自定义课的 steps 加入相应 type/props，再用播放端验证。

## 9. web 与视频安全

`web` 的 URL 必须为无嵌入凭据的 HTTP(S) 来源。iframe 使用 `sandbox="allow-scripts allow-same-origin"`，**拒绝与宿主同源**，因为同源脚本可破坏这样的 sandbox 隔离。生产 H5 应在独立、可信来源，并允许嵌入。宿主接收完成消息时同时校验 `event.source === iframe.contentWindow`、精确 `event.origin` 与 `data.type === 'sprout:complete'`；H5 也应发往精确父来源，不用 `"*"`。

本地实验台 `http://localhost:5312/` 的 web fixture 使用 `http://127.0.0.1:5312/`；反之亦然。它们是同机器同端口但不同 origin，不引入外网；父 origin 通过经过白名单校验的查询参数传入。回环双 origin 只是开发 fixture，不意味着任意本地网页可信。

`video` 使用本地 fixture、poster 和可选 VTT，不自动播放、不自动连播。`maxSec` 是上限；在暂停/卸载时释放活动媒体，不追踪孩子。网页同样遵守 maxSec，但跨来源 iframe 的内部计时器不由父组件普通 pause 自动接管，需要活动实现约定暂停方式。

## 10. 验证、版本与安全清单

playground 在 `packages/activities/dev/`，启动命令 `pnpm --filter @sprout/activities dev`，地址 `http://localhost:5312/`。详见本目录 README 的直接 Node 工具命令，禁止用调试替代实际播放端验收。playground 没有 StrictMode，独立 root 的异步 mount、abort、卸载都需测试。

最少测试覆盖全部 17 个内置活动：mount/unmount、开始前已 abort、加载中 abort、说话期间 abort、重复 complete、pause/resume、快速切换、新旧实例隔离、遥控器/触屏、四种语言、缺失素材、reducedMotion、无自动播放、完成不再推进。新增 guide 的阅读/暗屏计时/反应/零时长、speeches 为空且实际不朗读、宿主 idle 自动暂停及 guide 暗屏计时豁免、parent 课不计入孩子屏幕时间；纯 SVG 单独在 Node 测试 12 图案、调色板、反转、尺寸和注入安全。分别验证桌面/窄屏非空舞台、图片加载、布局不溢出与控制台错误。

`schemaVersion` 不等于 SDK semver，也不等于活动版本。`plugin.json.version` 与插件对象 version 同步；升级 SDK 主版本时重新核对类型、生命周期和焦点约定，不能仅扩大兼容范围。声明了版本范围不代表任何宿主一定实现了全部兼容检查，安装后仍需跑目标宿主验收。

普通 ESM 插件运行在宿主页面上下文，**权限声明不是强隔离沙箱**。只安装审查过的可信代码；不得访问容器外 DOM、扫描家庭网络、读取 host token、任意存储或收集个人信息。不要 `eval`、远端拉取脚本、把 props 注入 innerHTML。禁止背景播放、自动连播、积分、徽章、打卡、排行、推送、广告；无追踪、无外部统计，离线可用，文字图片适合婴幼儿。使用真实授权素材与可证明许可的旋律，署名与许可放清单/课程中。
