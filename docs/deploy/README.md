# 芽芽成长部署与设备安装

Sprout 只面向可信家庭局域网。屏幕是亲子活动的引子，课程结束后去玩真实材料；不自动连播、不引入广告或统计。18 月龄以下的页面给家长阅读，不给宝宝观看。

## 交付与发布检查

- Android TV 和安卓平板共用 `com.sprout.growth` APK，Android 7.0+，始终横屏。
- iPad/iPhone 共用 Capacitor 8 App，iOS/iPadOS 15+，仅横屏；本任务不提供真机签名 IPA 或 App Store/TestFlight 上传。
- 网页播放端在 `/`，家庭后台在 `/admin/`，健康检查在 `/api/health`，端口默认 `4310`。
- 签名 APK 使用 Sprout 独立的家庭自签名证书，不使用零一内部生产密钥。不要丢失或公开签名密钥与口令。

在仓库根执行以下命令，**测试和构建依次运行**：

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/player typecheck
pnpm --filter @sprout/player test
pnpm --filter @sprout/player native:test
node --test --test-concurrency=1 deploy/tests/*.test.mjs
node deploy/check-content.mjs --require-audio
```

内容制作方需先完成 `docs/dev/content-pipeline.md` 中的严格校验、真实音频生成及正式源包。原生构建在 `resources/` 的临时副本中重建 bundle，Docker 在构建容器中重建 bundle，均不改写宿主机内容文件；Mac 网页部署仍需内容制作方重建根包的正式 bundle。原生/Docker 发布禁止使用 `SPROUT_BUNDLED_FIXTURE=1`；空课程、空路线、缺失图片不能作为可用离线内容。`check-content` 检查内置资源和空包，不替代整包严格校验或音频试听。

普通 `check-content` 允许没有音频，但会明确打印警告；`--require-audio` 会拒绝零条音频。无清单时 App 只能尝试设备 Web Speech，再不可用就静默显示文字。**APK 构建成功不等于无 TTS 电视已经有中文声音。**

## 一、Mac 本机服务器

要求 Node 22.13+、项目指定的 pnpm、已经安装工作区依赖。Mac 和电视/iPad 接入同一路由器，不要使用相互隔离的访客 Wi-Fi。

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/server build
pnpm --filter @sprout/player build
pnpm --filter @sprout/admin build
node deploy/check-content.mjs
SPROUT_DATA_DIR="$PWD/data" node apps/server/dist/index.js
```

打开 `http://localhost:4310/admin/`。先在前台验证健康检查和配对，再启用 launchd：

```sh
bash deploy/macos/install.sh --dry-run
bash deploy/macos/install.sh \
  --node "$(command -v node)" \
  --repo "$PWD" \
  --data-dir "$PWD/data" \
  --timezone Asia/Shanghai
```

这会安装**当前登录用户**的 `~/Library/LaunchAgents/com.sprout.server.plist`，在用户登录后自动启动，不是未登录时的系统 LaunchDaemon。模板使用 Node、仓库和数据目录的绝对路径，不依赖 launchd 加载 shell、nvm 或 pnpm。不要使用 `sudo`。`--port 4410` 可避开已占用的端口；家庭设备也需要改成同一端口。

安装脚本默认不构建应用，缺少三个 `dist` 会拒绝安装。`--dry-run` 仅打印填充后的 plist，不写文件、不启服务。日志在 `<数据目录>/logs/server.stdout.log` 和 `server.stderr.log`。自启不会唤醒处于睡眠状态的 Mac，请在系统设置中配置家庭需要的供电/睡眠策略。

```sh
launchctl print "gui/$(id -u)/com.sprout.server"
launchctl kickstart -k "gui/$(id -u)/com.sprout.server"
bash deploy/macos/install.sh --uninstall
```

卸载只停止服务和删除自启配置，**不删除家庭数据**。更新程序时先备份，再停止服务、依次重建三个应用、重新运行安装脚本。仓库目录移动或 nvm Node 路径变化后需重新安装。

## 二、NAS / 小主机 Docker

要求支持 Linux 容器的 Docker Engine 和 Compose v2；可使用 ARM64 或 AMD64 主机，不适用于仅支持专有应用包且不支持 Docker 的 NAS。以下命令均在仓库根：

```sh
export TZ=Asia/Shanghai
docker compose -f deploy/docker-compose.yml config --quiet
docker compose -f deploy/docker-compose.yml build
docker compose -f deploy/docker-compose.yml up -d
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs --tail=100 sprout
```

多阶段镜像串行构建 server、player、admin，只运行 Node 22 slim。运行层使用非 root 的 `node` 用户、只读文件系统、临时 `/tmp` 和持久数据卷 `/data`。镜像保留 `pnpm-workspace.yaml`，保证服务端能定位工作区。Docker 专用忽略文件排除原生工程、签名密钥、真实 `data/`、APK 和本地环境变量文件。

构建需要 BuildKit（当前 Docker 默认启用），pnpm 包缓存用于避免重试时重复下载，大包下载超时为十分钟。默认 npm 官方仓库；网络受限时可在 `docker build` 加 `--build-arg NPM_REGISTRY=<可信的npm仓库代理>`，固定锁文件与完整性校验不变，不在镜像中写入代理凭据。

访问 `http://<NAS的局域网IP>:4310/admin/`。默认向主机网卡发布端口，**不要配置路由器公网端口映射**。可在构建/启动前设置 `SPROUT_BIND_IP` 为主机局域网 IP，限制监听网卡。`TZ` 应为家庭所在地时区，影响每日记录与允许使用时段。未知品牌 NAS 的界面名称可能不同，等价配置是端口 `4310:4310`、数据卷 `/data`、重启策略 `unless-stopped`。

Linux 没有 macOS 的 `say`；Docker 不会自动补音。请在 Mac 完成音频生成并将清单与 `.m4a` 放入正式内容包后再构建镜像。自定义课没有预生成音频时，播放设备可用的 Web Speech 是回退，不是完整离线音频承诺。

```sh
docker compose -f deploy/docker-compose.yml stop
docker compose -f deploy/docker-compose.yml down
```

`down` 默认保留数据卷；**不要加 `-v`，它会删除家庭数据**。更新镜像前冷备份，随后 `build`、`up -d`，检查健康状态及后台课程。

## 三、仅离线 App

无需 Mac/NAS 常驻服务器。安装 release APK，或用 Xcode 安装 iPad App；首次选择「先离线体验」，填写出生年月后开始。

内置包、素材和已生成的音频随 App 打包。本机孩子、语言、课程记录存于此 App 的 WebView 存储；卸载、清除 App 数据或切换签名后卸载重装会丢失本机资料。没有服务器时不能使用后台课程编辑、导入第三方插件或服务器备份。开启共看仍需家长陪同，默认家长模式不会因离线而绕过月龄限制。

离线模式可在家长门后打开连接设置，再与家庭服务器配对。当前接口不承诺将原离线档案/历史自动合并到服务器，也不承诺远程模式断网后的冷启动；长期断网请明确选择离线模式。

## Android 打包与签名

要求 Java 21+、Android SDK 36 和 Android Studio/SDK 工具。原生构建脚本优先使用 `JAVA_HOME` 的 Java 21+，再找本机 Android Studio JBR；`local.properties` 由 SDK 本地路径生成且不提交。

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/player native:assets
pnpm --filter @sprout/player android:keygen
pnpm --filter @sprout/player android:all
```

`native:assets` 使用本机 headless Chrome 串行生成资源，退出时关闭浏览器；可用 `CHROME_PATH` 指定安装路径。资源来自内容包的小芽，源图在 `apps/player/resources/`，不下载网络图片。

`android:all` 从真实源包的独立副本生成离线 bundle、构建网页并 sync，然后将新 bundle 安装到原生 assets，再使用单 worker、非驻留 Gradle 构建 debug/release，输出：

```text
release/sprout-player-<player版本>-debug.apk
release/sprout-player-<player版本>-release.apk
release/sprout-player-<player版本>-debug.apk.sha256
release/sprout-player-<player版本>-release.apk.sha256
```

也可单独用 `android:build` / `android:release`。密钥首次生成到 `apps/player/android/keystore/sprout-release.jks`，随机强口令写入 gitignore 的 `android/keystore.properties`，二者权限均为 `0600`。口令通过环境传给 keytool，不进入命令参数或终端输出。可预设至少 12 位安全字母数字口令到 `SPROUT_KEYSTORE_PASSWORD`；更推荐自动生成。

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/player android:keygen
```

重复执行会保留已有签名，只有密钥或只有口令时会拒绝覆盖。将二者加密备份，不能把 `keystore.properties.example` 中的示意值当真实口令。后续 APK 升级必须使用同一把密钥，并递增 `android/app/build.gradle` 的 `versionCode`。debug/release 签名不同，同包名不能互相覆盖；给家庭使用统一安装 release 版，不要为解决安装冲突随意卸载已有档案。

APK 自签名不等于任何厂商应用商店的上架审核，本任务不涉及发布账号。

## 电视与安卓平板安装

Android TV/Google TV、小米/红米、海信、TCL 等**支持安卓 APK 安装的型号**可选择：

1. U 盘：把 release APK 放入 U 盘，用电视文件管理器打开，为该安装器允许「安装未知应用/未知来源」，确认安装。
2. ADB：在设备开发者选项开启调试。以屏幕显示的设备地址和授权提示为准；不默认所有电视都开放 `5555`。

```sh
adb connect <电视IP>:<调试端口>
adb devices
adb -s <设备序列号> install -r release/sprout-player-1.0.0-release.apk
adb -s <设备序列号> shell am start -n com.sprout.growth/.MainActivity
```

仅在自家可信网络临时开启调试，安装后关闭并撤销授权。华为智慧屏/部分新系统及各品牌某些型号不支持普通 Android APK，不能保证此 APK 可装；使用其可用的电视浏览器或 iPad 投屏。各品牌「未知来源」菜单不同，以当前型号系统设置为准，不承诺逐品牌真机兼容。

APK 在普通应用列表和 TV Leanback 桌面都有入口，包含 320×180 横幅，不要求触屏。系统 WebView 太旧时请先更新 Android System WebView/Chrome；旧且无法升级的电视浏览器可能不支持本播放端。

电视浏览器可直接访问 `http://<服务器IP>:4310/`，无需 APK，但需要服务器开机。方向键移动焦点、OK 确认、返回进入家长门。Android `DPAD_CENTER` 只转换成 Enter，不额外触发点击；返回保留 `@capacitor/app` 的 `backButton` 处理。

常亮只在课程活动可见且未暂停时开启；导语、首页、结束页、暂停、家长门、后台及 `guide` 暗屏陪玩均释放。不申请整机 WAKE_LOCK，不阻止整个电视系统进入用户设置的待机策略。

## iPad 安装与浏览器

### Xcode 个人团队真机安装

```sh
export pnpm_config_verify_deps_before_run=false
pnpm --filter @sprout/player ios:build
open apps/player/ios/App/App.xcodeproj
```

工程使用 Capacitor 8 默认 SPM，不需要 CocoaPods。首次构建会解析固定版本的 Swift Package，需要访问 GitHub。在 App target 的 Signing & Capabilities 选择个人 Apple ID 的 Personal Team，并按 Xcode 提示为个人安装使用唯一 Bundle ID；通过 USB/Wi-Fi 选择自己的 iPad，开启开发者模式并运行。

免费 Personal Team 的开发描述文件约 7 天到期，需要重新从 Xcode 安装；付费团队采用其相应签名流程。本仓库不配置个人 Development Team、证书、描述文件，也不交付已签名真机 IPA。

模拟器构建默认不启动设备。可指定现有 iPad 模拟器：

```sh
xcrun simctl list devices available
export pnpm_config_verify_deps_before_run=false
SPROUT_IOS_DESTINATION='platform=iOS Simulator,name=iPad (A16)' \
  pnpm --filter @sprout/player ios:build
```

用实际可用设备名称替换示例。产物在 `apps/player/ios/DerivedData/Build/Products/Debug-iphonesimulator/App.app`。安装/启动只操作自己创建的设备，用完关闭它，不使用 `simctl shutdown all` 干扰别的任务。

App 仅横屏，隐藏状态栏，奶油色启动屏居中小芽。首次连接家庭 IP 时允许「本地网络」权限；若拒绝，可在系统设置的本地网络/App 权限中重新允许。HTTP 放行用于家庭局域网，不建议连接公开或不可信服务器。

### Safari 添加到主屏幕

Safari 打开 `http://<服务器IP>:4310/`，分享 → 添加到主屏幕，横屏使用。家庭局域网普通 HTTP 通常不是 Service Worker 安全上下文，**不能保证关服务器后离线重载**；需要可靠离线用原生 App，或由熟悉证书的维护者部署 HTTPS。

### Apple TV

本项目没有 tvOS App。tvOS 不提供本方案需要的 WKWebView，不能把 iPad Capacitor 工程直接打成 Apple TV App。可使用 iPad 的屏幕镜像/AirPlay 投到 Apple TV，触控和家长门仍在 iPad 上操作；实际视频/音频路由受家庭设备支持情况影响。

## 首次配对

1. 服务器后台 `/admin/` 首次设置至少六位管理员密码，添加孩子及出生日期，选择语言和屏幕策略。
2. 电视/iPad 选择「连接家庭服务器」，填写家庭服务器局域网 IP、端口 `4310`。不是播放设备自己的 `localhost`。
3. 播放端显示六位配对码；家长在后台「设备」页面输入，命名电视/iPad并绑定孩子，十分钟内完成。
4. 设备拿到 device token 后进入首页；未绑定孩子时按提示选择。管理员 token 不填写到播放器。
5. 配对失败或 token 丢失后获取新码。删除后台设备会吊销权限；备份恢复后原设备必须重新配对。

推荐路由器 DHCP 固定租约，避免服务器重启后 IP 改变；更换 IP 后通过家长门重新设置连接。

## 备份与恢复

### 后台逻辑备份

后台「系统/备份」下载 JSON，可恢复孩子、课程、词条、记录和观察等契约数据。它**不包含管理员密码、token、自定义上传媒体、TTS 音频及安装包**。更换机器时还要从内容管理导出自定义包及所需安装包 ZIP；恢复后重新配对设备。接口为 `GET /api/backup`、管理员 `POST /api/backup/restore`，不是公开下载接口。

### 完整冷备份

先停止服务，再复制**整个数据目录/卷**，包括 SQLite `-wal/-shm`、`custom`、`packs`、`plugins`、`tts`。不要只拷运行中的 `sprout.db`。备份含家庭私密数据，保存在加密、非公开位置。

Mac：卸载/停止 launchd 后，将 `<数据目录>` 打包到目录之外；恢复到新建空目录，再把安装脚本的 `--data-dir` 指向它。保留旧数据直至验收成功。

Docker：

```sh
mkdir -p deploy/backups
docker compose -f deploy/docker-compose.yml stop
docker compose -f deploy/docker-compose.yml run --rm -T --no-deps \
  --entrypoint tar sprout -C /data -czf - . > deploy/backups/sprout-data.tar.gz
docker compose -f deploy/docker-compose.yml up -d
```

恢复到**全新的空卷**，而不是混入有旧文件的卷。可用新 Compose 项目名避免覆盖原卷；原项目须先停止以释放端口：

```sh
docker compose -f deploy/docker-compose.yml stop
docker compose -p sprout-restored -f deploy/docker-compose.yml run --rm -T --no-deps \
  --entrypoint tar sprout -C /data -xzf - < deploy/backups/sprout-data.tar.gz
docker compose -p sprout-restored -f deploy/docker-compose.yml up -d
```

验证孩子、记录、上传媒体和课程后再处理旧卷。完整冷备包含设备认证数据，应按私密凭据保护；跨家庭分享只用不含 token 的逻辑备份，不分享整卷。

## 常见问题

| 问题 | 检查 |
| --- | --- |
| 连不上服务器 | 同一 Wi-Fi、非访客隔离；IP/端口正确；服务器没睡眠；Mac 防火墙允许 Node；NAS 端口映射；iPad 本地网络权限；先用另一台手机访问 `/api/health` |
| 4310 被占用 | Mac 安装 `--port 4410`，相应更新电视/iPad地址；不要结束其他开发任务的服务 |
| 首页没有课/没有路线 | 检查正式 bundle 是否为空或过期；内容制作方重建正式包后重建网页、sync 并重打 APK/App；不要用开发夹具冒充正式包 |
| 没有声音 | 用「开始」产生首次用户交互，检查系统/设备/网页音量；Android TV 常无 TTS，必须检查预生成清单、实际音频和新版 bundle；guide 家长文字本来不朗读 |
| 返回键直接退出/某些键无效 | 使用最新原生 APK和 WebView；方向、OK、返回分别测试；蓝牙遥控器键码差异需具体设备日志，不能用绕过家长门的 Back 行为解决 |
| 安装显示签名不一致 | 同包名 debug/release 或遗失后重生成证书；保留原签名重打。不要未经备份就卸载现有离线资料 |
| iPad 无法打开 App | 个人签名到期、开发者模式未开启或证书未信任；重新按 Xcode 提示安装 |
| Docker `say` 不可用 | Linux 的预期行为；在 Mac 预生成音频后重建，不把空音频当成功 |
| 课程结束后屏幕变暗/暂停 | guide 陪玩和无人输入暂停为保护机制；不自动连播，不自动保持整天常亮 |
| 服务每天额度/日期不对 | 服务器 `TZ` 和设备时钟是否为家庭本地时间；不要修改系统时间绕过屏幕限制 |
| 浏览器离线刷新失败 | 普通家庭 HTTP 无安全上下文或缓存被回收；用内置包原生 App，远程模式不保证完全断网冷启动 |

## 验收与官方参考

实际构建/运行结果、APK 大小与截图路径见 [验证记录](validation.md)。原生脚本说明见 [resources/README](../../apps/player/resources/README.md)。

可独立验证 Docker 镜像；脚本使用一次性内存数据、随机回环端口，不加载真实家庭档案，结束时停止并删除自有容器：

```sh
docker build -f deploy/Dockerfile -t sprout-household:t8-check .
node deploy/smoke-docker.mjs
```

- [Android TV 启动与横幅要求](https://developer.android.com/training/tv/start/start)
- [Capacitor Android](https://capacitorjs.com/docs/android) / [iOS](https://capacitorjs.com/docs/ios)
- [Apple 个人/付费成员资格与描述文件限制](https://developer.apple.com/support/compare-memberships/)
- [WKWebView 平台可用性](https://developer.apple.com/documentation/webkit/wkwebview)
