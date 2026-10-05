# 内容流水线

适用对象：维护内容包、素材和离线朗读音频的开发者。内容字段以 `packages/schema/src/*.ts` 为准，命令行为按 `docs/dev/tasks/T5-pipeline.md` 约定。新增课程的写法见 `docs/dev/content-pack-guide.md`。

## 1. 环境与检查入口

在仓库根执行，要求 Node 22.12 或更高版本、项目指定的 pnpm。根工作区依赖由项目统一维护；流水线的 vitest、XML parser 等独立工具依赖安装到 `scripts/`，不向根依赖字段加包。

```sh
pnpm --dir scripts install --ignore-workspace
export pnpm_config_verify_deps_before_run=false
pnpm content:typecheck
pnpm content:test
```

需要直接调用测试工具时：

```sh
npx --prefix scripts vitest run --config scripts/vitest.config.ts scripts
```

不要以根目录 `npx vitest run scripts` 能找到 vitest 为前提。单个流水线脚本由根 scripts 映射为 `tsx scripts/<name>.ts`；一般使用下方 pnpm 入口。

pnpm 11 在工作区依赖状态变化时可能先自动运行全工作区安装。并行开发时上面的环境变量只对当前终端禁用这一预检查，使用已安装依赖，不修改共享配置；缺少依赖时仍需明确安装。验收测试使用单 worker，测试与构建串行运行。

## 2. 命令与 flags

除 zip 的包路径是位置参数外，其余内容命令用 `--pack <dir>` 指定包。路径含空格时加引号。未指定包时处理 `content/packs/` 下的内容包；`content/examples/hello-pack` 必须显式指定。

| 命令 | 脚本 | 接受的参数 |
| --- | --- | --- |
| `pnpm content:route` | `scripts/merge-route.ts` | `--pack <dir>` |
| `pnpm content:assets` | `scripts/fetch-assets.ts` | `--pack <dir>`、`--force` |
| `pnpm content:audio` | `scripts/gen-audio.ts` | `--pack <dir>`、`--voice-zh Tingting`、`--voice-en Samantha`、`--rate 165`、`--dry-run`、`--prune`；只写本地忽略音频 |
| `pnpm content:validate` | `scripts/validate-content.ts` | `--pack <dir>`、`--strict` |
| `pnpm content:bundle` | `scripts/bundle-pack.ts` | `--pack <dir>` |
| `pnpm content:zip <packDir>` | `scripts/pack-zip.ts` | `--out release/` |
| `pnpm content:all` | `scripts/content-all.ts` 独立 runner | `--pack <dir>`、`--force`、`--prune`、`--strict`、`--voice-zh <name>`、`--voice-en <name>`、`--rate 165` |

`content:all` 顺序固定为 **route → assets → audio → validate → bundle**，不是 zip 发布命令。route 只合并 `sprout.core` 的 `routes/_stages/s1..s6.json`，按月龄排序并检查 6–36 月龄无缺口、无重叠；其它包跳过该步骤。它通过独立 runner 把包参数交给每一个子命令，不依赖 shell 串联后只让最后一条命令收到参数。专用参数分别分发：`--force` 给 assets，声音、语速和 `--prune` 给 audio，`--strict` 给 validate。任一步非零退出即停止后续步骤。all 不接受 `--dry-run`，只预览音频计划时单独运行 audio。

### hello-pack 本地流程

以下流程只在需要个人本地朗读时生成音频；公开 bundle 和 zip 不带这些录音：

```sh
pnpm content:assets --pack content/examples/hello-pack
pnpm content:audio --pack content/examples/hello-pack --dry-run
pnpm content:audio --pack content/examples/hello-pack
pnpm content:validate --pack content/examples/hello-pack --strict
pnpm content:bundle --pack content/examples/hello-pack
pnpm content:zip content/examples/hello-pack --out release/
```

