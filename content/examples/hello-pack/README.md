# hello-pack：你好，形状

一个不依赖 `sprout.core` 的完整示例：包 ID 为 `sprout.hello`，内含两个自绘形状词条、两节课和一条连续月龄路线。18–23 月龄的 `hello.parent.shape-hunt` 为家长指引课，屏幕只给家长看，配套实体打印卡；24–26 月龄的 `hello.s1.shapes` 为必须陪同的亲子共看课。每课恰属于一个独立主题，包月龄为 `[18, 26]`。

源码为 JSON、原创 SVG 和说明文件；公开包的音频清单为空，播放端会使用 Web Speech API 或文字回退；需要时可在本机按内容流水线生成个人音频。bundle 可重新构建，zip 位于流水线输出目录。素材全部为 `custom`，无需下载 Fluent Emoji。原创课程内容按根目录 `CONTENT-LICENSE.md`，自绘图形的范围见 `LICENSES.md`。

## 安装与源码检查

在仓库根运行：

```sh
pnpm --dir scripts install --ignore-workspace
export pnpm_config_verify_deps_before_run=false
pnpm content:typecheck
pnpm content:test
pnpm content:assets --pack content/examples/hello-pack
pnpm content:validate --pack content/examples/hello-pack
```

初次未生成音频时，普通 validate 可以有音频覆盖率 warning，但不应有结构、词条、图片、路线或课程引用 error。`--strict` 会把 warning 也视为失败。即使本课很短，音频收集仍包括固定提示语与 1–10 唱数；不要手造空 manifest 来消除警告。

## 本地生成与发布

下面是需要发布时由维护者执行的命令，会产生输出文件。`content:all` 按 assets → audio → validate → bundle 执行，并把 `--pack` 透传给每一步：

```sh
pnpm content:audio --pack content/examples/hello-pack --dry-run
pnpm content:all --pack content/examples/hello-pack
pnpm content:validate --pack content/examples/hello-pack --strict
pnpm content:zip content/examples/hello-pack --out release/
```

音频实际生成需要 macOS 的 `say`、`afconvert` 及相应声音。非 macOS 上 audio 打印说明并成功跳过，不代表已有离线音频；普通 validate 仍报告缺音，严格校验仍失败。

把 zip 上传到后台内容包导入入口，导入后为孩子选择路线 `sprout.hello.route`。源码放在 `content/examples/` 不会自动成为服务器内置包。

完整的字段说明、17 种活动 props 示例、版本升级与导入检查见 `docs/dev/content-pack-guide.md`；流水线 flags、增量与清理规则见 `docs/dev/content-pipeline.md`（均为仓库根相对路径）。
