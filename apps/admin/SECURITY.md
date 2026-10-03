# T21 后台安全与交互

- 管理员凭据默认保存在 `sessionStorage["sprout.adminToken"]`；只有勾选“在此设备保持登录”才使用 localStorage，并保存明确同意标记。旧版持久凭据迁入当前会话；退出或 401 清除两种存储。开发演示始终使用独立的会话键。
- 预览先请求 `POST /api/preview/token`，成功后使用 `previewToken` 参数加载播放端；失败不回退到管理员凭据，过期后卸载预览。草稿只向 iframe 的确切播放端 origin 发送，ready/activity 消息同时核对 origin 与 source。
- 安装第三方插件前只解析 ZIP 中的 plugin.json，或无凭据读取远程清单；展示来源、入口 URL 和权限，明确说明同源代码风险，勾选后才提交安装。启用前再次读取服务端清单，声明变化时必须重新勾选。安装返回的权限、版本或入口变化时会请求停用；停用失败会明确报警。
- 远程清单来源需允许浏览器跨域读取且不能跳转；读取失败时禁止盲目安装，可改用来源提供的 ZIP。没有新增或臆造服务端预检 API。
- 设备支持勾选允许的孩子；null 表示全部孩子（含以后新增），空数组表示不允许任何孩子。绑定必须在范围内。新设备先按配对契约创建，再 PUT 保存范围；后一步失败时重试同一设备，不重复配对。
- 课程详情和孩子档案中的置顶课程都会提示月龄不符，并区分排课器允许的上限延展 3 个月。

## 验证

所有命令先执行 `export pnpm_config_verify_deps_before_run=false`，下列命令串行运行。

```sh
pnpm --filter @sprout/admin typecheck
pnpm --filter @sprout/admin test
pnpm --filter @sprout/admin build
PLAYWRIGHT_MODULE=/本机/playwright/index.mjs pnpm --filter @sprout/admin test:security
PLAYWRIGHT_MODULE=/本机/playwright/index.mjs pnpm --filter @sprout/admin test:e2e
```

`test:security` 默认使用临时后台 5511 端口，可用 `SPROUT_ADMIN_PORT` 覆盖；浏览器与服务退出时自动关闭。桌面 1440×1000、手机 390×844 的截图及结果在 `test-artifacts/t21/`，不提交。安全交互验收使用独立 API 与播放端契约桩，不能替代 T18/T22 的真实后端和播放端验收。

## 剩余边界

会话存储不防同源 XSS；保持登录仍会持久存储管理员凭据。插件确认不是代码隔离，插件仍可能读取同源页面和存储；远程代码内容也可能在确认后改变。预览使用短期只读 URL 凭据但仍同源。对应风险只标为缓解，不宣称彻底隔离。

真实环境需 T18 提供短期只读预览令牌和设备孩子范围校验，T22 消费 previewToken 并约束插件加载与消息来源。插件 ZIP 解析复用已有 fflate，依照公共任务规则仅新增后台包依赖与锁文件中后台 importer 的三行声明。