hello-pack 的图片都是自绘 `custom`，assets 步骤只检查存在性，不访问 Fluent Emoji。也可以用 `pnpm content:all --pack content/examples/hello-pack` 完成前四步，但其中 validate 为普通模式；发布前仍单独跑严格校验。

只检查源码、不生成任何发布产物：

```sh
pnpm content:validate --pack content/examples/hello-pack
```

公开包使用 `voices: {}`、`entries: {}` 的空清单是合法状态。未生成预录音频时，validate 会显示 `0/N` 覆盖率，但不会把“缺音”当作 warning；播放端按“预生成音频 → Web Speech API → 文字”回退。若清单只声明了部分音频，缺失项仍会报告 warning；清单指向不存在的文件仍是 error。

## 3. 包目录与路径

```text
<pack>/
  pack.json
  lexicon.json
  LICENSES.md
  assets/
    sources.json
    images/...
  routes/*.json
  lessons/**/*.json
  audio/manifest.json          # 公开清单，可为空
  audio/manifest.local.json    # 本地生成，gitignore
  audio/tts/zh/*.m4a           # 本地生成，gitignore
  audio/tts/en/*.m4a           # 本地生成，gitignore
  bundle.json                 # 生成
```

- `pack.json` 的默认 `lexicon` 为 `lexicon.json`，默认 `lessonsDir` 为 `lessons`，默认 `routes` 为 `[]`；路线必须在 manifest 中显式列出。
- 包内资源从包根解析，例如 `assets/images/shapes/circle.svg`，不是从课程 JSON 所在目录解析。不要写本机绝对路径、`..`、反斜杠或开发服务器临时地址。
- 发布后资源 URL 由宿主拼成 `/packs/<packId>/<packPath>`。内容 JSON 不要把该前缀硬编码为图片路径。
- 服务端会扫描 `content/packs/` 与导入目录 `data/packs/`；示例目录不是自动加载目录。
- `bundle.json` 是读取加速与离线消费产物，不是编辑入口。先改源 JSON，再重建。

## 4. 图片来源、下载与增量

`assets/sources.json` 的 key 是包内目标路径，value 说明来源：

```json
{
  "schemaVersion": 1,
  "items": {
    "assets/images/animals/dog.svg": {
      "source": "fluent-emoji",
      "name": "Dog",
      "style": "Color"
    },
    "assets/images/family/grandma.svg": {
      "source": "fluent-emoji",
      "name": "Old woman",
      "style": "Color",
      "skinTone": "Default"
    },
    "assets/images/shapes/circle.svg": {
      "source": "custom"
    }
  }
}
```

`name`、`style`、`skinTone` 必须对应官方仓库真实目录，不能凭本地文件名猜远端路径。普通图形为 `assets/<Name>/<Style>/<file>.svg`；带肤色的为 `assets/<Name>/<SkinTone>/<Style>/<file>.svg`。源码中原有名称可能含空格，以 tree 查询结果为准。

下载器从官方 GitHub API 读取 `git/trees/main?recursive=1`，缓存到 `scripts/.cache/fluent-tree.json`，有效期 7 天；再从官方 raw 地址下载具体文件：

```text
https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/main?recursive=1
https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/<path>
```

- 默认跳过已经存在的下载文件；`--force` 重新下载 Fluent Emoji 文件，不覆盖 `custom` 原创素材。
- 下载后校验 SVG 结构，保留 `viewBox`，把固定 `width`、`height` 规范化为 `100%`。
- `custom` 只检查文件是否存在，不联网、不自动画图；作者应提交真实、可显示的文件。
- 名称找不到时报告相近名称建议并非零退出；对照官方目录修正 `sources.json`，不要下载一个名字相近但含义不同的图充数。
- 图片来源清单不是署名清单。每种来源仍须进入 `pack.json.credits` 与 `LICENSES.md`，保留许可要求的完整声明。

## 5. 朗读收集与文件名

