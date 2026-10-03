# T18–T22 — 并行修复模块（来自 T14 安全审查、T15/T16 发现、Claude 决策）

通用：读 `docs/dev/reviews/security-review.md`（编号 H-xx/M-xx/L-xx）、`docs/dev/api.md` 末尾"安全补充 v1.1"、`packages/schema/src/runtime.ts`（`DeviceInfo.allowedChildIds`、`PreviewToken` 已加入契约）。每条修复最小化 + 测试；完成后在 security-review.md 对应条目末尾追加一行"状态：已修复 / 已缓解 / 接受风险（原因）——T1x"（只改你负责的条目）。

## T18 服务端安全 — 所有权 `apps/server/**`
H-01 远程插件 SSRF（仅 http(s)；拒绝 loopback/link-local/云元数据地址；局域网与 https 公网允许，公网 http 拒绝；不跟随跳转到被拒地址；超时与大小限制）、H-03 服务端部分（`POST /api/preview/token`，scope=preview 只读 10 分钟，按 api.md 白名单）、H-05（devices.allowedChildIds 存储与校验：`PUT /api/devices/:id`、`PUT /api/device/child`、`POST /api/sessions`）、H-06（durationSec ≤ endedAt−startedAt+5 且 ≤ 单次上限×2，否则截断并记 event）、M-01（停用包/插件的静态文件 404；包内 .html/.js 以下载或 text/plain 方式提供，插件目录除外）、M-02（默认仍 0.0.0.0，但启动日志与 docs/dev/server.md 说明风险；CORS 改为允许局域网私有地址、localhost、capacitor:// 来源，而不是任意来源；加 `SPROUT_CORS_ORIGINS` 覆盖）、M-03（配对/登录/上传/导入/TTS 的限流与并发上限）。H-02 服务端部分：插件安装 API 返回权限与来源信息，供后台弹窗。

## T19 排课器 — 所有权 `packages/core/**`
置顶（pinned）/review/balance 候选必须满足月龄（孩子月龄 ≥ lesson.ageRange[0] 且 ≤ ageRange[1]+3）；audience=child 的置顶课在 parent-only 模式下以 `offlineOnly` 出现（不丢弃）；无路线扩展包的课程同样适用；把 `content/packs/sprout-culture/.qa/age-guard.ts` 的场景写成 core 单元测试。确保 `childLessonsPerDay`、每日时长上限与上述规则共同生效。

## T20 内容工具与授权文档 — 所有权 `scripts/**`、`docs/dev/content-pipeline.md`、`README.md`（只改"许可与素材"一节）、`content/packs/*/LICENSES.md` 与各包 README 的许可段、`content/packs/sprout-culture/**` 与 `content/packs/sprout-english/**`（仅为消除 warning 的最小数据修正，不改教学内容）
1. `scripts/lib/validate-pack.ts`：pack.json `routes` 为空的扩展包不报"课程未归主题"，保留其它校验，补回归测试。
2. 两个扩展包 `content:validate --strict` 0 error 0 warning（音频缺失则运行 content:audio 补齐）。
3. 音频授权说明（macOS 系统语音仅限个人非商业、不可公开再分发；公开分发需改用可商用 TTS 或真人录音重新生成 audio/，说明服务端 TTS provider 如何接入、manifest 结构保持不变）。
4. 若 `pnpm content:test` 有失败，修到全绿（不得通过删测试）。

## T21 后台安全与交互 — 所有权 `apps/admin/**`
H-03 后台部分（预览改为先 `POST /api/preview/token` 再用 `previewToken` 打开播放端预览；postMessage 预览只向确定的播放端 origin 发送）、H-02 后台部分（安装/启用第三方插件时弹窗：显示声明的权限、来源 URL，并提示"插件与播放端同源运行，只安装你信任的来源"，需勾选确认）、H-05 后台部分（设备页可勾选允许的孩子）、M-04 后台部分（admin token 默认存 sessionStorage，可选"在此设备保持登录"再存 localStorage）、置顶课程时若月龄不符给出提示。

## T22 播放端与活动安全 — 所有权 `apps/player/src/**`、`apps/player/index.html`、`packages/activities/src/**`（在 T17 完成后运行）
H-02 播放端部分（合理 CSP：允许自身、已配置服务器、局域网服务器、blob/data 图片与音频；远程插件仅从已登记 entryUrl 加载）、H-03 播放端部分（预览支持 `previewToken`，不再接受 URL 中的 admin token；预览 token 不落盘）、H-04（web 活动校验最终 origin / 使用 sandbox 与 referrerpolicy，postMessage 校验 event.origin 与 source）、M-04 播放端部分（device token 存储说明与远程 session key 中不残留 token）、M-05（video/poster/captions/预加载只允许包内路径或已配置服务器同源 URL）、M-06（sort 活动 color 字段只接受 hex/rgb/具名颜色白名单）、L-01（预览消息来源仅限明确的后台 origin）。
