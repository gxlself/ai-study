# 芽芽成长 Sprout — 系统架构（v1 契约）

> 本文是所有开发任务的**唯一架构依据**。数据结构以 `packages/schema/src/*.ts` 为准；本文与之冲突时以代码契约为准，并回报修正本文。

## 1. 产品定位（决定一切设计取舍）

- **亲子共学工具，不是电子保姆。** 屏幕只是"引子"（像一本会说话的大绘本），真正的学习发生在屏幕外的亲子互动。
- 每节课 = 家长导语 → 1–4 个慢节奏互动步骤 → 结束页给出**线下延伸活动**。
- 硬性约束：无广告、无自动连播、无无限滚动、无积分/排名/成瘾奖励、错误反馈温和、动画慢且少闪烁、按阶段限制单次与每日时长、可设可用时段、开始前护眼距离提醒、家长门（退出/设置需家长验证）。
- 中文为母语 + 英语启蒙（语言模式 zh / zh-en / en-zh / en，按孩子设置）；数学启蒙贯穿（数感、一一对应、基数、比较、形状、规律、空间）。

## 2. 组成

```
┌─────────────── 家庭局域网 ───────────────┐
│  Mac / NAS / 小主机：@sprout/server :4310 │
│    ├─ /api/*            REST（Fastify）   │
│    ├─ /packs/<id>/*     内容包静态文件     │
│    ├─ /plugins/<id>/*   第三方插件静态文件 │
│    ├─ /admin/           后台（apps/admin） │
│    └─ /                 播放端（apps/player）│
│                                           │
│  电视（Android TV APK / 电视浏览器）       │
│  iPad（Capacitor App / Safari 添加到主屏） │──→ 播放端
│  手机/电脑浏览器 ──→ 后台 /admin           │
└───────────────────────────────────────────┘
```

播放端有两种数据源（同一接口 `DataSource`）：
- **RemoteSource**：连接服务器（配对后拿 device token），计划/设置/记录全部走服务器。
- **LocalSource**：未连服务器时使用 App 内置的 `sprout.core` 内容包 + 本地排课 + localStorage 记录（开箱即用；之后可再配对）。

## 3. 仓库与目录所有权（并行开发边界，**严禁越界修改**）

| 目录 | 包名 | 内容 | 负责任务 |
|---|---|---|---|
| `packages/schema` | `@sprout/schema` | 数据契约 + zod 校验 + JSON Schema + 通用工具 | 架构（Claude）；他人只可修 TS 编译错误并在回报中说明 |
| `packages/core` | `@sprout/core` | 排课器 scheduler、屏幕时间计算、内容包读取（纯函数，浏览器/Node 通用） | T-server |
| `apps/server` | `@sprout/server` | Fastify + node:sqlite 服务 | T-server |
| `packages/plugin-sdk` | `@sprout/plugin-sdk` | 活动插件契约 `types.ts`（契约，勿改）+ 插件作者工具函数 | 契约 Claude；工具函数 T-player |
| `apps/player` | `@sprout/player` | 大屏播放端 + Capacitor(Android TV / iOS) | T-player |
| `packages/activities` | `@sprout/activities` | 16 个内置活动插件 + dev playground | T-activities |
| `apps/admin` | `@sprout/admin` | 后台管理 | T-admin |
| `scripts/` | — | 素材下载、音频生成、内容校验、打包 | T-content |
| `content/packs/sprout-core` | — | 内置内容包：词库、路线、课程、素材、音频 | T-content / T-lessons |
| `content/milestones` | — | 里程碑数据（CDC 2022） | 研究 |
| `plugins/examples/*` | — | 第三方插件示例 | T-activities |
| `docs/` | — | 研究、课程、开发文档 | 各任务只写自己对应的文档 |

## 4. 技术选型（已定，不再讨论）

- Node 22（`node:sqlite` 的 `DatabaseSync`，不引入原生模块），pnpm workspace，TypeScript strict，ESM。
- 工作区包直接以 TS 源码导出（`exports: ./src/index.ts`）；Vite 直接编译；服务端开发用 `tsx`，构建用 `tsup` 把 `@sprout/*` 打进 `dist/index.js`。
- 服务端：Fastify 5、@fastify/static、@fastify/multipart、@fastify/cors、@fastify/swagger + swagger-ui（`/api/docs`）、fflate（zip）。
- 播放端：Vite 8 + React 19 + react-router（HashRouter，兼容 Capacitor file://）、纯 CSS（无 UI 库）、自研空间导航（D-pad）、手写 Service Worker、Capacitor 8（`@capacitor/android`、`@capacitor/ios`、`@capacitor/app` 处理返回键）。
- 后台：Vite 8 + React 19 + antd 6 + react-router，`base: '/admin/'`。
- 测试：vitest（单元/接口）；端到端验收由 Codex 用浏览器/脚本跑。
- 端口：服务端 **4310**；开发时 player dev 5310、admin dev 5311（均代理 `/api` `/packs` `/plugins` 到 4310）。

## 5. 关键约定

- **内容包**：见 `packages/schema/src/pack.ts`。内置包 id `sprout.core`，路线 id `sprout.core.route`，课程 id `core.<stage>.<slug>`（如 `core.s3.animal-sounds`）。
- **自定义内容包**：家长在后台建的课/词/上传素材写入 `data/custom/`（包 id `sprout.custom`），与其它包同等加载。
- **资源 URL**：`/packs/<packId>/<packPath>`；词库图片 `concept.image` 为包内相对路径。跨包引用词条：课程用 concept id 引用，解析顺序 = 本包 → `sprout.core` → 其它启用包。
- **朗读**：内容只写文字。`audio/manifest.json` 的 key = `speechKey(lang, text)`（`packages/schema/src/utils.ts`）。播放端：清单命中 → 播放音频；未命中 → Web Speech API（有则用）→ 都没有则只显示文字。服务端在 macOS 上可用 `say` 为自定义课程即时生成（TTS provider 可插拔）。
- **数据目录**：`SPROUT_DATA_DIR`（默认仓库根 `data/`，已 gitignore）：`sprout.db`、`packs/`（导入的包）、`custom/`、`plugins/`、`tts/`。
- **鉴权**：后台 `POST /api/auth/login` 得 admin token；播放端配对得 device token；均用 `Authorization: Bearer <token>`，服务端区分 scope。
- **插件**：第三方活动 type 必须带点号（`vendor.name`）；插件包 `plugin.json` 见 `packages/schema/src/plugin.ts`；运行时契约见 `packages/plugin-sdk/src/types.ts`。
- **i18n**：界面文字中文为主；面向孩子的显示/朗读依据 LanguageMode。
- 代码注释用中文，简洁；不写无用注释。

## 6. 文档索引

- `docs/dev/api.md` — REST API 契约
- `docs/dev/player-spec.md` — 播放端交互规格
- `docs/dev/activities-spec.md` — 16 个内置活动行为规格
- `docs/dev/admin-spec.md` — 后台规格
- `docs/dev/content-pipeline.md` — 素材 / 音频 / 校验流水线
- `docs/dev/plugin-guide.md` — 第三方插件开发指南（T-activities 产出）
- `docs/dev/content-pack-guide.md` — 内容包制作指南（T-content 产出）
- `docs/research/evidence-review.md` — 循证研究
- `docs/curriculum/` — 成长路线与课程设计