统一收集函数位于 `scripts/lib/collect-speech.ts`，供流水线与后续功能复用。作者只写文本，不自行拼音频文件名。先经 schema 解析、补全活动默认值，再收集、规范化并去重。

### 固定与词库内容

- 全部词条的 `zh`、`en`、`sound.zh/en`、`phrase.zh/en`。
- `@sprout/schema` 的全部 `PHRASES`，不能在课程里另写一套近似固定提示语。
- 1–10 唱数：`numberToZh(n)`、`numberToEn(n)`。唱数的“二”不同于数量短句中的“两”。

### 每种活动的内容

课程 `audience` 缺省为 `child`；`audience: "parent"` 只收集 `song.title`，不读 guide、歌词、打印材料和线下引导。词库与固定 `PHRASES` 始终全量采集。以下表格为 child 课的活动字段语义；低月龄非法 child 课不会生成朗读。

| 活动 | 收集内容 |
| --- | --- |
| `contrast` | `narration` |
| `word-cards` | `intro`；按 `speak` 收集词条名，以及 `name+sound` 的拟声或 `name+phrase` 的短句；`none` 不读引用词条 |
| `peekaboo` | `ask`、`reveal`，含 schema 默认值，以及词条名 |
| `bubbles` | `sayName: true` 时的词条名 |
| `count` | 每轮唱数，以及 `cardinality: true` 时的 `cardinalitySpeech(count, concept)` 基数句 |
| `subitize` | 每轮唱数；有 `item` 时另收集基数句，默认圆点不虚构词条短句 |
| `choose` | `prompt`、`explain`、选项词条名；没有概念的对象选项可用 `label` |
| `sort` | `prompt`、物体名、篮子的 `label` |
| `sequence` | `intro`、每步 `say`，省略 `say` 时用 `caption` |
| `pattern` | `intro` 或默认提问、序列词条名及填入序列的正确答案词条名 |
| `story` | `title`、`narrate: true` 的每页 `text` |
| `song` | `title`，不生成歌词的 TTS，歌词由家长跟唱 |
| `movement` | `intro`、每个动作的 `say` 与 `name` |
| `calm` | `say`；内置呼吸提示来自固定语料 |
| `video` | 只收集实际朗读的 `title`，不抓取视频声音 |
| `web` | 不抓取网页内容来生成朗读 |
| `guide` | 不产生任何朗读；`steps[].say` 仅显示给家长参考 |

上述开关只影响课程引用的收集，本包词库仍全量收集名字、拟声与短句。`parentGuide` 不朗读，`parentTip` 与绘本家长提问也不是孩子的 TTS 语料。短课也会带上全部固定语料，因此“只有几张词卡”并不意味着只生成几条音频。

### 命名与清单

```text
key = speechKey(lang, text)
    = lang + ":" + text.trim().replace(/\s+/g, " ")

path = audio/tts/<lang>/<sha1(key) 前 16 位小写 hex>.m4a
```

`speechKey` 只规范首尾和连续空白，不移除标点、不改大小写、不翻译。修改句末标点也会产生新 key。声音、语速不参与 key，也不参与文件名。

公开 `audio/manifest.json` 必须满足 `AudioManifest`：

- `schemaVersion: 1`。
- `voices` 是语言到实际所用、且有再分发授权的声音映射；公开无录音包使用 `{}`。
- `entries` 是上述 key 到包内音频路径的映射；公开无录音包使用 `{}`。

`content:audio` 不再改写公开 `audio/manifest.json`。它把个人 macOS `say` 产物写到被 `.gitignore` 忽略的 `audio/tts/`，并把声音与路径写到被忽略的 `audio/manifest.local.json`。服务端静态包读取时会把本地清单与公开清单合并；播放端只有显式设置 `SPROUT_LOCAL_AUDIO=1` 的本地开发构建才合并它。默认网页、演示构建、原生构建、bundle 和 zip 都只消费公开清单。

播放端优先使用公开或本地清单命中的音频；未命中则尝试 Web Speech API，再不可用时只显示文本。这个回退不等于离线音频已经齐全。

