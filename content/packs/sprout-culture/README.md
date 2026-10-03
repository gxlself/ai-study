# 中国传统节日 / Chinese Festivals

包 ID：`sprout.culture`；版本：`1.0.0`；适用：6–36 月龄家庭。内容侧重温暖相伴、真实物品与线下游戏，不讲恐吓故事、迷信功效或必须完成的节日仪式。没有广告、追踪、外部网页、视频、自动连播或奖励机制。

## 内容与适龄

共 **12 个教学内容单元、20 个课程 JSON**：8 个节日家长指引单元各提供两档年龄版本，另有 4 节短共看课。当前契约对单课月龄跨度超过18个月发出警告，因此不能把家长课直接写为`[6,36]`；本包按`[6,17]`和`[18,36]`连续、不重叠地覆盖全月龄，未改动契约。

| 节日主题 | 6–17月：家长读2分钟 | 18–36月：家长读3分钟 | 24–36月：可选共看 |
| --- | --- | --- | --- |
| 春节 | 看福字、面对面拜年 | 平视处贴福字、大软布包饺子 | 新年好，4分钟，短故事与找图 |
| 元宵 | 灯笼与汤圆大卡 | 画纸灯笼、圆形实体卡配对 | 灯笼在哪里，4分钟，词卡、找图、数1–2盏 |
| 清明 | 安全处踏青、种子大卡 | 踏青、成人种植、看护浇一勺水 | 无 |
| 端午 | 成人示范轻划、粽子与香囊大卡 | 干地空手龙舟、纸上香囊 | 一起慢慢划，5分钟，词卡、找图、坐稳动作 |
| 中秋 | 白天月亮卡、家人相伴 | 画月亮送问候、可选安全赏月 | 月亮陪着我们，5分钟，短故事与找图 |
| 重阳 | 自愿向熟悉长辈问好 | 画大问候卡、看望长辈 | 无 |
| 冬至 | 饺子或汤圆大卡、家庭习俗 | 摆大卡点数、说自家习惯 | 无 |
| 生日与家庭节日 | 安静祝福、成人轻拍手 | 画祝福卡、自愿分享问候 | 无 |

家长课程 ID：`culture.parent-young.<主题slug>`、`culture.parent-toddler.<主题slug>`。共看课程 ID：`culture.child.<主题slug>`。slug依次为`spring-festival`、`lantern-festival`、`qingming`、`dragon-boat-festival`、`mid-autumn`、`double-ninth`、`winter-solstice`、`family-celebration`。

- 6–23月只有家长指引，不向宝宝播放内容；成人读完关屏，再陪玩5–10分钟。所有家长课第一步是`guide`，没有孩子观看步骤。
- 24–36月仍可完全不用屏幕。共看仅是可选引子，须成人陪同，可随时暂停或跳过；结束关屏去线下活动，不继续播下一课。
- 中国眼保健与早期发展文件建议0–3岁不接触视屏；本包可选共看比该口径宽松，家庭可保持`parent-only`。依据见仓库`docs/research/evidence-review.md`第2、9节。
- 进餐、卧室及睡前一小时不用屏；合并家庭其它屏幕使用一起管理预算。家长陪玩计时不是宝宝屏幕时长，不当背景播放器。
- 每课有3–6步具体指引或短互动、观察提示、双语短句、实体打印卡、1–2个线下活动，包含开放问题及简单与挑战档。家人称呼按真实家庭调整，不强迫亲吻、拥抱或社交表演。

## 安全

- **本包不安排食物试吃。** 汤圆是圆形黏性食物，有窒息风险，3岁以下不建议整颗吃；切小、压扁也不能消除黏性风险。粽子同样黏，切小压扁不是安全保证。本课都改用完整大图卡。
- 真实饺子、月饼或蛋糕的正常进餐与活动分开，按孩子已有进食能力安排软烂食物并坐稳看护，不提供硬块、整粒坚果或未确认过敏原。软布包饺子不用生面粉、生馅、生面团、小填充物或绳子。
- 香囊只看图或画在纸上，不佩戴、不闻草药、不提供香料、精油、绳子及小挂件，不宣称防病驱虫功效。
- 真种子、泥土、工具和肥料只由成人管理；宝宝只看大卡，能坐稳时可在成人扶杯下自愿浇一勺水。花盆放稳且放在宝宝够不到处，洒水立即擦干，结束洗手。
- 直径小于3.5厘米的小物件有窒息风险；大卡须完整、边缘光滑并不入口。涂画用无毒粗蜡笔，成人全程陪伴。
- 龙舟只在干燥防滑地面空手坐稳做小幅动作，不用真船、桨、棍、水盆，不拉手、不摇晃、不靠近水边。
- 不使用气球及碎片、蜡烛、爆响玩具、剪刀、订书钉、长绳或纽扣电池。烟花鞭炮只在安全提示出现：不参与活动，遇到燃放远离，必要时由成人轻护耳朵。
- 踏青、赏月由成人牵护，远离道路、水边、窗边、阳台与高处；不直视太阳、不登高、不熬夜。看不到月亮或无法见到亲人也能完成相伴活动。

