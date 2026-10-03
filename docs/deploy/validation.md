# 芽芽成长 Sprout 原生与部署验证记录

## T26 最终原生验收（2026-10-03）

本轮构建与设备测试时间：2026-10-03 17:13–17:48（Asia/Seoul），随后完成证据核对与报告。**构建、正式资源核对及 5/5 原生功能流程通过；保留 2 项 P2 视觉问题，不是无问题发布批准。** 下方 T8 为历史记录，其 APK 大小、哈希和内容数量不代表本轮产物。

只新增原生目录内的验收脚本和测试，更新本文件及 `release/` 产物。没有修改网页播放端、活动、schema、SDK、内容源、其他验收报告，也没有提交 Git。构建使用正式内容，不使用 `SPROUT_BUNDLED_FIXTURE`，未运行根内容操作；原有原生构建器在临时副本内生成 bundle。

### 本轮产物

| 文件 | 字节 | MiB | SHA-256 |
| --- | ---: | ---: | --- |
| `release/sprout-player-1.0.0-debug.apk` | 30090358 | 28.70 | `142df6592b7e44ab70b440a8471b8388cfc55d49b5e6805263a61081523401dd` |
| `release/sprout-player-1.0.0-release.apk` | 28873176 | 27.54 | `802d85cc6b07a84baaf1e8c59ba0571e5d260cf1bfb6ae3059972c08c4e0c689` |

相邻 `.sha256` 文件校验通过；release 经 `apksigner verify --verbose` 验证，v2 签名有效，非 debuggable APK。iOS 模拟器产物为 `apps/player/ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app`，`com.sprout.growth`，无真机签名。

三份产物均内置 **sprout.core 1.0.0：96 课 / 120 步 / 252 词 / 1548 条音频**，其中家长课 54、共看课 42。逐项核对 APK 内音频和词条图片非空；iOS 1548 个音频文件非空；双端 bundle 除构建时间外完全一致，并与当前正式根 bundle 一致。双端及网页 dist 的三个 JS/CSS 文件逐字节哈希一致。

详细元数据：`release/t26-native-final/metadata.json`。源码指纹为 `7a6d2acc8fca843572c4d90f178f1e798bfb990665f895e551b99019f17143d5`，130 个源码文件在本轮设备测试前后核对未变化，最后源码修改时间早于 APK 构建。

### 功能实测

| 场景 | 结果 | 证据与边界 |
| --- | --- | --- |
| Android 7 月龄离线建档与家长首页 | 通过 | 真实 DPAD 建档出生年月 `2026-02`；表单保守日期为 `2026-02-28`，本轮为 7 月龄；`05-seven-birthday.png`、`06-seven-home.png` |
| 家长指引课、暗屏开始/结束、宝宝反应与结束页 | 通过 | `core.s1.my-face`，真实确认键开始与结束；实际无按键等待 185 秒后仍暗屏计时，没有被三分钟无人输入暂停打断；`07-seven-guide-intro.png`、`09-seven-guide-dim-start.png`、`10-seven-guide-dim-after-idle.png`、`11-seven-guide-reaction.png`、`12-seven-guide-ended.png` |
| Android 30 月龄离线建档、知情提示与首页 | 通过 | 真实 DPAD 建档 `2024-03`，保守生日 `2024-03-31`，本轮为 30 月龄；提示由确认键关闭；`15-thirty-birthday.png`、`16-thirty-co-view-notice.png`、`23-thirty-home-after-gate.png` |
| 共看课完成、线下结束页、系统返回键家长门及验证 | 通过 | `core.s6.clap-pattern`，1 个 movement 步骤、6 个动作；自然计时及实际确认键推进，没有改时钟或活动时长；`19-thirty-clap-playing.png`、`21-thirty-lesson-end.png`、`22-thirty-parent-gate.png`、`23-thirty-home-after-gate.png`；门题按屏幕右/左/右序列验证 |
| iPad 安装、启动、横屏首页及一节真实课程 | 通过 | 临时 iPad (A16)、iOS 26.5；真实点按建档并开启 `core.s6.clap-pattern`；`apps/player/ios/test-artifacts/final/01-ipad-home.png`、`02-ipad-lesson-playing.png` |

Android 截图根目录：`apps/player/test-artifacts/android-final/`。直接截图为 1920×1080；TV 镜像默认 320dpi，对应 960×540dp，未调整密度掩盖布局问题。设备安装的是本轮 **release**，没有打开 WebView 调试、注入页面脚本、改 localStorage 或绕过家长门。ADB 5049、模拟器 5582/5583 和新建 AVD 数据目录均独立。

iPad 实际 Simulator 窗口通过原生 Rotate 控件横屏，使用 Computer Use 点按与滑动。`simctl` 原始像素仍为 1640×2360 且内容旋转；主要显示图只顺时针旋转 90 度成为 2360×1640，原始 `*-raw.png` 全部保留，不裁剪、不改内容。方向依据实际窗口与文字朝向，不能仅依据原始 PNG 宽高判断失败。

### 已知问题与需要协调