## 6. macOS 音频生成、增量与清理

默认中文声音 `Tingting`、英文声音 `Samantha`、语速 `165`。实际生成仅支持 macOS，使用系统命令。系统声音只允许个人非商业本地使用：

```sh
say -v Tingting -r 165 -o tmp.aiff "圆形"
afconvert -f m4af -d aac -b 64000 -c 1 tmp.aiff out.m4a
```

这是底层转换示意；实际实现通过临时文本文件把内容交给 `say -f`，避免把正文当作命令参数。日常使用 `pnpm content:audio` 管理临时文件、并发和本地清单。并发数为 4，存在且生成参数未变化的音频增量跳过，完成后更新 `audio/manifest.local.json`。

```sh
pnpm content:audio --pack content/examples/hello-pack --voice-zh Tingting --voice-en Samantha --rate 165
pnpm content:audio --pack content/examples/hello-pack --dry-run
pnpm content:audio --pack content/examples/hello-pack --prune
```

- `--dry-run` 用于查看待生成语料与计划，不创建音频或改写清单；不要把 dry-run 成功当作覆盖率通过。
- `--prune` 清理已不再引用的清单项，并删除 `audio/tts/zh/`、`audio/tts/en/` 内符合“16 位小写 hex + `.m4a`”命名且不再被清单引用的孤儿文件，包括中断遗留的生成文件。不清理图片、课程或其他命名的手工录音；手工素材不要占用这一生成命名空间。
- 改文本后重新运行即可生成新 key。删文本后需要 `--prune` 才显式清理旧映射与生成命名空间中的孤儿音频。生成发生错误时不会提交新清单或执行清理，应先修复并重试。
- `audio/manifest.local.json` 的 `voices` 记录声音，`audio/.tts-settings.local.json` 记录语速。虽然文件名不含声音与语速，脚本会根据已有记录检测变化并重新生成受影响的文件；本地清单和 settings 都不会进入 bundle 或 zip。
- 对未保留声音或语速记录的旧文件，脚本不能可靠推断其参数，会自动重新生成当前引用的音频，不冒充已知来源。整批合成先写隐藏暂存目录，全部成功才替换正式文件；部分合成失败不会混用新旧声音，暂存目录在退出时删除。
- 查看可用声音可运行 `say -v '?'`。缺声音时在 macOS 系统设置中下载对应声音，或显式选择已安装的声音。
- 非 macOS 会打印环境说明并退出 0，不会凭空生成音频。个人非商业家庭自用的完整离线包可在 macOS 上生成真实文件；公开发布须按下一节换用有分发授权的音频。生成命令退出 0 不等于已有音频或获得分发授权。

### 音频授权与公开发布

**macOS 系统声音（包括 Tingting、Samantha）生成的音频仅限个人非商业使用，不可公开再分发。** 不得随公开仓库、下载 ZIP、网站、CDN、应用安装包或商业产品发布；免费、非营利和标注作者均不构成例外。原创课程或 SVG 的 CC0、Fluent Emoji 的 MIT 不覆盖系统声音或其合成录音，也不能把“内部验收”当作额外授权。

核对日期：2026-10-03。本机为 macOS 26.3.2，参考 Apple《macOS Tahoe 26 软件许可协议》第 2.F 节（Voices; Live Captions）；实际使用须遵守所安装版本及声音的条款：

```text
https://www.apple.com/legal/sla/
https://www.apple.com/legal/sla/docs/macOSTahoe.pdf
```

公开分发前，必须用明确允许相应用途及音频再分发的可商用 TTS，或已取得录音与分发授权的真人录音，**重新生成整个目标包的 `audio/`**，而不是只补缺音。真人录音不采集孩子声音；保留录音者授权、TTS 服务及具体 voice 的许可、核对日期与署名要求，写入 `LICENSES.md`、包 README 许可段和 `pack.json.credits`。当前系统音频不能因换了许可证文字或 TTS 设置就成为可公开发布的素材。

