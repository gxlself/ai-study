# Sprout 原生资源与构建

此目录属于 T8，不修改播放端 `src/` 或共享 schema。源小芽复制自 `content/packs/sprout-core/assets/images/other/sprout.svg`；TV 横幅采用共享令牌中的奶油底、绿色小芽及「芽芽成长」字样。`native:assets` 生成真 PNG，涵盖五种 Android launcher/adaptive 密度、320×180 TV 横幅、1024 AppIcon和 iOS 启动屏小芽。

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/player native:assets
pnpm --filter @sprout/player native:test
pnpm --filter @sprout/player native:sync
pnpm --filter @sprout/player android:all
pnpm --filter @sprout/player ios:build
```

生成资源、测试、Android 构建、iOS 构建、浏览器/设备验收串行运行。Gradle 单 worker/非驻留，Xcode `-jobs 1`；生成脚本在 `finally` 关闭自有浏览器。构建命令不自动启动模拟器或开发服务器。密钥生成与备份见 `docs/deploy/README.md`，所有本地密钥均已忽略。

原生构建使用 `stage-content.mjs` 在本目录被忽略的临时副本中调用已有 `scripts/bundle-pack.ts`，从真实源课程/路线生成最新 bundle。成功后只替换 Android/iOS 原生工程的 bundled 资源，不改写内容任务的源包和根 bundle，也不改播放端 `public/`。失败时清理暂存且不发布 APK；包概况记录在 `release/android-content.json` / `ios-content.json`。临时包不是开发夹具。

## 原生常亮桥接

`native-runtime.js` 由 `native:sync` 拷贝到两端工程，在原生 WebView 主页面注入，只调用本地 `SproutScreen.setAwake`。它观察既有页面标记：

- `.lesson-page.phase-playing` 下 `.activity-stage[aria-busy="false"]` 才可常亮；
- `.parent-gate`、`.pause-overlay`、`.guide-dim`、页面隐藏/离开时释放；
- 原生恢复强制同步，Promise 串行发送避免迟到状态覆盖；
- Android 用当前 Activity `FLAG_KEEP_SCREEN_ON`，iOS 用 `UIApplication.isIdleTimerDisabled`；两端切后台另有原生兜底释放。

不申请系统 WAKE_LOCK，不占用 Home/返回键，不向第三方页面 iframe 注入。若 T2 将这些 DOM 标记改名，需要同步本目录的查询与测试，或共同引入稳定的课程状态事件，不能悄悄保持常亮。

## 安卓设备验收

仅在自己创建的测试设备或明确授权的设备执行。debug APK 允许 WebView CDP，release 不打开调试。设备脚本会清除测试 App 数据，必须显式传入许可环境变量：

```sh
export pnpm_config_verify_deps_before_run=false
SPROUT_ANDROID_SERIAL=emulator-5580 SPROUT_ANDROID_ALLOW_CLEAR=1 \
  pnpm --filter @sprout/player native:android-smoke
```

脚本使用 ADB DPAD/OK/返回走页面，CDP 只用于读取网页状态、观察焦点和截图证据；不注入模拟课程或绕过家长门。截图与报告写入 `apps/player/test-artifacts/android/`。脚本会删除自己的 ADB forward、断开 CDP并停止测试 Sprout，不会启动、关停或清空其他设备。启动者需要安装 debug APK，结束后关闭自己创建的模拟器。

无可用 AVD 时可安装 Android TV ARM64 镜像；若 SDK 不提供该 ABI/镜像，明确记录失败而不是在手机截图上标「电视验收通过」。

## iPad 模拟器验收

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/player native:ios-smoke
```

需要已经执行 `ios:build`。脚本优先 iPad (A16)，使用已安装的可用 iOS runtime，自行创建一次性设备、安装/启动 App并保存 `test-artifacts/ios/01-ipad-launch.png`。在 Simulator 中打开名为 `Sprout T8 temporary iPad` 的窗口并旋转到横屏；`SPROUT_IOS_CAPTURE_DELAY_SEC=60` 可留出操作时间。仅横屏 App 在竖持的 iPadOS 26 模拟器上会被系统加黑边，不能把它当作横屏验收。

`simctl screenshot` 在本机 iPad 模型上仍输出固定竖向面板的原始像素，即使 Simulator 窗口已真实横屏。可以指定 `SPROUT_IOS_CAPTURE_ROTATE_DEG=90` 按实际窗口方向校正输出；原始截图始终另存为 `01-ipad-launch-raw.png`，不裁剪、不改内容，报告记录校正角度和原始尺寸。横屏是否正确仍须目视 Simulator，而不是只凭 PNG 宽高判断。成功或失败都在 `finally` 关闭并删除本任务设备，不操作其他任务的 Booted 模拟器。
