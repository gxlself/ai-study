# 英语日常 / Everyday English

包 ID：`sprout.english`，版本：`1.0.0`，内容格式：`schemaVersion: 1`。

12 节课程，包括 9 节家长指引和 3 节可选亲子共看。每课有 6 句中英对照参考语、真人互动建议、具体线下步骤、开放问题、简单与进阶玩法，以及安全提示。家长先学一两句，关屏后在真实生活中使用，不要求宝宝背词、复读或回答正确，不用视频“磨耳朵”。

## 适龄与课程

包覆盖 6–36 月；每节课按其实际 `ageRange` 筛选，不把包的范围当成每课的范围。为遵守单课月龄跨度不超过 18 个月的契约，婴儿照护入门课为 6–24 月，主动参与动作与常规的家长课为 18–36 月。6–17 月只有家长阅读，不给宝宝看屏幕。25–36 月仍可使用已学会的日常短句，但课程库按下表显示适龄课，不隐瞒年龄范围。

| 课程 ID | 内容 | 类型 | 月龄 | 阅读或共看时长 |
| --- | --- | --- | --- | --- |
| `english.parent.good-morning` | 起床说早安 | 家长指引 | 6–24 | 3 分钟 |
| `english.parent.get-dressed` | 穿衣伸伸手 | 家长指引 | 18–36 | 3 分钟 |
| `english.parent.mealtime` | 还要和吃好啦 | 家长指引 | 6–24 | 3 分钟 |
| `english.parent.wash-hands` | 洗洗小手 | 家长指引 | 18–36 | 3 分钟 |
| `english.parent.clean-up` | 一起收玩具 | 家长指引 | 18–36 | 3 分钟 |
| `english.parent.lets-go` | 牵手出门啦 | 家长指引 | 18–36 | 3 分钟 |
| `english.parent.good-night` | 关屏说晚安 | 家长指引 | 6–24 | 3 分钟 |
| `english.parent.feelings` | 我在这里陪你 | 家长指引 | 18–36 | 3 分钟 |
| `english.parent.action-game` | 真人动作小游戏 | 家长指引 | 18–36 | 3 分钟 |
| `english.child.move-together` | 和家长一起动 | 必须陪同的可选共看 | 24–36 | 3 分钟 |
| `english.child.hello-hands` | 小手问好歌 | 必须陪同的可选共看 | 24–36 | 2 分钟 |
| `english.child.everyday-things` | 找找身边的东西 | 必须陪同的可选共看 | 24–36 | 3 分钟 |

家长课步骤只有 `guide`，开头读完就暗屏陪玩，`playMin: 5` 不是孩子屏幕时间，也不是必须玩满的要求。不会站、坐或跳的动作不强迫完成，随时可以停止。共看课使用 `movement`、`song`、`word-cards` 和 `choose`，词卡手动翻页，儿歌只播放一遍，结束转到线下。每个动作有 15 秒从容示范时间，成人可暂停或跳过；不是倒计时测验。

进餐和水边不拿设备，晚安课仅供家长白天学习，睡前不打开或播放。情绪课不作为屏幕安抚入口。中文仍是主要高质量交流方式，英语只是自然补充。24–36 月的共看是项目可选设计，不代表本包把中国研究文档中更严格的零屏幕建议改成了观看许可；选择全程线下的家庭同样可以使用全部线下活动。

## 发音与歌曲

9 节家长课的 54 句参考语分别写入 `parentGuide.phrases` 与 `guide.steps[].say`，中文意思一致。每个指引步骤的正文附常见美式音标，音标不是中文谐音，也不是要宝宝学习的内容。按现有契约，`guide` 不朗读任何正文或参考语；不能把自动生成的音频覆盖率理解为家长短句有试听按钮。

共看课的实际朗读字段使用 `Samantha` 英文声音、`Tingting` 中文声音，生成语速为每分钟 125 词；名称和标题可以重听。歌曲歌词由家长自己唱，不生成歌词 TTS，不制作背景录音。

《小手问好歌》使用任务指南已认可的公有领域传统旋律 **Frère Jacques**，C 大调，70 BPM，音乐盒音色，英文一段、中文一段。中英文歌词均为芽芽成长原创；每行实音符数量对应英文音节数或中文字数，每行 4 拍，总计 64 拍，约 55 秒，不复制现代儿歌歌词或第三方录音。

循证依据为仓库 `docs/research/evidence-review.md` 第 4、7、9 节。课程 `refs` 使用该文件实际的 `[16]`、`[47]`、`[53]`、`[54]` 等编号；不虚构 `Rxx`。真人、短语、动作和等待回应是设计原则，本包未开展效果试验，也不把几分钟活动等同于研究中的高强度英语干预。

## 词库与素材

