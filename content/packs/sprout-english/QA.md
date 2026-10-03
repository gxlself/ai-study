# T16 英语日常验收记录

日期：2026-10-03。仅修改 `content/packs/sprout-english/**` 与 `release/sprout.english-1.0.0.zip`，没有改共享脚本、核心包、数据契约、SDK 或其他任务文件，没有提交 Git。

## 交付

- 12 节课程：9 节家长指引、3 节 24–36 月可选共看，共看时长 2–3 分钟。
- 每节 6 句中英参考语；9 节家长课共 54 句逐句美式音标，全部写入现有 `guide` 正文，不使用中文谐音。
- 每课有线下活动、安全说明、开放问题及简单／进阶玩法；家长课包含真人动作示范。
- 只新增 `english.stand-up`，复用只读核心词库；2 张本包原创 SVG，来源和许可可追溯。
- 原创双语《小手问好歌》，使用公有领域 Frère Jacques 传统旋律；逐行音符与字数／音节匹配，16 行、64 拍、70 BPM、重复一次。
- 121 条真实 M4A 音频、音频清单、已补全默认 props 的 12 课 bundle 和可导入 ZIP。
- README、LICENSES、18 项单元测试、API 导入验收脚本和独立素材／音频检查脚本。

## 命令与结果

所有 pnpm 命令执行前均使用 `export pnpm_config_verify_deps_before_run=false`。构建、测试、浏览器串行，无新增依赖。

| 命令 | 结果 |
| --- | --- |
| `pnpm exec tsc -p content/packs/sprout-english/tests/tsconfig.json` | 退出 0，strict 类型检查通过 |
| `pnpm content:assets --pack content/packs/sprout-english` | 2 张原创素材存在，0 错误、0 警告 |
| `pnpm content:audio --pack content/packs/sprout-english --rate 125` | 首次实际生成 121 条，Tingting／Samantha；运行语料覆盖 121／121 |
| `pnpm content:validate --pack content/packs/sprout-english --strict` | **退出 1：0 错误、12 警告**；全部是无路线包的课程主题归属警告，见下节 |
| `pnpm content:bundle --pack content/packs/sprout-english` | 退出 0，12 节有效课程、0 路线；仍报告上述外部警告 |
| `pnpm content:zip content/packs/sprout-english --out release/` | 退出 0，归档根含 pack.json 与 bundle.json；缓存和临时数据不入包 |
| `pnpm exec tsx --test content/packs/sprout-english/tests/english.test.ts` | 18 项通过，0 失败、0 跳过、0 待办；不是官方严格校验通过的替代结论 |
| `pnpm exec tsx content/packs/sprout-english/tests/import-check.mjs` | 实际 API ZIP 导入返回 201；12 课、1 词条、0 路线，导入返回无内容错误 |
| `node content/packs/sprout-english/tests/media-check.mjs`，指定已有 Playwright 模块与 Chrome 可执行文件 | 31 张图片在 1920×1080 和 390×844 视口均非空、可见且无横向溢出；121 条音频全部可解码、有非静音样本 |

单元测试检查契约、年龄和 audience、短句与音标一致性、真实素材、线下安全、实际研究引用、歌曲每行音节与节奏、运行朗读覆盖、音频格式、bundle、ZIP 与源文件逐字节一致性。首次测试发现并修正了音标字符检查缺少 `ŋ`、SVG 无障碍属性不符合既有白名单的问题，修正仅发生在本包。

API 验收使用进程内请求，证明课程库可分别浏览 9 节家长课与 3 节共看课；23 月筛选不到共看课，24 月筛选到 3 节；6 月可以浏览 3 节入门家长课。置顶 `english.parent.action-game` 后，临时 24 月孩子的 `parent-only` 今日计划包含该家长课。核心杯子图片、本包两张图片、音频清单和实际音频静态响应正常；不新增英语路线。应用已关闭，临时数据库和导入副本已删除。

浏览器检查采用单个独立无头 Chrome，不访问外网、不操作个人浏览器资料、不向扬声器播放。全部音频解码时长为约 0.275–2.824 秒，非静音检查通过。AudioContext 和浏览器已关闭。素材截图及技术检查报告位于本包忽略的 `.qa/` 中，不进入发布 ZIP。

## 必须协调的阻塞

`docs/dev/tasks/T15-T16-extra-packs.md` 明确要求 `routes: []`；`scripts/lib/validate-pack.ts:180–181` 当前却对所有课程无条件执行“主题归属次数必须为 1”。因此合法的无路线英语包在官方严格校验中会报 12 次：

> 课程在主题中出现 0 次，应且仅应出现 1 次。

不能为了消除警告添加路线、虚构阶段、删除课程或吞掉退出码，也不能越权修改共享脚本。本次 **尚未达到正式发布要求的 0 error / 0 warning**；bundle、ZIP、API 导入和包内测试通过不改变这一事实。

请 T-content／架构维护者仅在包声明并提供路线时校验课程主题归属；没有路线时，仍须保留所有课的共看要求、年龄、活动结构、资源、音频、标点与重复 ID 检查。最小修复位置是 `routeIssues` 中 `count !== 1` 的分支，条件需加上存在路线，不要在函数开头直接返回，以免跳过安全校验。还应增加无路线包的正式严格校验回归测试。

共享脚本修复后，无需改动本包的合法 `routes: []`，重新运行官方 strict、bundle、zip 和包内测试即可验收。包内测试会兼容“外部警告仍存在”和“已修复且无 issues”两种状态，并明确输出前者，不宣称已修复共享模块。

## 限制

本次未在真实电视、iPad、Android 或完整播放端页面上进行交互验收，素材截图不替代设备和播放端集成测试。音频通过真实解码与非静音检查，不宣称已做主观听感审核。

本包依赖启用的 `sprout.core`，没有虚构契约不存在的 `requires.packs`。家长 `guide` 不提供朗读按钮；家长短句的发音辅助是可见音标，不把 121 条运行语料覆盖率包装成家长参考语试听覆盖率。

系统合成声音不是 CC0；当前交付用于家庭使用和内部验收，外部分发前需要另行确认声音授权，见 LICENSES.md。
