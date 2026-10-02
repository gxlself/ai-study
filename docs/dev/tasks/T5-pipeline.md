# T5 — 内容流水线：素材下载、朗读音频、校验、打包

## 所有权
`scripts/**`、根 `package.json` 的 **scripts 字段**（只改 scripts）、`content/packs/sprout-core/pack.json`、`content/packs/sprout-core/LICENSES.md`、`content/packs/sprout-core/audio/**`（由脚本生成）、`content/packs/sprout-core/assets/images/**` 中**由脚本下载**的 Fluent Emoji 文件、`docs/dev/content-pipeline.md`、`docs/dev/content-pack-guide.md`

**不归你**：`lexicon.json`、`assets/sources.json`、自绘 SVG（T6 正在写）；`routes/`、`lessons/`（后续任务写）。你的脚本要能处理它们暂时为空或不完整的情况。

## 约定（契约）
- 运行方式：`tsx scripts/<name>.ts`，可 `import` `@sprout/schema`（根 devDependencies 已有 workspace 依赖、tsx、fflate）。
- `assets/sources.json`（T6 产出）格式：
```json
{ "schemaVersion": 1,
  "items": {
    "assets/images/animals/dog.svg": { "source": "fluent-emoji", "name": "Dog", "style": "Color" },
    "assets/images/family/grandma.svg": { "source": "fluent-emoji", "name": "Old woman", "style": "Color", "skinTone": "Default" },
    "assets/images/shapes/circle.svg": { "source": "custom" } } }
```
- Fluent Emoji（github.com/microsoft/fluentui-emoji，MIT）：仓库 `assets/<Name>/<Style>/<file>.svg`，带肤色的为 `assets/<Name>/<SkinTone>/<Style>/<file>.svg`。通过 GitHub API `git/trees/main?recursive=1` 获取全量路径列表并缓存到 `scripts/.cache/fluent-tree.json`（7 天过期），用 `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/<path>` 下载。
- 音频命名：key = `speechKey(lang, text)`；文件 `audio/tts/<lang>/<sha1(key) 前 16 位 hex>.m4a`；清单 `audio/manifest.json`（`AudioManifest`），`voices` 记录所用声音。

## 脚本
1. **`scripts/fetch-assets.ts`**（`pnpm content:assets [--pack <dir>] [--force]`）：读取每个内容包 `assets/sources.json`；fluent-emoji 项按 name/style/skinTone 解析真实路径，下载到目标路径（已存在且非 --force 跳过）；下载后规范化 SVG：保留 viewBox、去掉固定 width/height（改为 100%）、确认是合法 SVG；名称找不到时给出相近名称建议（简单编辑距离），汇总报告并非零退出。custom 项只检查文件存在。
2. **`scripts/gen-audio.ts`**（`pnpm content:audio [--pack <dir>] [--voice-zh Tingting] [--voice-en Samantha] [--rate 165] [--dry-run]`）：
   - 收集该包全部可朗读文本（实现在 `scripts/lib/collect-speech.ts`，**导出供以后复用**）：
     词库每个词条的 zh/en 名、sound、phrase；`PHRASES` 全部常量（`@sprout/schema`）；数字 1–10 唱数（`numberToZh(n)` / `numberToEn(n)`）；
     课程中每个内置活动会读的文本（依据 `packages/schema/src/activities.ts` 字段语义并应用 zod 默认值后提取）：contrast.narration；word-cards.intro + 词条名/拟声/短句；peekaboo ask/reveal（含默认值）+ 词条名；bubbles 词条名；count 每轮 `cardinalitySpeech(count, concept)`；subitize 同 count；choose prompt/explain + 选项词条名；sort prompt + 物体名 + bin label；sequence intro + say（无 say 时 caption）；pattern intro + 序列词条名；story 每页 text（及 title）；movement intro + 每个 say + name；calm say；song 不朗读歌词（家长唱）但朗读 title。课程 `parentGuide` **不**朗读。
   - 仅 macOS：`say -v <voice> -r <rate> -o tmp.aiff "<text>"` → `afconvert -f m4af -d aac -b 64000 -c 1 tmp.aiff out.m4a`；并发 4；已存在的跳过（增量）；更新 manifest；删除清单中已不再引用的孤儿文件（`--prune`）。非 macOS 时打印说明并退出 0。
3. **`scripts/validate-content.ts`**（`pnpm content:validate [--pack <dir>] [--strict]`）：
   - pack.json（PackManifest）、lexicon（Lexicon + `validateConcepts`）、每个词条 image 文件存在、routes（Route）、课程（`validateLesson`，knownConcepts = 本包词条 + sprout.core 词条）；
   - 路线检查：阶段月龄连续且不重叠、主题 id 唯一、主题引用的课程都存在、每节课出现在且仅出现在一个主题（否则 warning）、课程 ageRange 与所在阶段有交集（否则 warning）、课程 themeId 与所在主题一致；
   - 引用的资源路径存在（sprite.image、cover.image 等包内路径）；
   - 音频覆盖率（可朗读文本中有音频的比例，列出缺失前 20 条）；
   - 中文文本不得含英文半角标点误用（warning，如中文句子用 "," 结尾）；
   - 输出汇总表；有 error 非零退出；`--strict` 时 warning 也失败。
4. **`scripts/bundle-pack.ts`**（`pnpm content:bundle [--pack <dir>]`）：生成 `<pack>/bundle.json`（`PackBundle`，只含校验通过的课程；props 使用 zod 补全默认值后的版本）。
5. **`scripts/pack-zip.ts`**（`pnpm content:zip <packDir> [--out release/]`）：打包为可在后台导入的 zip（排除 bundle.json 以外的生成缓存）。
6. 根 package.json scripts：`content:assets`、`content:audio`、`content:validate`、`content:bundle`、`content:zip`、`content:all`（assets → audio → validate → bundle）。

## pack.json（sprout.core）
id `sprout.core`，version `1.0.0`，name `{zh:'芽芽核心课程', en:'Sprout Core'}`，ageRange [6,36]，routes `["routes/sprout-core-route.json"]`，lessonsDir `lessons`，credits 包含 Fluent Emoji（Microsoft, MIT, https://github.com/microsoft/fluentui-emoji）与 CDC 里程碑（公有领域，仅后台使用可不列）与"自绘图形（芽芽成长, CC0）"；`LICENSES.md` 附 Fluent Emoji 的 MIT 许可全文。

## 文档
- `docs/dev/content-pipeline.md`：流水线各脚本用法、命名约定、增量与清理、常见问题。
- `docs/dev/content-pack-guide.md`：**面向以后新增内容的人**：如何新建一个内容包（目录结构、pack.json、词库、课程 JSON 写法与每种活动示例、路线、素材来源与许可要求、校验、打包导入后台、版本升级）；附一个完整的最小示例包放在 `content/examples/hello-pack/`（你拥有该目录），并确保它能通过 validate。

## 验收
- 对 `content/examples/hello-pack/` 跑全套：assets（若用到 fluent）→ audio → validate → bundle → zip 全部成功。
- 对 `content/packs/sprout-core/` 跑 validate 与 bundle：在 T6/后续任务尚未完成时也不能崩溃（给出清晰的"缺失"报告）。
- `scripts/lib/collect-speech.ts` 写 vitest 测试（`scripts/test/*.test.ts`，根目录 `npx vitest run scripts` 可运行；如需 vitest 配置放 `scripts/vitest.config.ts`）。