这些是内容活动的保守边界，不是喂养、医疗或发育诊断建议。观察点不对应合格标准；有健康或发育担忧应咨询专业人员。

## 词库与素材

新增七个词条仅在本包：`fest-fu`、`fest-lantern`、`fest-tangyuan`、`fest-zongzi`、`fest-sachet`、`fest-dragon-boat`、`fest-mooncake`。七幅词条SVG和一幅包封面均原创、静态、无脚本或外链，映射见`assets/sources.json`。

已有概念优先引用只读的`sprout.core`：如`dumpling`、`moon`、`seed`、`sprout`、`flower`、`leaf`、`home`、家人、形状与动作词条。**需要宿主已经安装核心包及其素材；这不是脱离Sprout核心词库的独立内容包。** 不复制核心图片、不覆盖核心词条，不虚构契约不存在的`requires.packs`字段。运行时按本包→核心包解析；本包音频包含实际共看步骤使用的核心词条朗读。

本包没有`route`，`pack.json.routes`固定为空；不创建节日日历，不修改核心成长路线。家长从课程库浏览、筛选月龄、选择并置顶。家长课不包含歌曲，共看也不含歌曲，因此没有引入任何第三方歌词、旋律或录音。

原创JSON、文字与SVG为CC0-1.0；核心词库素材按核心包声明使用。**macOS系统合成音频仅限个人非商业使用，不可公开再分发**，不属于CC0；公开仓库、下载ZIP、CDN、安装包及商业产品都须先改用有相应用途与再分发许可的可商用TTS或获授权真人录音，重建整个`audio/`、bundle和ZIP，免费或非营利也不例外。

完整条款及Apple许可来源见`LICENSES.md`；服务端`TtsProvider`接入与清单保持不变的重建流程见`docs/dev/content-pipeline.md`。只切换后台设置不会替换本包系统录音，也不代表已经获得公开发布授权。

## 构建与验证

在仓库根执行，每次终端先设置环境变量。命令串行执行，不需要安装新依赖：

```sh
export pnpm_config_verify_deps_before_run=false
pnpm content:typecheck
pnpm exec tsc -p content/packs/sprout-culture/.qa/tsconfig.json
pnpm content:assets --pack content/packs/sprout-culture
pnpm content:audio --pack content/packs/sprout-culture
pnpm content:validate --pack content/packs/sprout-culture --strict
pnpm content:bundle --pack content/packs/sprout-culture
pnpm content:zip content/packs/sprout-culture --out release/
pnpm exec tsx --test --test-concurrency=1 content/packs/sprout-culture/.qa/culture.test.ts
pnpm content:test
pnpm exec tsx content/packs/sprout-culture/.qa/import-smoke.ts
pnpm exec tsx content/packs/sprout-culture/.qa/age-guard.ts
node content/packs/sprout-culture/.qa/check-assets.mjs
```

音频生成须macOS的`say`与`afconvert`；默认为中文Tingting、英文Samantha，语速165。改文案后重跑audio、bundle、zip；删语料时可给audio加`--prune`。不手造清单或空音频。

并行开发时若系统语音偶发超时，可先运行`pnpm exec tsx content/packs/sprout-culture/.qa/generate-audio.ts`。该入口复用正式生成器、真实`say`与`afconvert`及原子清单写入，只把底层合成排成单队列并对失败重试一次；随后重新运行上述标准`content:audio`命令确认增量覆盖。

`.qa/`仅包含本包测试和检查工具，流水线自动排除隐藏目录，不进入zip。导入验证使用该目录内一次性数据目录与Fastify注入，不监听端口、不接触现有家庭数据，结束关闭应用并清理临时数据。素材检查逐个视口运行一个无头浏览器，截图在`.qa/screenshots/`，结束关闭浏览器；无常驻服务。

### 本次验收结果（2026-10-03）