替换前先保存个人自用副本，在独立发布目录清除旧 `audio/tts/`、`audio/manifest.local.json` 与 `audio/.tts-settings.local.json`，避免增量缓存沿用旧声音；公开 `audio/manifest.json` 必须只登记已获再分发授权的文件。清理所有未引用的旧系统录音，再重建 bundle 与 ZIP。`content:validate --strict` 只核对结构、文件与覆盖率，不审查声音授权；根目录 `pnpm qa:license` 负责阻止 git 跟踪的 TTS 录音和 macOS voice 名称。

### 服务端 TTS provider 接入

现有扩展接口位于 `apps/server/src/tts/provider.ts`，由 `apps/server/src/tts/index.ts` 导出：

```ts
interface TtsProvider {
  readonly id: string;
  status(): Promise<{ available: boolean; voices: { zh: string[]; en: string[] } }>;
  synthesize(input: {
    lang: 'zh' | 'en';
    text: string;
    voice: string;
    outputPath: string;
  }): Promise<void>;
  close?(): Promise<void>;
}
```

provider 的 `id` 应稳定，`status()` 只报告确实可用且已获授权的 voice ID；`synthesize()` 将真实、非空的 M4A 写入服务端分配的绝对 `outputPath`，不播放声音。若供应商输出其它编码，适配器须转换为 M4A，并落实超时、响应大小限制、失败清理和凭据保护；不得上传家庭档案或儿童个人资料。`close()` 用于释放客户端与任务资源。

服务端负责人在 `apps/server/src/app.ts` 创建 `TtsService` 处注入已经实现的 provider：

```ts
tts = new TtsService({
  dataDir: config.dataDir,
  getSettings: () => store.settings(),
  provider: licensedProvider,
});
```

这里的 `licensedProvider` 指实际实现，不是仓库已经提供的商业服务。随后由管理员 `PUT /api/settings` 设置 `ttsProvider: "auto"` 与 `ttsVoices` 的真实 ID；`macos-say` 只允许同名系统 provider，`none` 禁用生成。通过 `GET /api/tts/status` 确认声音，再用 `POST /api/tts`（`{lang,text}`）验证生成。API 没有任意 provider 名称枚举或现成商业 TTS 环境变量；接入需要服务端代码配合，本内容任务不改服务端。

服务端只为 `sprout.custom` 写入音频与清单，**不会替换 `sprout.core` 或扩展包的既有文件**。离线包可复用 `collectSpeech()`、`audioRelativePath()`，并在 `generateAudio()` 的第三参数中注入 `runtime.render`，将每条语料交给获授权的 provider 或录音映射；声音参数使用真实新 voice ID 以避免跳过旧音频。现有 CLI 仍固定使用 `say`、且保留 macOS 平台检查，没有 `--provider` 开关；跨平台与商业 CLI 需要另行实现，不能仅修改后台设置后继续运行默认 `content:audio` 当作重新授权。

### 保持音频契约

更换音频来源时不修改 schema、课程 JSON、语言顺序或 `speechKey(lang, text)`。`AudioManifest` 始终为 `schemaVersion: 1`、`voices`、`entries` 三项；`voices` 记录实际 voice ID（真人录音可用稳定的录音者标识），`entries` 仍把同一个文本 key 映射到真实包内 M4A 相对路径。公开无录音包可以使用空 `voices` 和 `entries`；本地 `manifest.local.json` 只用于个人开发合并，不进入发布物。

重建后串行运行目标包 `content:validate --strict`、`content:bundle`、`content:zip`，确认资源、许可齐全、ZIP 无 `audio/tts/` 本地录音；有预录音频时再逐一确认真实可解码和中英文试听。源码和自绘素材可以按其原许可另行发布，不随附系统生成录音。

## 7. 校验范围、警告与缺失内容

