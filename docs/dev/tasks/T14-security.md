# T14 — 安全与健壮性审查（只读审查 + 报告）

## 所有权
只写 `docs/dev/reviews/security-review.md`。**不修改任何源码**（后续由验收任务统一修复）。

## 范围
`apps/server`（鉴权/token/限流/配对码爆破、上传与 zip 解压（zip slip、zip bomb、符号链接、大小限制）、路径穿越、SVG/HTML 注入、CORS、备份恢复的输入校验、TTS 命令注入（say/afconvert 参数）、远程插件 manifest 拉取（SSRF）、错误信息泄露、SQL 注入、默认绑定 0.0.0.0 的风险提示）、`apps/player`（远程插件 import 的信任模型、web 活动 iframe sandbox、postMessage 来源校验、预览 token 放在 URL 的风险、localStorage 中的 token）、`apps/admin`（XSS、token 存储、预览 iframe postMessage）、`packages/activities`（web/video 活动）。
## 方法
阅读代码 + 可运行的本地验证（启动服务到临时 data 目录、构造恶意请求/zip，验证完关闭）。
## 报告格式
每条：严重度（高/中/低）、位置（文件:行）、问题、可复现步骤、建议修复（具体到代码层面）。最后给出"家庭局域网部署"场景下的整体风险评估与优先级排序。
