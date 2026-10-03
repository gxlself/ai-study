# T8 原生与部署验证记录

日期：2026-10-03。所有构建、测试及设备验收按顺序执行，没有提交 Git。未修改 schema、SDK 契约、播放器网页源码或其它任务的源目录。

## Android 产物

| 文件 | 字节 | MiB |
| --- | ---: | ---: |
| `release/sprout-player-1.0.0-debug.apk` | 28204447 | 26.90 |
| `release/sprout-player-1.0.0-release.apk` | 27052513 | 25.80 |

两个变体均由 `assembleDebug` / `assembleRelease` 成功构建。release 使用本机独立 Sprout JKS，自签名 RSA 3072；密钥和口令权限 `0600` 且 gitignore。APK SHA256 与相邻 `.sha256` 文件已核对；release 通过 `apksigner verify`，签名方案 v2。

APK SHA256：

```text
debug   f6cf99f17fc7f7da7513c0631cbb227c7bbb9de193a875811ecbe3e7ffb2d217
release b122d7a9e96a462cfc3c04ffec34adf403c48f94dd1363344d95b659d7089529
```

两端都从真实内容源包的独立副本重新生成 bundle，内置 **96 课 / 220 词 / 1427 条音频**，不是开发夹具。概况记录为 `release/android-content.json`、`release/ios-content.json`。

### Android TV 实机模拟

原先本机唯一登记的手机 AVD 指向不存在的目录。已安装官方 `system-images;android-34;android-tv;arm64-v8a`，创建本任务临时 TV 1080p AVD：

- Android TV API 34、ARM64、1920×1080、1536 MiB RAM、单核、headless、无快照。
- 安装真实 debug APK，ADB DPAD / DPAD_CENTER / Back 走通：离线体验 → 建档 → 共看首页 → 真实课程 → 返回家长门。
- CDP 仅读取状态与焦点，使用 `noDefaults` 保留 WebView 原设置；不注入模拟课、不伪造档案状态、不绕过家长门。
- `apps/player/test-artifacts/android/report.json` 为 `ok: true`。
- 模拟器、独立 ADB 5048 服务已关闭，临时 AVD 已删除，未影响原先登记的 AVD或默认 ADB 服务。

截图：

```text
apps/player/test-artifacts/android/01-offline-setup.png
apps/player/test-artifacts/android/02-home.png
apps/player/test-artifacts/android/03-lesson-intro.png
apps/player/test-artifacts/android/04-lesson-playing.png
apps/player/test-artifacts/android/05-parent-gate.png
```

## iPad

- Xcode 26.5、Capacitor SPM 8.5.2、`iphonesimulator`、arm64、`-jobs 1`、无真机签名，构建成功。
- 产物：`apps/player/ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app`。
- 临时 iPad (A16)、iOS 26.5，`simctl install` / `launch` 成功，通过 Computer Use 只旋转本任务窗口，目视首屏正常横屏、无内容黑边、文字与按钮无重叠。
- 本机 `simctl screenshot` 返回固定面板的竖向原始像素，即使实际窗口已横屏。旧验收脚本宽高断言误报失败，原 `report.json` 保留；已修复采集脚本，不再以 PNG 宽高替代界面方向判断。本轮修复后的完整设备脚本未重新跑，安装、启动、实际横屏与图片校正已分别验证。
- 显示截图仅顺时针旋转 90 度，不裁剪、不修改内容；原始帧缓冲和人工验证记录保留。
- 所有本任务创建的临时 iPad 都已关闭并删除；没有关闭其它任务的 Booted 设备或其 Simulator 窗口。

```text
apps/player/test-artifacts/ios/01-ipad-launch.png          # 2360×1640，按实际窗口方向校正
apps/player/test-artifacts/ios/01-ipad-launch-raw.png      # 1640×2360，原始像素
apps/player/test-artifacts/ios/manual-verification.json
```

## 测试

运行 pnpm 前已设置 `pnpm_config_verify_deps_before_run=false`。

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @sprout/player typecheck` | 通过 |
| `pnpm --filter @sprout/player test` | 15 文件 / 181 测试通过 |
| `pnpm --filter @sprout/player native:test` | 13 测试通过 |
| `node --test --test-concurrency=1 deploy/tests/*.test.mjs` | 4 测试通过 |
| `pnpm --filter @sprout/player exec tsc --noEmit --strict --skipLibCheck --moduleResolution bundler --module ESNext --target ES2022 capacitor.config.ts` | 通过 |
| `pnpm --filter @sprout/player build` | 通过；主 JS chunk >500 KiB 为既有构建 warning |
| `pnpm --filter @sprout/player android:all` | debug/release 构建成功，含全部音频 |
| `pnpm --filter @sprout/player ios:build` | 模拟器构建成功 |
| `SPROUT_ADB_PORT=5048 SPROUT_ANDROID_SERIAL=emulator-5580 SPROUT_ANDROID_ALLOW_CLEAR=1 pnpm --filter @sprout/player native:android-smoke` | 完整遥控器流程通过 |
| `node deploy/check-content.mjs --require-audio` | 96 / 220 / 1427，资源存在且非空 |
| `bash deploy/macos/install.sh --dry-run` | 通过，正确生成绝对 Node/仓库/数据路径及 Asia/Seoul 时区，不安装、不启服务 |
| `plutil -lint` 两端 plist | 通过 |
| `docker compose -f deploy/docker-compose.yml config --quiet` | 通过 |
| `git diff --check` | 通过 |

## Docker

官方 npm 仓库在本机约 20 KiB/s，大包触发原默认超时。Dockerfile 增加十分钟下载超时、pnpm 缓存挂载和可选 `NPM_REGISTRY` 参数；默认仍为官方仓库。本轮以公开 npm 镜像代理验证，固定 pnpm 11.1.0、`--frozen-lockfile` 及包完整性校验，不改写宿主机锁文件。

```sh
docker build --progress=plain \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -f deploy/Dockerfile -t sprout-household:t8-check .
node deploy/smoke-docker.mjs
```

结果：镜像构建通过；server、player、admin 在 Linux 内串行构建通过。一次性空数据容器验证 `/api/health`、播放器与后台真实 dist、96 课内置 bundle、包图片、未鉴权 401、用户 UID 1000 均通过。容器为只读运行层，数据在临时内存目录，使用随机回环端口；验证后已停止并删除，不影响用户其它容器。

镜像保留为 `sprout-household:t8-check`，没有部署常驻容器或注册开机自启。

## 验证边界

- 未验证任何品牌电视真机、安卓平板真机或 iPad 真机；不提供签名 IPA / TestFlight 上传。
- 模拟 TV 使用 `-no-audio` 避免扰民，已检查并打包全部音频资源，不声称完成真实电视扬声器试听。
- 未在用户环境安装 launchd 常驻任务，也未连接或变更真实家庭数据。
- 常亮逻辑依赖网页既有 `.phase-playing` / `.activity-stage[aria-busy]` / `.parent-gate` / `.pause-overlay` / `.guide-dim` 标记；T2 改名时需要同步原生桥接及测试。