validate 是只读检查，不补造词库、课程或声音。它检查：

1. `PackManifest`、`Lexicon`、`validateConcepts`、每个词条图片。
2. `Route` 及阶段连续性、主题唯一性、主题引用课程存在性。
3. `validateLesson` 的结构、活动 props、默认值与词库引用。可用词条集合为本包加 `sprout.core`；独立包不应把核心词库当成隐含依赖。
4. manifest 声明路线时，每课只属于一个主题、`themeId` 与主题相同、课程和阶段月龄有交集；`routes: []`（含缺省）扩展包免除主题归属次数检查，不要求虚构路线。已声明但缺失或损坏的路线仍报 error，并保留归属检查。
5. `sprite.image`、课程封面等引用的包内资源真实存在。
6. 朗读音频覆盖率与缺失前 20 条文本；空公开清单是合法的可选音频状态，只有部分清单的缺口才是 warning。
7. 中文句子误用英文半角标点的 warning；英文文本正常使用英文标点。
8. `childScreen: "none"` 阶段只能引用 parent 课（error）；child 课须 `coView: "required"` 且 `durationMin` 不超过所在阶段 `sessionMaxMin`（warning）。
9. 打印 cards 的词条图片按本包优先、核心包回退检查所属包文件，内联图片也检查存在性；contrast 使用 schema 图案，不伪造图片。

缓存/临时路径中的资源不会进入发布包，因此引用这些文件会 error；`bundle.json` 为保留的生成路径，不得当作源词库、路线或封面，脚本会拒绝覆盖。

月龄均为整数闭区间。相邻阶段应满足 `后一阶段最小月龄 = 前一阶段最大月龄 + 1`；如 `[24, 26]` 接 `[27, 29]`。`[24, 26]` 接 `[26, 29]` 会重叠。

### 结果如何处理

| 情况 | 处理原则 |
| --- | --- |
| `pack.json` 缺失、JSON 语法或 schema 错误 | error，修复源文件 |
| manifest 已声明的路线文件缺失、路线引用不存在课程 | error，不因“还没写完”而假装通过 |
| 词库暂未提供，且没有使用其中的词条 | warning，报告缺失；词库本身允许可选，不制造空词条 |
| 课程引用了不存在的词条，或资源文件缺失 | error；即使缺的是核心词库，也要显示实际引用问题 |
| 没有课程、课程未归主题或重复归主题 | 无课程始终 warning；已声明路线的包归属问题为 warning；无路线扩展包只免除归属次数检查，其余规则不变 |
| 课程月龄与阶段无交集 | warning；修正月龄或主题归属 |
| 课程 `themeId` 与归属主题不一致 | error |
| 音频未生成或覆盖不全 | warning，显示真实覆盖率与缺失文本 |
| 音频清单已登记的文件不存在或为空 | error，不能把坏路径当作已覆盖 |
| 中文标点误用 | warning，修改文本并重新生成音频 |

普通模式：有 error 则非零退出，仅 warning 可以退出 0。`--strict`：error 或 warning 都非零退出。零条语料、缺失文件等状态应按报告阅读，不能把“不崩溃”理解成“内容完整”。

### 核心包尚在并行编写时

```sh
pnpm content:validate --pack content/packs/sprout-core
pnpm content:bundle --pack content/packs/sprout-core
```

`sprout.core` 的 manifest 固定声明 `routes/sprout-core-route.json`。该文件尚未交付时是明确的缺失 error；词库、课程、音频未就绪时也应分别报告，不得临时改掉 manifest 的路线、生成占位课程或吞掉异常。校验非零是可解释的阶段性结果，脚本仍需正常输出汇总而非未捕获异常。

hello-pack 的两个词条均来自自身。核心包尚未交付，不应造成它的概念引用错误。

## 8. bundle 与 zip

### bundle

`pnpm content:bundle --pack <dir>` 生成 `<pack>/bundle.json`，形状为 `PackBundle`：`schemaVersion`、`builtAt`、`manifest`、`lexicon`、`routes`、`lessons`、`audio`。

