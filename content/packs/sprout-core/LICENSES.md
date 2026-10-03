# 芽芽核心课程素材许可

本文件分别记录 Fluent Emoji 与芽芽成长自绘图形的许可，不把本包所有内容统一声明为 MIT 或 CC0。具体素材对应关系见 `assets/sources.json`。

## Fluent Emoji

- 项目：Microsoft Fluent Emoji。
- 官方仓库：`https://github.com/microsoft/fluentui-emoji`。
- 官方许可：`https://github.com/microsoft/fluentui-emoji/blob/main/LICENSE`。
- 原始文件：`https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/LICENSE`。
- 核对日期：2026-10-02。
- 适用范围：`assets/sources.json` 中 `source: "fluent-emoji"` 对应的素材。
- 本地处理：素材流水线可能把 SVG 的固定宽高调整为 `100%`，保留 `viewBox`；不因此变更其许可或版权归属。

以下逐字保留官方 LICENSE 全文，包括其原始版权行和结尾：

```text
    MIT License

    Copyright (c) Microsoft Corporation.

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE
```

## 自绘图形

- 创作者：芽芽成长。
- 许可：CC0 1.0 Universal，标识符 `CC0-1.0`。
- 许可说明：`https://creativecommons.org/publicdomain/zero/1.0/`。
- 完整法律文本：`https://creativecommons.org/publicdomain/zero/1.0/legalcode`。
- 适用范围：`assets/sources.json` 中由芽芽成长原创且标记 `source: "custom"` 的形状、数字、颜色等图形。

芽芽成长将上述原创图形以 CC0 1.0 公共领域贡献方式提供。此声明不覆盖 Fluent Emoji，也不为未来新增的第三方素材重新授予许可；新增素材必须按真实来源补充本文件与 `pack.json` 的 `credits`。

## macOS 系统合成音频

`audio/tts/` 由内容流水线调用 macOS `say` 与 `afconvert` 生成，实际声音见 `audio/manifest.json.voices`。这些系统声音及合成录音不属于上述 MIT 或 CC0 素材。

**系统合成音频仅限个人非商业使用，不可公开再分发。** 不得附带在公开仓库、下载 ZIP、网站、CDN、应用安装包或商业产品中；免费、非营利或加署名也不获得分发许可。不能把家庭自用的录音作为公开发布产物。

依据：Apple《macOS Tahoe 26 软件许可协议》第 2.F 节（Voices; Live Captions），2026-10-03 核对；实际使用以安装版本和具体声音条款为准：

```text
https://www.apple.com/legal/sla/
https://www.apple.com/legal/sla/docs/macOSTahoe.pdf
```

公开分发须改用明确允许相应用途及音频再分发的可商用 TTS，或已获录音与分发授权的真人录音，重新生成整个 `audio/`，清除旧系统录音与生成缓存，再重建 bundle 和 ZIP；不得只换许可文字。新声音的来源、许可与署名须同步 `pack.json.credits` 和本文件。接入现有服务端 `TtsProvider` 的步骤见 `docs/dev/content-pipeline.md`；`AudioManifest` 的结构与 `speechKey` 保持不变，切换后台 TTS 设置不会重建本核心包。