| 验证 | 实际结果 |
| --- | --- |
| `content:typecheck`与本包`.qa/tsconfig.json` | 通过 |
| `content:assets` | 8幅自绘素材，0错误、0警告 |
| `content:audio` | 首轮4次系统语音超时；串行真实生成163条后，标准命令增量跳过163条并退出0 |
| 每课契约与本包测试 | 20课均0 error、0 warning；`.qa/culture.test.ts`共37项全部通过 |
| `content:validate --strict` | 0 error、20 warning，退出1；全部为下述无路线归属问题，音频163/163 |
| `content:bundle`与`content:zip` | 均退出0；20节有效课，zip共198个文件，含真实音频，不含`.qa/`和生成缓存 |
| `.qa/import-smoke.ts` | 隔离HTTP导入20课、7词条、0路线、0 issues；分龄筛选、家长置顶、开启共看通过 |
| `parent-only`置顶共看 | 不播放孩子屏幕步骤；无路线的共看置顶课未进入今日计划，限制如后文说明 |
| `.qa/age-guard.ts` | 失败：18、23月的co-view档案可排入本包起始24月的置顶课；6、17月被全局门槛拦截，24、36月可正常置顶 |
| `.qa/check-assets.mjs` | 1280×800与390×844全部8图非空、无横向溢出、无页面错误；已人工查看截图 |
| 中英文音频样本 | 新年好与灯笼各取中英，均为有有效帧的单声道22050Hz AAC；未用空文件代替 |
| 全局`content:test` | 296项中295项通过；唯一失败是核心包正式播放音频测试缺125条新增词库语料，不是本包缺音 |

首轮TTS失败没有写入残缺清单，随后真实重生成成功。全局核心音频缺失来自并行维护的`sprout.core`，本任务没有补写核心包或改测试。跨模块问题需负责人处理后重新验收，不能把本包37项测试通过解释为全仓库或严格发布检查通过。

**已知共享流水线阻塞：** 当前`scripts/lib/validate-pack.ts`的`routeIssues()`对`routes: []`也逐课要求主题归属，导致20条“在主题中出现0次”的warning；严格校验因这些warning退出1。每课的`validateLesson`为0 error、0 warning，资源和音频可完整交付；不能据bundle或zip已生成就声称严格发布通过。本任务不拥有scripts，不修该共享代码、不造假路线。需流水线负责人对无路线包豁免归属次数检查，同时保留共看及有路线包的全部校验，再重跑严格命令。

**已知置顶月龄限制：** 当前`packages/core/src/scheduler.ts`只在`parent-only`分支检查课程月龄；`co-view`下置顶项未按`lesson.ageRange`过滤。因此主动开启共看的18或23月龄档案也能排入`culture.child.spring-festival`。本包共看仍声明24–36月，不放宽月龄，不越界修改排课器。核心负责人应给共看置顶补课程月龄检查并保留全局18月门槛；修复前，24月以前保持parent-only，不置顶本包共看课。专用负向检查`.qa/age-guard.ts`会如实退出1，修复后应通过。

## 后台导入与使用

1. 先确认服务器有`sprout.core`及其真实图片。后台进入内容包管理，上传`release/sprout.culture-1.0.0.zip`。
2. 接口为管理员`POST /api/packs/import`，multipart字段`file`。zip根含`pack.json`，不是多层目录；同ID同版本可回导，升级用更高版本，不降级。
3. 确认ID`sprout.culture`、版本、20节课、7个自有词条、0条路线以及启用状态。源码在`content/packs/`也可由服务器重新扫描加载。
4. **保留孩子原有成长路线，不选择不存在的文化路线。** 在课程库按月龄筛选并置顶，例如18–36月家长课`culture.parent-toddler.spring-festival`，24–36月可选共看`culture.child.spring-festival`。
5. 保持`parent-only`时不播放共看步骤，优先置顶本包适龄家长课；也可从详情查看共看课的家长导语和线下活动。当前排课器只把成长路线内的共看课补成线下版，**本包无路线的置顶共看课不会进入parent-only今日计划**，需核心负责人协调。是否开启共看由家庭决定；18月龄以下绝不播放共看，本包共看起点更保守，为24月。
6. 核对中文和英文图片名称、实际朗读、手动翻页、暂停退出与结束后的线下提示。只有HTTP导入成功不足以代替本包严格校验。

## 循证说明

课程`parentGuide.refs`沿用`docs/research/evidence-review.md`真实编号`[n]`，不是自造`R`编号。屏幕边界主要参考`[3]`、`[6]`、`[8]`；回应性语言`[44]`、`[45]`、`[47]`、`[82]`；共看与对话式阅读`[25]`、`[26]`、`[48]`；生活数学`[64]`、`[67]`、`[69]`；引导式游戏`[80]`；动作活动`[83]`；规律作息与家庭仪式`[92]`、`[93]`。

相关研究支持互动原则，不代表这些原创节日课已经被试验证明有效。引导式游戏证据多来自较大儿童，本包仅借鉴开放问题与成人支持，不宣称提升智力、保证语言效果或把节日知识当发育里程碑。节日习俗按通行、温和方式呈现，并明确地区和家庭可以不同。
