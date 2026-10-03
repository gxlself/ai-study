# 芽芽成长文档

这里是芽芽成长 Sprout 的研究、课程、开发、部署和家长使用文档索引。数据契约以 `packages/schema/src/` 为准；本文档只提供入口和阅读顺序，不替代代码契约。

## 研究

| 文档 | 说明 |
| --- | --- |
| [循证调研](research/evidence-review.md) | 汇总屏幕使用、婴幼儿学习、语言、双语、数学、教育理念、音乐、界面和产品红线的研究与权威指南；引用编号集中在文末。 |

## 课程

| 文档 | 说明 |
| --- | --- |
| [成长路线规划](curriculum/route-plan.md) | 6 个阶段、主题、课程 ID、屏幕策略和贯穿线的规划基准。 |
| [核心词库说明](curriculum/lexicon.md) | 220 个中英双语概念、图片来源、量词/复数边界和实体卡使用原则。 |
| [s1 感知世界](curriculum/s1.md) | 6–8 月龄家长指引：面对面回应、实体卡、俯卧、躲猫猫和家长学唱。 |
| [s2 互动探索](curriculum/s2.md) | 9–11 月龄家长指引：因果、藏找、手势、进餐语言和家中物品。 |
| [s3 词语萌芽](curriculum/s3.md) | 12–17 月龄家长指引：第一批词、身体、车辆、数量、穿衣和户外。 |
| [s4 语言爆发](curriculum/s4.md) | 18–23 月龄课程：家长指引为主，共看默认关闭，包含颜色、形状、数量、情绪和生活常规。 |
| [s5 小小思考者](curriculum/s5.md) | 24–29 月龄亲子共看课程：分类、数量、动物、轮流、空间和天气。 |
| [s6 准备入园](curriculum/s6.md) | 30–36 月龄亲子共看课程：规律、数到十、自理、入园、健康和自然变化。 |

## 开发

### 总体与运行

| 文档 | 说明 |
| --- | --- |
| [系统架构](dev/architecture.md) | 产品定位、系统组成、RemoteSource/LocalSource、目录所有权和技术选型。 |
| [REST API](dev/api.md) | 初始化、孩子、课程、内容包、插件、设备、会话、设置和备份的 v1 接口契约。 |
| [服务端](dev/server.md) | Fastify、SQLite、数据目录、鉴权、屏幕策略、TTS、备份和服务端验证。 |
| [后台](dev/admin.md) | 家长后台的设置、孩子档案、课程、打印、插件、观察、备份和开发模式。 |
| [播放端](dev/player.md) | 播放端数据源、家长控制、离线缓存、输入、配对、预览协议和原生边界。 |
| [视觉与交互规范](dev/visual-guidelines.md) | 16:9 舞台、字体、颜色、动效、声音、焦点和触控约束。 |

### 内容与插件

| 文档 | 说明 |
| --- | --- |
| [内置活动规格](dev/activities.md) | 17 种内置活动的用途、props、家长课/共看边界、输入和打印 SVG。 |
| [内容包制作指南](dev/content-pack-guide.md) | 从示例包开始制作词库、课程、路线、素材、音频、bundle 和 zip。 |
| [内容流水线](dev/content-pipeline.md) | `content:route/assets/audio/validate/bundle/zip/all` 的参数、校验范围和发布流程。 |
| [第三方插件开发指南](dev/plugin-guide.md) | `plugin.json`、SDK 生命周期、资源/声音、权限、安全和打包安装。 |

### 任务单

任务单用于并行开发和交接，所有权边界以任务单和 [_common.md](dev/tasks/_common.md) 为准：

| 任务 | 主题 |
| --- | --- |
| [T1 server](dev/tasks/T1-server.md) | 服务端与数据存储 |
| [T2 player](dev/tasks/T2-player.md) | 播放端基础体验 |
| [T3 activities](dev/tasks/T3-activities.md) | 内置活动与 playground |
| [T4 admin](dev/tasks/T4-admin.md) | 家长后台 |
| [T5 pipeline](dev/tasks/T5-pipeline.md) | 内容素材、音频和校验流水线 |
| [T6 lexicon](dev/tasks/T6-lexicon.md) | 核心词库与素材 |
| [T7 lessons](dev/tasks/T7-lessons.md) | 核心课程内容 |
| [T8 native](dev/tasks/T8-native.md) | Android TV、iPad 与部署 |
| [T9 integration](dev/tasks/T9-integration.md) | 集成、联调和验收 |
| [T9a content](dev/tasks/T9a-content.md) | 内容整合 |
| [T9b decisions-tvcompat](dev/tasks/T9b-decisions-tvcompat.md) | 电视兼容性决策 |
| [T10 lexicon2](dev/tasks/T10-lexicon2.md) | 词库补充与复核 |
| [T11 lesson-upgrade](dev/tasks/T11-lesson-upgrade.md) | 课程升级 |
| [T13 docs](dev/tasks/T13-docs.md) | README、家长手册和课程总览 |
| [T14 security](dev/tasks/T14-security.md) | 安全与隐私 |
| [_common](dev/tasks/_common.md) | 所有并行任务共用的开工、边界、验证和回报规则 |

## 部署

| 文档 | 说明 |
| --- | --- |
| [部署与设备安装](deploy/README.md) | Mac 本机服务器、Docker、离线 App、Android TV、iPad、配对、备份和常见问题。 |
| [部署验证记录](deploy/validation.md) | Android/iPad、Docker、构建、测试和内容检查的实际验证结果与边界。 |

## 指南

| 文档 | 说明 |
| --- | --- |
| [家长使用手册](guide/parent-manual.md) | 面向非技术家长的首次设置、每日使用、双语、数学、里程碑和常见问题。 |
| [96 节课程总览](guide/content-roadmap.md) | 从核心包 6 个 `_stages` 与课程 JSON 汇总出的阶段、主题、课程、类型和领域表。 |

## 推荐阅读顺序

- 家长：先看[家长使用手册](guide/parent-manual.md)，需要研究依据时再看[循证调研](research/evidence-review.md)。
- 内容作者：先看[成长路线规划](curriculum/route-plan.md)，再看[内容包制作指南](dev/content-pack-guide.md)和[内容流水线](dev/content-pipeline.md)。
- 代码开发者：先看[系统架构](dev/architecture.md)、相关包文档和任务单，再以 schema/SDK 源码核对字段。
- 部署维护者：先看[部署与设备安装](deploy/README.md)，完成后对照[验证记录](deploy/validation.md)。
