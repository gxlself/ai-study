# Hello Plugin

一个不依赖 React 的原生 DOM 活动。每颗星星只能点一次，依次读“一、二、三”，最后读“一共三颗星星”；同时支持遥控器、触屏、输入提示订阅、暂停/恢复、减少动画与取消清理。它是有限次共同数数，不是积分或星星奖励。

## 验证与构建

本例复用仓库已安装的 TypeScript、tsx、Vite、jsdom、fflate 与 schema。不新增依赖，不运行安装，不修改根配置。`@sprout/plugin-sdk` 只用于 `import type`，浏览器产物没有 React、SDK 或其他裸导入。

在仓库根运行：

```bash
node node_modules/typescript/bin/tsc -p plugins/examples/hello-plugin/tsconfig.json
node --import tsx --test plugins/examples/hello-plugin/test/*.test.mjs
node --import tsx plugins/examples/hello-plugin/scripts/build.mjs
```

也提供 workspace 标准脚本 `pnpm --filter @sprout-example/hello-plugin typecheck`、`test`、`build`；本地包管理器可能先进行依赖检查，严格不安装时使用上面的 Node 命令。

输出：

```text
dist/index.js
dist/plugin.json
dist/example.hello-1.0.0.zip
```

ZIP 根目录只有 `plugin.json` 与 `index.js`。Vite 库模式构建前校验清单，构建后检查只有一个 ESM chunk、无静态/动态外部导入、有 default export；fflate 打包并回读检查文件名。测试还会加载 ZIP 内 ESM 的 default export。`dist/` 已忽略。

## 调试

内置活动实验台启动后地址为 `http://localhost:5312/`，内置 17 个活动。要验证本第三方插件，先构建，再在后台上传 ZIP 并在自定义亲子共看课程（`audience=child`，起始月龄不低于 18）增加以下步骤；不要改动内置活动注册表：

```json
{
  "type": "example.hello-stars",
  "props": {
    "count": 3,
    "title": { "zh": "一起数星星", "en": "Count the stars" }
  }
}
```

`count` 为 1–5 的整数，默认 3；`title.zh` 必填且最多 80 字，`title.en` 可选。缺失整个 title 时使用默认双语标题。JSON Schema 在 `plugin.json`，`readHelloProps` 做同口径的运行时防御，不依赖 JSON Schema 工具自动应用 default。

## 文件

| 文件 | 作用 |
| --- | --- |
| `plugin.json` | 清单、能力声明、draft 2020-12 props schema、默认 props |
| `src/index.ts` | 默认导出的 `ActivityPlugin`、DOM 生命周期与输入 |
| `src/props.ts` | props 校验、默认值、`HelloProps` 类型源码导出 |
| `vite.config.ts` | 单 ESM 库模式 |
| `scripts/build.mjs` | 复用已有 Vite/fflate 构建并检查 ZIP |
| `test/*.test.mjs` | 交互、清理、配置边界和构建产物测试 |

宿主提供 tokens.css。所有样式以 `hello-` 前缀且限制在活动根节点下，动态文案使用 `textContent`，SVG 由 DOM API 创建，不注入 props 为 HTML。没有网络、存储、摄像头、麦克风、广告或追踪。

SDK 兼容范围为 `^1.0.0`，清单和运行时版本必须同步。完整契约、安装 API 与音频生成边界见 `docs/dev/plugin-guide.md`。