- 必须有可解析的 manifest，不能为坏包伪造身份。
- 只把通过校验的课程写入 `lessons`；props 为 zod 补全默认值后的结果。
- 遇到无效课程，跳过该课并报告路径和 issues；其他有效课仍可产出。
- **产出了 bundle 不代表成功退出。存在 error 仍返回非零退出码。** 发布者须检查汇总，不能只检查文件是否存在。
- 可选的词库、音频未提供时对应字段可为 `null`；公开包也可以提供结构合法但为空的 `AudioManifest`，不是编造伪音频。
- bundle 不会下载图片、生成音频或自动修复路线中对坏课的引用。发布前仍要整包 validate。

### zip 与后台导入

```sh
pnpm content:zip content/examples/hello-pack --out release/
```

以命令报告的实际输出路径为准。当前公开发布归档保留源 JSON、图片、许可文件和 `bundle.json`，不带任何录音；排除本地 `audio/tts/`、`audio/manifest.local.json`、生成缓存、临时文件、工具依赖与旧 zip。未来接入获授权音频时，应先扩展发布守卫和归档规则，再发布。不要把 `scripts/.cache/`、AIFF 中间文件或 `node_modules/` 打进内容包。

后端接受 zip 根目录有 `pack.json`，或只有一个外层目录且该目录含 `pack.json` 的结构。不要再套多层目录。后台导入等价于管理员请求：

```sh
curl --fail-with-body \
  -H "Authorization: Bearer $SPROUT_ADMIN_TOKEN" \
  -F "file=@$PACK_ZIP" \
  http://localhost:4310/api/packs/import
```

`SPROUT_ADMIN_TOKEN` 与 `PACK_ZIP` 是调用者环境变量，分别为管理员 token 与命令实际输出的 zip 路径；不要写入包或提交到 git。文件字段名必须是 `file`。导入后查看 issues、启用状态、课程和路线，再给孩子选择对应路线。HTTP 成功不是试听和资源检查的替代品。

## 9. 常见问题

| 现象 | 检查与处理 |
| --- | --- |
| 找不到 vitest / XML parser | 在仓库根执行 `pnpm --dir scripts install --ignore-workspace`，再用 `content:test`、`content:typecheck` |
| 下载失败、GitHub 限流、tree 不完整 | 查看具体 URL 与网络错误；检查 7 天缓存，不改成其他来源的无许可图片 |
| `custom` 素材缺失 | 补交源码 SVG；`--force` 不会生成自绘素材 |
| SVG 显示为空或被裁切 | 检查合法根节点、`viewBox`、图形边界；拒绝脚本与外链，避免固定像素尺寸 |
| 修改声音参数却还是旧声音 | 检查本地 `manifest.local.json` 的声音与 `.tts-settings.local.json` 的语速记录；旧文件缺少参数记录时按重配音流程处理 |
| 普通 validate 成功但 strict 失败 | 检查 warning，最常见为部分音频清单缺音、课程归属和中文标点；空公开音频清单不会单独触发 warning |
| bundle 生成了但命令失败 | 检查被跳过的无效课程或其他 error，不能直接发布残缺课程集 |
| 本地能读，电视离线不发声 | 核对音频文件、manifest、最新 bundle，不能依赖本机 Web Speech 回退 |
| hello-pack 没出现在后台 | `content/examples/` 不自动扫描，需打包导入或由维护者复制到正式内容目录 |
| 同 ID 新包导入失败 | 可同版本覆盖或升级，不能降级；不要更改 `schemaVersion` 冒充升级 |

发布前至少确认：严格校验无 issues、`qa:license` 通过、zip 内容完整且不含本地录音、许可声明齐全、导入后路线可选；有授权音频时再试听中文和英文。无预录音频时确认 Web Speech/文字回退和课程结束后确实转向线下互动而非自动连播。
