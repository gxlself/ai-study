# T8 — 原生打包（Android TV / 安卓平板 APK、iPad App）+ 部署

## 所有权
`apps/player/android/**`、`apps/player/ios/**`、`apps/player/resources/**`（图标/横幅源图与生成图）、`apps/player/capacitor.config.ts`（可调整原生相关字段）、`apps/player/package.json` 的 scripts（只加原生相关脚本）、`deploy/**`（新建）、`release/`（产物，apk 已在 .gitignore 白名单）、`docs/deploy/**`（新建）

## Android（电视 + 平板 通用 APK）
1. `pnpm --filter @sprout/player build` → `npx cap add android`（在 apps/player 下）→ `cap sync android`。
2. `android/local.properties` 写 `sdk.dir=/path/to/Android/sdk`（已 gitignore）。
3. AndroidManifest：
   - `<uses-feature android:name="android.software.leanback" android:required="false"/>`、`<uses-feature android:name="android.hardware.touchscreen" android:required="false"/>`
   - 启动 Activity 同时声明 `LAUNCHER` 与 `LEANBACK_LAUNCHER`；`android:banner="@drawable/banner"`（320×180）
   - `android:screenOrientation="sensorLandscape"`；`android:usesCleartextTraffic="true"` + network_security_config 允许局域网 http
   - 适当的 `configChanges` 防止旋转/键盘导致 WebView 重载
4. 遥控器：确认 WebView 获得焦点、方向键/OK(DPAD_CENTER)/返回键能传到网页（返回键走 `@capacitor/app` backButton）；如有必要在 MainActivity 里把 `KEYCODE_DPAD_CENTER` 转成 Enter 事件；保持屏幕常亮仅在课程播放时（可在网页侧通过一个极简 Capacitor 插件或 `@capacitor-community/keep-awake`；如引入新依赖用 `pnpm --filter @sprout/player add`）。
5. 图标与横幅：用词库吉祥物 `content/packs/sprout-core/assets/images/other/sprout.svg`（若不存在用 `apps/player` 内任意自绘小芽 SVG）生成各密度 launcher 图标（含 adaptive icon 前景/背景）与 TV banner（奶油底 + 小芽 + "芽芽成长" 字样）。生成工具任选（rsvg-convert / ImageMagick / headless Chrome / sharp），把源 SVG 放 `apps/player/resources/`。
6. 构建：`./gradlew assembleDebug` 与 `assembleRelease`（release 用自签名 keystore：生成到 `apps/player/android/keystore/sprout-release.jks`，加入 apps/player/.gitignore；口令写在 gitignore 的 `keystore.properties`，文档说明如何自己生成）。产物复制为 `release/sprout-player-<version>-debug.apk` 与 `-release.apk`。
7. 验证：若本机有可用模拟器镜像（`$ANDROID_HOME/emulator/emulator -list-avds`），启动（优先 Android TV 镜像，没有就用手机/平板镜像横屏）安装 APK，用 `adb shell input keyevent` 模拟 DPAD 走通"离线体验 → 首页 → 打开一节课 → 返回家长门"，`adb exec-out screencap` 截图存 `apps/player/test-artifacts/android/`。无镜像时可尝试 `sdkmanager` 安装 `system-images;android-34;android-tv;arm64-v8a`（或 google_atv），失败则跳过并在回报说明。

## iOS / iPadOS
1. `npx cap add ios` → `cap sync ios`（CocoaPods 或 SPM 按 Capacitor 8 默认）。
2. Info.plist：支持 iPad（UIDeviceFamily 1,2）、仅横屏、`NSAppTransportSecurity` → `NSAllowsLocalNetworking` = YES 与 `NSAllowsArbitraryLoads` = YES（家庭局域网 http）、`NSLocalNetworkUsageDescription`（"用于连接家里的芽芽成长服务器"）、隐藏状态栏、`UIRequiresFullScreen`。
3. App 图标（AppIcon 1024）与启动屏（奶油色 + 小芽）。
4. 验证：`xcodebuild -workspace/-project ... -scheme App -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPad (A16)'`（用 `xcrun simctl list devices` 找可用 iPad 模拟器）构建成功；能启动则 `xcrun simctl install/launch` 并截图。真机签名不在本任务范围，写进文档。

## 部署 `deploy/` 与文档 `docs/deploy/`
- `deploy/Dockerfile`（多阶段：pnpm build server/player/admin → node:22-slim 运行 `apps/server/dist/index.js`，数据卷 `/data`，端口 4310；Linux 下无 macOS TTS，内置包音频已预生成即可）、`deploy/docker-compose.yml`、`deploy/macos/com.sprout.server.plist`（launchd 开机自启模板）+ `deploy/macos/install.sh`。
- `docs/deploy/README.md`：三种部署（Mac 本机 / NAS Docker / 仅离线 App）；电视安装（Android TV/小米/华为/海信/TCL 等：U 盘或 adb 安装 APK，开启"未知来源"；电视浏览器直接打开 `http://<服务器IP>:4310`）；iPad 安装（Xcode 个人团队签名真机安装 7 天有效 / Safari 添加到主屏幕 PWA）；Apple TV 说明（tvOS 无 WebView，建议 iPad AirPlay 投屏）；首次配对流程；备份恢复；常见问题（连不上服务器、没有声音（Android TV 无 TTS 时依赖预生成音频）、遥控器某些键无效）。

## 验收
APK 两个变体构建成功并在 `release/`；iOS 模拟器构建成功；文档完整。回报中列出产物路径、大小、验证截图路径、未能验证的项。
