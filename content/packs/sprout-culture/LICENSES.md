# 素材许可与来源

## 原创课程内容

原创课程文字、路线、词库文本、歌词、打印卡文案和家长指引适用仓库根目录 `CONTENT-LICENSE.md`（CC BY-NC 4.0；商业使用须另行授权）。本包自绘 SVG 的 CC0 范围只覆盖实际标注的图形文件。

## 原创内容

作者：芽芽成长 Sprout。

本包原创的课程 JSON、词库 JSON 和说明文字按仓库根目录 `CONTENT-LICENSE.md` 提供。`assets/images/festivals/` 中的七幅词条 SVG和一幅包封面按本包实际来源以 CC0 提供；该图形许可不扩展到课程文字或第三方权利。

许可文本：

```text
https://creativecommons.org/publicdomain/zero/1.0/
https://creativecommons.org/publicdomain/zero/1.0/legalcode
```

所有SVG由本任务原创，不来自Fluent Emoji、图库、截图、儿童照片或第三方视频。`assets/sources.json`中的`custom`条目与实际文件一一对应；没有脚本、网络图片、外链字体、动画和闪烁。

## 仅引用的核心词库

课程通过concept ID使用`sprout.core`已有的自然、食物、家人、动作和形状等词条；本zip不复制或分发它们的SVG。核心包素材许可由`content/packs/sprout-core/LICENSES.md`与其`pack.json.credits`维护，引用不会把Fluent Emoji的MIT许可改成CC0。

导入需已有核心包与对应真实素材，未声明契约不存在的依赖字段。

## 系统合成音频

公开包的`audio/manifest.json`为空且不含录音。个人在macOS上运行流水线时，系统`say`生成的`audio/tts/`与`audio/manifest.local.json`留在本地忽略路径；课程正文、固定提示语和引用概念的词名仍按项目契约收集。

本包未引入第三方真人录音、第三方歌曲、歌词或旋律。家长指引只显示给成人阅读，不把guide内容朗读给宝宝。

**系统合成音频仅限个人非商业使用，不可公开再分发。** 原创文字和SVG的CC0不覆盖Apple系统声音及其录音；不得随公开仓库、下载ZIP、网站、CDN、应用安装包或商业产品发布，免费和非营利分享也不例外，“内部验收”不是额外授权。

依据：Apple《macOS Tahoe 26软件许可协议》第2.F节（Voices; Live Captions），2026-10-03核对；实际使用以安装版本及具体声音条款为准：

```text
https://www.apple.com/legal/sla/
https://www.apple.com/legal/sla/docs/macOSTahoe.pdf
```

公开分发前必须用明确允许相应用途及音频再分发的可商用TTS，或已获录音与分发授权的真人录音，重建整个`audio/`并清除旧系统录音与缓存，再重建bundle和ZIP。新声音来源与许可须同步本文件、README许可段及`pack.json.credits`。接入现有服务端`TtsProvider`的步骤见`docs/dev/content-pipeline.md`；`audio/manifest.json`仍保持原结构和文本key，后台设置不会自动替换本扩展包音频。

## 研究与安全说明

课程研究引用为`docs/research/evidence-review.md`中的文献编号，仅转述互动设计原则；没有复制论文、书籍、量表或版权受限插画。安全边界落实任务单与项目制作指南的要求，不构成医疗、喂养或发育诊断建议。

包内没有未经授权的儿童姓名、照片、声音、家庭地址、账号、token、广告或统计脚本。
