# 英语日常素材与内容许可

## 原创内容

创作者：芽芽成长 Sprout。

本包原创课程文字、词条 `english.stand-up`、中英文歌曲改编词、说明及测试源码，以 **CC0 1.0 Universal** 公共领域贡献方式提供，标识符 `CC0-1.0`。

原创静态插画：

- `assets/images/everyday-english.svg`：杯子、书和挥手组成的包封面。
- `assets/images/actions/stand-up.svg`：平地站立动作示意。

素材均由本包提供，无外链、脚本、第三方字体或孩子的个人照片；`assets/sources.json` 中的 `custom` 对应上述真实文件，不意味着任意加入的素材自动获授权。

CC0 说明：`https://creativecommons.org/publicdomain/zero/1.0/`。
CC0 法律文本：`https://creativecommons.org/publicdomain/zero/1.0/legalcode`。

## 传统旋律与原创歌词

《小手问好歌》的旋律采用 `docs/curriculum/route-plan.md` 已认可的 **Frère Jacques** 传统旋律（公有领域），C 大调。英文及中文歌词都是本包原创，不复制现代儿歌的受保护歌词、编曲或录音。

旋律通过 `song.props.lines[].notes` 与宿主 WebAudio 合成，70 BPM，音乐盒音色，没有下载或附带任何第三方演奏录音。旋律的公共领域状态与原创歌词的 CC0 声明分别列在 `pack.json.credits`。

## 核心词库引用

本包按任务要求优先引用 `sprout.core`，未复制或修改核心词条与图片。包括日常物品、衣物、身体部位、自然物、情绪，以及拍手、挥手、举手、坐下、洗手和跳等动作。

这些资源的作者和许可仍以 **`content/packs/sprout-core/LICENSES.md`** 与核心包 `credits` 为准；其中可能包含 Microsoft Fluent Emoji 的 MIT 许可图片，本包的 CC0 不替代或重新许可它们。导入本包需要启用 `sprout.core`，ZIP 只包含本包原创插画，不把核心资源冒称为本包原创。

## 系统合成语音

`audio/manifest.json` 与 `audio/tts/**` 由 macOS `say` 和 `afconvert` 生成，实际声音由 manifest 记录；当前采用中文 Tingting 与英文 Samantha，语速每分钟 125 词。没有录制、上传或使用孩子的声音。

系统声音及其生成音频**不属于 CC0，仅限个人非商业使用，不可公开再分发**。不得随公开仓库、下载 ZIP、网站、CDN、应用安装包或商业产品发布；免费、非营利或加署名也不获得分发许可，“内部验收”不是额外授权。原创图片和文字的许可不覆盖合成声音。

依据：Apple《macOS Tahoe 26 软件许可协议》第 2.F 节（Voices; Live Captions），2026-10-03 核对；实际使用以安装版本及具体声音条款为准：

```text
https://www.apple.com/legal/sla/
https://www.apple.com/legal/sla/docs/macOSTahoe.pdf
```

公开分发必须用明确允许相应用途及音频再分发的可商用 TTS，或已获录音与分发授权的真人录音，重新生成整个 `audio/`、清除旧系统录音与缓存，再重建 bundle 与 ZIP。新声音来源与许可须同步本文件、README 许可段和 `pack.json.credits`。接入现有服务端 `TtsProvider` 的步骤见 `docs/dev/content-pipeline.md`；`audio/manifest.json` 的结构与文本 key 保持不变，切换后台设置不会替换本扩展包音频。

## 不包含

本包没有视频、网络活动、广告、追踪、外部统计、第三方音频录音、账号、访问令牌或儿童个人资料。研究文献只以编号供家长与维护者追溯，文献原文不打包、不重新许可。