按任务要求优先引用已启用的 `sprout.core` 概念：杯子、勺子、书、球、衣物、洗手用品、情绪和已有动作等。只补充缺少的 `english.stand-up`，其图片是本包原创的静态 SVG。包封面也是原创 SVG；二者都在 `assets/sources.json` 声明为 `custom`，无脚本、外部图片或字体。

必须保留并启用 `sprout.core`；本包不是可脱离核心词库的独立示例包。核心图片由核心包提供，ZIP 不复制这些图片或其许可。契约没有 `requires.packs`，因此不伪造依赖字段。原创素材、传统旋律、核心包引用和系统合成声音的不同许可见 `LICENSES.md` 及 `pack.json.credits`。

**macOS 系统合成音频仅限个人非商业使用，不可公开再分发**，不属于原创素材的 CC0。公开仓库、下载 ZIP、CDN、应用安装包及商业产品须先换用有相应用途与再分发许可的可商用 TTS 或获授权真人录音，重建整个 `audio/`、bundle 与 ZIP；免费或非营利分享也不例外。

Apple 许可来源和完整边界见 `LICENSES.md`；服务端 `TtsProvider` 接入及不变的 manifest 契约见 `docs/dev/content-pipeline.md`。只切换后台设置不会替换本包系统录音，不得将“家庭自用和内部验收”理解为公开发布授权。

## 生成与验证

在仓库根串行执行，音频生成需要 macOS 已安装对应系统声音：

```sh
export pnpm_config_verify_deps_before_run=false
pnpm exec tsc -p content/packs/sprout-english/tests/tsconfig.json
pnpm content:assets --pack content/packs/sprout-english
pnpm content:audio --pack content/packs/sprout-english --rate 125
pnpm content:validate --pack content/packs/sprout-english --strict
pnpm content:bundle --pack content/packs/sprout-english
pnpm content:zip content/packs/sprout-english --out release/
pnpm exec tsx --test content/packs/sprout-english/tests/english.test.ts
pnpm exec tsx content/packs/sprout-english/tests/import-check.mjs
```

输出归档为 `release/sprout.english-1.0.0.zip`，ZIP 根目录含 `pack.json` 和 `bundle.json`。不要只因 bundle 或 ZIP 生成成功就当成严格发布通过；必须阅读校验输出。测试检查课程契约、短语、音标、年龄、线下活动、引用、乐句节奏、音频文件与最终归档，不启动服务或浏览器。

`import-check.mjs` 使用现有服务端的进程内请求，在本包 `.qa/` 下创建一次性数据目录，验证真实 ZIP 导入、年龄筛选、家长课置顶与跨包素材，然后关闭应用、删除临时数据库和导入副本；不监听端口、不修改仓库 `data/`。

可用本机已有的 Playwright 和浏览器串行做素材及音频检查，不向工作区新增依赖：

```sh
SPROUT_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
SPROUT_BROWSER_PATH=/absolute/path/to/browser \
node content/packs/sprout-english/tests/media-check.mjs
```

该脚本逐一检查实际概念引用对应的图片，保存两种视口截图，用 Canvas 检查非空与可见范围，再逐条解码音频检查非静音样本。它不播放声音，退出时关闭 AudioContext 和临时浏览器；`.qa/` 截图与报告不进入 ZIP。它是素材检查，不冒充实际播放端交互或真机测试。

### 已登记的流水线阻塞

当前 `scripts/lib/validate-pack.ts` 的 `routeIssues` 无条件要求每课在路线主题中出现一次；本任务明确要求 `pack.json.routes: []`，因此官方严格校验会给 12 节课各报一次“在主题中出现 0 次”警告。不得添加虚构路线绕过，也不得改脚本或忽略退出码宣称严格通过。需要流水线维护者仅对提供路线的包检查课程主题归属，仍保留所有包的共看与时长等安全校验。

包内测试会明确识别这一已登记的外部警告，同时拒绝其他任何检查问题；它不是官方 `--strict` 的替代品。具体本次运行结果见 `QA.md`。

## 后台导入

1. 在后台内容包管理中导入 `release/sprout.english-1.0.0.zip`；先确认 `sprout.core` 已启用。
2. 检查导入结果的课程数、启用状态、校验问题和图片。当前路线归属警告需要由维护者协调解决，不应隐瞒。
3. 本包 `routes: []`，不新增或替换孩子的成长路线。家长在课程库筛选“英语日常”、适龄和课程类型，浏览或置顶课程。
4. API 导入入口为 `POST /api/packs/import`，管理员鉴权，multipart 字段名 `file`；不把账号或 token 写入内容包。
5. 先试一节家长课，再按家庭选择试一节 24–36 月共看课，检查核心素材、慢读声音、结束后的线下活动；不用于自动连播。

## 维护范围

只维护本目录及本包的 ZIP。不要修改核心词库、schema、SDK、流水线或其他包。修改可朗读文本后重新生成音频、bundle 和 ZIP；测试与生成串行，无新增依赖或常驻进程。生成缓存、视觉检查临时文件不属于交付素材。
