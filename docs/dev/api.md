# REST API 契约（v1）

Base：`http://<host>:4310`。JSON 请求/响应；错误统一 `{"error": {"code": "string", "message": "中文说明"}}` + 合适 HTTP 状态码。
类型名指 `@sprout/schema` 导出的类型。鉴权：`Authorization: Bearer <token>`。
- 🔓 无需鉴权　👤 admin token　📺 device token　👤📺 两者皆可

## 初始化与认证
| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/health` | 🔓 | `{ok:true, version, time}` |
| GET | `/api/setup/status` | 🔓 | `{initialized:boolean}`（是否已设置管理员密码） |
| POST | `/api/setup` | 🔓 | 仅未初始化时可用。`{password(>=6), familyName?, child?: ChildInput}` → `{token}` |
| POST | `/api/auth/login` | 🔓 | `{password}` → `{token, expiresAt}`（30 天）；失败 401；同 IP 连续失败 5 次锁 5 分钟 |
| POST | `/api/auth/logout` | 👤 | 作废当前 token |
| GET | `/api/auth/me` | 👤 | `{role:'admin'}` |
| POST | `/api/auth/password` | 👤 | `{oldPassword,newPassword}` |

## 孩子
| GET | `/api/children` | 👤 | `ChildProfile[]` |
|---|---|---|---|
| POST | `/api/children` | 👤 | `ChildInput` → `ChildProfile` |
| GET | `/api/children/:id` | 👤📺 | `ChildProfile`（device 只能读绑定的孩子） |
| PUT | `/api/children/:id` | 👤 | 部分更新（深合并 screen / plan）；`screen.mode` 支持 auto / parent-only / co-view（18 月龄以下强制 parent-only），默认窗口 08:00–18:30 → `ChildProfile` |
| DELETE | `/api/children/:id` | 👤 | 删除孩子及其记录 |
| GET | `/api/children/:id/today?date=YYYY-MM-DD` | 👤📺 | `TodayPlan`（`@sprout/core` scheduler）；`screen.mode` 为生效模式，parent-only 时连 pinned 也只取 parent 课，预算只累计 child 课 |
| GET | `/api/children/:id/screen` | 👤📺 | `ScreenStatus`（含 mode；今日已用仅累计 child sessions，缺 audience 时查课程，未知课保守视为 child）；`allowedNow` 只限制 child 课，不阻拦家长指引 |
| GET | `/api/children/:id/stats?days=7` | 👤 | `{days:[{date, screenSec, lessons, completed}], domains:{[domain]: seconds}, totalSec, streakDays}`；屏幕秒数/领域秒数/totalSec 排除 parent，课次数仍包含家长课；不用于打卡或奖励 |
| GET | `/api/children/:id/milestones` | 👤 | `{items: MilestoneItem[], observations: MilestoneObservation[], disclaimer}` |
| PUT | `/api/children/:id/milestones/:itemId` | 👤 | `MilestoneObservationInput` → `MilestoneObservation` |
| DELETE | `/api/children/:id/milestones/:itemId` | 👤 | 清除观察 |

## 内容：内容包 / 词库 / 课程 / 路线
| GET | `/api/packs` | 👤📺 | `PackInfo[]` |
|---|---|---|---|
| POST | `/api/packs/import` | 👤 | multipart `file`=zip（根含 pack.json 或单一子目录含 pack.json）；校验后解压到 `data/packs/<id>/`；同 id 高版本覆盖 → `PackInfo`；返回校验 issues |
| PUT | `/api/packs/:id` | 👤 | `{enabled:boolean}` |
| DELETE | `/api/packs/:id` | 👤 | 仅 installed 可删 |
| GET | `/api/packs/:id/export` | 👤 | 下载 zip |
| POST | `/api/packs/reload` | 👤 | 重新扫描磁盘 → `PackInfo[]` |
| GET | `/api/packs/:id/validate` | 👤 | `{issues: ValidationIssue[]}`（含每节课） |
| GET | `/api/lexicon?packId=&category=&q=` | 👤📺 | `ResolvedConcept[]`（已启用包合并；imageUrl 为绝对路径 `/packs/...`） |
| POST | `/api/lexicon` | 👤 | 在 `sprout.custom` 新增词条 `Concept` |
| PUT/DELETE | `/api/lexicon/:id` | 👤 | 仅 custom 词条 |
| GET | `/api/lessons?age=&domain=&q=&packId=&themeId=&audience=` | 👤📺 | `LessonSummary[]`（age：月龄；audience：parent / child，缺省课按 child）；摘要包含 audience、hasPrintables |
| GET | `/api/lessons/:id` | 👤📺 | `{lesson: Lesson, packId, baseUrl, issues}` |
| POST | `/api/lessons` | 👤 | 新建自定义课（写入 `data/custom/lessons/<id>.json`，id 自动加 `custom.` 前缀）；保留 printables / offline.question / offline.levels；child 起始月龄须 ≥18，parent 仅 guide/song，打印词条须存在；校验失败 400 + issues |
| PUT | `/api/lessons/:id` | 👤 | 仅 custom；保存后若 TTS 可用则后台生成缺失音频 |
| DELETE | `/api/lessons/:id` | 👤 | 仅 custom |
| POST | `/api/lessons/:id/duplicate` | 👤 | 复制任意课为自定义课（便于家长改编） |
| GET | `/api/routes` | 👤📺 | `{id, title, packId}[]` |
| GET | `/api/routes/:id` | 👤📺 | `Route` |
| GET | `/api/schemas` | 🔓 | `allJsonSchemas()` 结果（后台表单生成用） |
| POST | `/api/media` | 👤 | multipart 上传图片/音频（≤10MB，png/jpg/webp/svg/gif/mp3/m4a/mp4）→ `{path, url}`（存 `data/custom/assets/uploads/`） |

## 插件
| GET | `/api/plugins` | 👤📺 | `PluginInfo[]`（一个 sprout.builtin 含 17 个活动，包含 guide，source='builtin'，无 entryUrl） |
|---|---|---|---|
| POST | `/api/plugins/install` | 👤 | multipart zip（含 plugin.json）→ 解压 `data/plugins/<id>/`，entryUrl=`/plugins/<id>/<entry>` |
| POST | `/api/plugins/remote` | 👤 | `{manifestUrl}`：服务端拉取远程 plugin.json 校验后登记，entryUrl 解析为绝对 URL |
| PUT | `/api/plugins/:id` | 👤 | `{enabled}` |
| DELETE | `/api/plugins/:id` | 👤 | 非 builtin |

## 设备（配对）与播放端
| POST | `/api/pair/start` | 🔓 | `{name?, kind?:'tv'|'tablet'|'browser'}` → `{pairingId, code(6位数字), expiresAt(10分钟)}` |
|---|---|---|---|
| GET | `/api/pair/:pairingId` | 🔓 | `{status:'pending'|'approved'|'expired', deviceToken?, deviceId?}`（approved 后 token 只返回一次） |
| POST | `/api/pair/approve` | 👤 | `{code, name?, childId?}` → `DeviceInfo` |
| GET | `/api/devices` | 👤 | `DeviceInfo[]` |
| PUT | `/api/devices/:id` | 👤 | `{name?, childId?}` |
| DELETE | `/api/devices/:id` | 👤 | 吊销 |
| GET | `/api/device/bootstrap` | 📺 | `DeviceBootstrap`（同时更新 lastSeenAt） |
| PUT | `/api/device/child` | 📺 | `{childId}`：播放端在家长门后切换孩子 |
| POST | `/api/sessions` | 📺👤 | `SessionInput` → `SessionRecord`（clientId 去重）；存 audience，未提供时按课程归一（未知课按 child）；parent 时长不计孩子屏幕时间 |
| GET | `/api/sessions?childId=&from=&to=&limit=` | 👤 | `SessionRecord[]`（倒序） |

## 设置 / TTS / 备份
| GET | `/api/settings` | 👤 | `{familyName, ttsProvider:'auto'|'macos-say'|'none', ttsVoices:{zh,en}, serverUrlHint}` |
|---|---|---|---|
| PUT | `/api/settings` | 👤 | 部分更新 |
| GET | `/api/tts/status` | 👤 | `{available:boolean, provider, voices:{zh:string[],en:string[]}}` |
| POST | `/api/tts` | 👤 | `{lang, text}` → `{url}`（写入 `data/tts/`，自定义包 audio manifest 同步登记） |
| GET | `/api/backup` | 👤 | 下载 JSON（children / sessions / observations / devices(不含token) / settings / custom 课程与词条） |
| POST | `/api/backup/restore` | 👤 | 上传上述 JSON 覆盖恢复 |

## 静态
- `/packs/<packId>/<path>`：内容包文件（仅已加载的包；禁止路径穿越；SVG 设 `Content-Type: image/svg+xml`；长缓存 + ETag）
- `/plugins/<pluginId>/<path>`：已安装插件文件
- `/admin/*` → `apps/admin/dist`（SPA 回退 index.html）
- `/*` → `apps/player/dist`（SPA 回退）
- `/api/docs` → Swagger UI
