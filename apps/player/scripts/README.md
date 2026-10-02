# T2 离线夹具与 SW 整合

此目录脚本以 `import.meta.url` 定位仓库，不依赖调用时的工作目录。Node 22 可直接运行；夹具校验和排课集成测试使用仓库已安装的 `tsx` 读取 schema / core，其余构建脚本只依赖 Node 标准库。未改 package.json 或 Vite。

## 运行

在 `apps/player/package.json` 中由主任务整合：

```json
{
  "predev": "node scripts/copy-bundled.mjs",
  "prebuild": "node scripts/copy-bundled.mjs",
  "build": "tsc -p tsconfig.json && vite build && node scripts/write-sw-manifest.mjs"
}
```

构建尾部命令必须执行。是否自动运行 predev/prebuild 取决于包管理器配置；未启用生命周期钩子时，在原 dev/build 命令前显式加 `node scripts/copy-bundled.mjs &&`。不修改仓库的 pnpm 配置。

也可以在仓库根按顺序显式运行。测试、构建与后续浏览器验收串行执行；Node 测试文件并发限制为 1：

```sh
node apps/player/scripts/validate-fixtures.mjs
node --test --test-concurrency=1 apps/player/scripts/tests/*.node.mjs
node apps/player/scripts/copy-bundled.mjs
pnpm --filter @sprout/player build
node apps/player/scripts/write-sw-manifest.mjs
```

最后一步可重复执行，生成结果与缓存版本保持确定性。哈希由 SW 模板、文件路径及实际文件内容共同决定；修改任一资源会产生新版本。

## 复制范围

- 首选 `content/packs/sprout-core/{bundle.json,assets,audio}`。只有正式 `bundle.json` 不存在时才回退到 `dev-fixtures/sprout.core` 并打印警告；JSON 损坏或引用的素材缺失时直接失败。
- 目标固定为 `public/bundled/packs/sprout.core/`。先在同一父目录复制完整，再交换当前包；移除当前包的旧生成文件，保留相邻包和 `public` 其他目录。拒绝符号链接。
- 内置夹具不是正式文件夹式内容包，只提供已经聚合好的 `PackBundle`、六幅自绘 SVG 和空音频清单；不用于服务端内容包导入。

## 新契约夹具验收

- `validate-fixtures.mjs` 的预期汇总为 **4 课 / 6 词条 / 6 阶段 / 6 SVG**，只允许家长课 6–36 月跨度产生的 1 条警告。三节共看课为 18–36 月，新增 `core.fixture.parent-guide` 为 `guide` 家长课；全部课程都有线下问题和三档玩法。素材和空音频清单保持不变。
- 真实 core 排课回归覆盖每个月龄的缺省、`auto`、`parent-only`、`co-view`：6–17 月强制家长模式，18–23 月默认家长模式、主动开启后排家长课和一节词卡，24–36 月主题排三节共看课，家长课由首页补充。后两阶段 `lessonsPerDay: 3`，孩子每日预算仍为 3 分钟；家长课不占预算。默认时段断言为 08:00–18:30。
- 浏览器验收三张孩子课程卡请使用 **24 月以上**档案；18–23 月默认不再出现孩子课程卡。家长课有 `printables`（苹果、球），摘要应带 `hasPrintables: true`；家长卡在共看首页与休息页仍需可达。
- 家长课阅读 `durationMin: 1`、离屏陪玩 `guide.playMin: 5`，用于宿主验证变暗陪玩阶段超过三分钟无输入不被自动暂停。还需宿主验证跳过距离提醒与孩子式庆祝、`audience: "parent"` 会话记录不消耗孩子屏幕时间、结束页展示 `question` / `levels`。脚本只检查夹具和排课，不替代这些浏览器验收。
- 本次未修改复制、预缓存、SW、`browser-smoke.mjs` 或 `verify-server.mjs`；公共目录不会因编辑夹具自动更新，仍需主任务执行复制/构建。正式 bundle 存在时始终优先正式包，浏览器如需固定夹具应由验收脚本定向加载本目录。

## SW 行为

- 构建脚本只输出 `apps/player/dist/sw.js`，不修改 `public/sw.js`。扫描真实构建的 `index.html`、`assets/`、`bundled/` 和根目录公开资源，包含懒加载 JS/CSS、图片、字体和音频；排除 source map、隐藏文件、私有 `sprout.custom` 和其他应用目录。使用相对路径，支持根路径与子目录部署。
- 安装时把全部清单资源缓存完成才成功；未访问的内置课程图片和音频也可离线使用。任一资源失败则安装失败，旧 SW 不被强制替换。
- 应用壳、同源 `/packs/` 与 `bundled/` 使用 cache-first；每次构建版本改变会更新内置资源。远程普通内容包在首次访问后可离线使用；其同路径文件变更需重新构建或清除此应用缓存才能更新。
- `/api/` 采用网络优先策略，但**仅无 Authorization、无查询参数的 `GET /api/schemas` 允许缓存回退**。所有孩子、配对、bootstrap、会话、设置、health、setup 状态，以及带 Authorization 的任意 API，都只访问网络、`cache: no-store`，不读写 CacheStorage。因此 API 缓存无身份交叉复用，不包含家庭数据；远程离线接口会失败，由宿主展示状态或切 LocalSource。
- 私有 `sprout.custom` 路径、带 Authorization / Range / 查询参数的资源不缓存；公开素材请求省略 cookie。只保存成功 GET 响应，不保存 206、重定向、opaque、`private` / `no-store` 或依赖 Authorization / Cookie 的 Vary 响应。
- 激活时仅清理当前应用路径下 `sprout-player:` 命名空间的旧版本，不影响后台、其他应用或另一路径部署。不强制 `skipWaiting`，防止打断当前课程。
- 只对应用根与 `index.html` 做 HashRouter 导航回退；`/admin`、未知路径和跨域请求不被应用壳接管。

## 宿主配合

仅在 **生产构建、支持 Service Worker 的 http(s) 安全上下文、非 Capacitor** 下，以 `import.meta.env.BASE_URL + 'sw.js'` 注册普通 classic worker（不要设置 `type: 'module'`）。localhost HTTP 可测试；普通局域网 HTTP 浏览器可能不提供 SW，此时 LocalSource 仍可加载内置内容，但浏览器离线重载不保证可用。

上线前先完成一次在线安装，并等 `navigator.serviceWorker.ready` 后断网重载，检查 `index.html`、哈希 JS/CSS、内置 bundle、六幅图片均可访问。开发模板只预缓存 HTML，不宣称 Vite 开发服务器可离线启动。浏览器可能回收站点缓存，离线不是永久存储承诺。

测试使用 `node:test` 的 `.node.mjs` 文件，不被播放端的 Vitest 默认匹配；临时目录只在此 `scripts/tests/` 下创建并清理。
