# 芽芽成长 Sprout T9 集成验收报告

- 验收日期：2026-10-03（Asia/Seoul）。
- 最终结论：**条件通过，待 T26 快速重建原生包并复测后闭环**。
- 本轮正式核心 bundle SHA-256：`b05d0dd10c735169e1beaf1ce8eef00b89c957b750b5fd8ed043dc9fd683f448`。
- 本轮未执行原生构建；T26 原生证据是修复前 APK/iOS 产物，播放器/活动布局已在 Web 端修复。

## 上一轮摘要

上一轮（2026-10-03 13:18:31）报告为通过：9 项流程通过，核心 96 节双视口通过；核心 bundle 为 96 节 / 120 步、220 词条、1427 条音频，覆盖 100%。本轮课程和词库已升级，以下只采用本轮真实证据。

## 内容与音频

| 内容包 | 课程 | 步骤 | 词条 | bundle 音频 | 运行时覆盖 |
| --- | ---: | ---: | ---: | ---: | --- |
| `sprout.core` | 96 | 120 | 252 | 1548 | 1548/1548 |
| `sprout.culture` | 20 | 26 | 7 | 163 | 153/153 |
| `sprout.english` | 12 | 13 | 1 | 121 | 105/105 |

三包严格校验均为 `0 error / 0 warning`。音频覆盖测试覆盖三包逐课逐步记录，`missing=0`、`uncollected=0`。系统 `say`/`afconvert` 音频仅限个人非商业使用，不得公开再分发；公开发布前须替换为有再分发许可的 TTS 或真人录音。

## 端到端流程

`qa-artifacts/integration-results.json`：**11/11 通过，resourcesClosed=true**。

- 首次设置、7/20/30 月龄档案、分龄计划、每日共看上限和知情提示。
- 配对、家长指引暗屏、共看课程、学习记录、屏幕上限和家长门。
- `previewToken` 预览；未使用旧管理员 `token`。
- `allowedChildIds`：越权切换返回 `403`，允许孩子切换返回 `200`。
- parent-only 线下版：不挂载活动、不计孩子屏幕时间、session 记为 parent。
- A4 主题/单课打印无缺图。
- 第三方插件权限确认、安装、自定义课和预览。
- 核心同版本覆盖、文化/英语扩展包导入。
- 扩展包加载、适龄置顶与月龄守卫、两包预览。

## 并行巡检与修复

| 任务 | 原始证据 | 本轮处置 |
| --- | --- | --- |
| T23 | s1–s3：42/42 课程流程完成；12 个 1920×1080 家长布局记录 | 导语按钮安全区已修复；长阅读保留 T17 滚动例外 |
| T24 | s4–s6：51/54 课程严格布局通过；3 个 s6 sequence 标题重叠 | sequence 双语标题与选项区间距已修复；3 节定向复测通过 |
| T25 | 扩展包 32 课流程完成；打印 42/42 路由通过、124 页 PDF 渲染；长导语记录保留 | 新版导语布局已定向复测；原始 T25 旧脚本因新阅读区焦点路径失配，不作为新版产品失败 |
| T26 | 原生 5/5 功能流程通过，但旧 APK 有 P2-01/P2-02 | Web 修复后 T26-recheck 在 960×540 DPR2、1280×720、1920×1080 全通过；需 T26 快速重建原生包并复测 |

### T9c 修复清单

- 播放端家长导语改为受限阅读区，开始按钮固定在安全区，方向键可滚动长文案。
- 真实电视短高布局补充 960×540/1280×720 适配：首次选择、建档、首页、家长门、休息页和导语缩放。
- movement 活动顶部预留宿主顶栏安全区，倒计时不再覆盖暂停按钮。
- sequence 活动标题独占 flex 空间，避免双语标题压住选项。
- QA 脚本修复 sessionStorage admin token、插件权限确认、插件安装后播放器重载、内容包 ZIP、全天测试窗口和焦点初始化竞态。

## 构建与测试

`qa-artifacts/verification-results.json` 最后一次串行验证完整通过，未重复运行：

| 命令 | 结果 |
| --- | --- |
| `pnpm -r --workspace-concurrency=1 typecheck` | 通过 |
| `pnpm content:typecheck` | 通过 |
| `pnpm -r --workspace-concurrency=1 test` | 通过：Vitest 1246、Node TAP 35 |
| `pnpm content:test` | 通过：304 |
| Service Worker Node TAP | 通过：13 |
| 三包 `content:validate --strict` | 三包均 0 error / 0 warning |
| `pnpm build` | 通过 |
| `pnpm --filter @sprout/player check:compat` | 通过：Chrome 70 / Safari 14 语法基线 |

构建仅有 Vite chunk size warning，无构建失败。

## 安全审查最终状态

- 已修复：H-01、M-01、M-05、M-06、L-01。
- 已缓解：H-02、H-03、H-05、H-06、M-02、M-03、M-04。
- H-02：第三方插件仍为同源 ESM 执行，未实现 iframe 能力隔离/签名固定。
- H-03：短期只读 `previewToken` 已接入，但仍经同源 iframe URL 首次传递。
- H-05：设备默认 `allowedChildIds=null` 仍表示家庭全部孩子，管理员可收紧。
- H-06：服务端已按起止时间与单次上限截断并审计，但尚未使用服务端课程开始凭据。
- M-02：默认明文 HTTP/监听所有网卡仍保留，公网暴露不受支持。
- M-04：后台默认 sessionStorage，播放端电视配对凭据仍在 localStorage。

上述残余风险均已写入 `docs/dev/reviews/security-review.md`，没有发现新的高/中危遗漏。

## 已知限制

- 未对当前 Web 修复后的版本重新构建 Android/iOS；未做真机、扬声器听感或真实打印机验收。
- T26 原生旧证据的两个 P2 已由 Web 定向复测验证，但必须重新打 APK/iOS Simulator 后复测。
- 浏览器验收为单个 Headless Chrome；T23/T24/T25 使用各自冻结快照。
- T17 允许确实超长的家长内容滚动；本轮确认“还有内容”提示、方向键滚动到底、主按钮固定可见。

## 需要 Claude 决策

1. 是否接受 T17 长内容滚动例外作为非阻塞产品规则。
2. **需要 T26 快速重建原生包并复测**：使用当前 Web dist 与源码，重点复测 Android TV 默认 320dpi 对应 960×540 CSS 视口，以及 iPad 横屏；确认 P2-01/P2-02 已在原生包闭环。
3. 公开分发前必须更换三包当前系统合成音频，完成许可更新后重新生成 bundle/ZIP。