1. **P2：默认 TV 密度下页面未做到整屏适配。** 初始页、建档页和课程导语有上下裁切，需要方向键滚入屏外控件；7 月龄家长首页只有第一张卡在屏内，第二张需滚动，未满足整屏家长页目标。证据：`00-release-offline-setup.png`、`04-seven-year.png`、`06-seven-home.png`、`07-seven-guide-intro.png`。疑似涉及 `apps/player/src/styles.css:47` 的固定高度/间距及 `:320` 的单列断点。由 T9c 修复网页布局，T26 不越界修改。
2. **P2：TV movement 倒计时与宿主暂停按钮重叠。** `core.s6.clap-pattern` 第 1 步，证据 `19-thirty-clap-playing.png`。疑似涉及 `apps/player/src/styles.css:236` 与 `packages/activities/src/media.css:646` 两组顶栏位置。iPad 本轮画面未复现同样重叠。由 T9c 协调宿主/活动预留区域。

完整问题单与结构化结论：`release/t26-native-final/findings.md`、`results.json`。

### 测试与复现

运行 pnpm 前已导出 `pnpm_config_verify_deps_before_run=false`，本轮命令均已完成。

| 命令 | 实际结果 |
| --- | --- |
| `pnpm --filter @sprout/player typecheck` | 通过 |
| `pnpm --filter @sprout/player test` | 19 文件 / 231 个 Vitest 用例，以及 25 个兼容性 Node 用例通过 |
| `pnpm --filter @sprout/player native:test` | 13 用例通过 |
| `node --test --test-concurrency=1 apps/player/android/scripts/tests/final-tools.test.mjs` | 4 个验收工具安全边界用例通过 |
| `pnpm --filter @sprout/player build` | 通过，含 postbuild 的 SW 和兼容检查 |
| `pnpm --filter @sprout/player android:all` | debug/release 构建通过，正式内容计数已核对 |
| `pnpm --filter @sprout/player ios:build` | arm64 Simulator 构建通过 |
| `shasum -a 256 -c` 两个 APK 的校验文件 | 通过，在 `release/` 目录执行 |
| `apksigner verify --verbose` 本轮 release | 通过，v2 签名有效 |
| `node apps/player/android/scripts/native-final-metadata.mjs` | 双端内容、音频、图片、网页哈希和当前源码时序校验通过 |

日志在 `release/t26-native-final/`。既有警告：Vite 主 chunk 大于 500kB；Gradle flatDir/弃用特性；Xcode UIDeviceFamily 被构建设置覆盖。没有为消除警告修改其他任务代码。

可重复重建与验收：

```sh
export pnpm_config_verify_deps_before_run=false
bash apps/player/android/scripts/native-final-check.sh
# T9c 修复后只重建：
bash apps/player/android/scripts/native-final-check.sh build-only
node apps/player/android/scripts/android-final.mjs
# READY 后可另一个终端通过真实 ADB 按键并保存带时间戳的截图：
node apps/player/android/scripts/adb-frame.mjs --name check --keys 22,23 --wait 1000
# Android 交互终端输入 {"quit":true,"passed":false}，关闭本任务设备后再运行：
node apps/player/ios/scripts/ios-final.mjs
```

重建脚本串行执行，新增构建前源码快照与构建后校验；源代码变化时拒绝把混合产物判为一致。设备脚本为交互式验收工具，不是自动通过脚本；需按实际画面复核，最后发送 quit。修改代码后必须重新实测，不能用重建成功替代设备证据。

### 验证边界与清理

- Android 最初的无障碍读取脚本有页面预期不符、陈旧/空节点和超时，原 `report.json` 的 `ok:false` 与失败尝试完整保留，未改为全绿。后续采用真实 ADB 按键的 `frame-trace.json` 和直接截图目视复核；本轮结论见 `results.json`，不是旧无障碍脚本整体通过。最终工具默认不把无障碍树当截图必需项。
- TV 已关闭 Wi-Fi/蜂窝，但系统仍有模拟 Ethernet；原脚本的“networkDisabled=true”误标已明确纠正并保留原值。没有启动家庭服务器、没有配对或调用家庭 API，验证的是本地离线模式，**不声称完成彻底断网验收**。
- Android `crash.log` 为零字节，没有 Java crash 记录；这不代表全面采集了 release WebView 的 JS 控制台、网络失败或所有音频解码情况。检查了打包资源并实际启动样本课，不把文件存在等同于全量试听。
- Android 使用 `-no-audio`，未验收电视/iPad 真机、实体遥控器、扬声器听感、签名 IPA 或 TestFlight，不改变 T9c 的浏览器/内容巡检结论。
- TV 模拟器、5049 ADB 服务与临时 AVD 已停止并删除；旧 Android runner 清理后 stdin 未退出，已终止其自有进程并修正新工具的 stdin 收尾。iPad 已关闭本任务窗口、terminate/shutdown/delete 该 UDID，交互进程正常退出；没有关闭他人设备或整个共享 Simulator。

## T8 历史记录

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
