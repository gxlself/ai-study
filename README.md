# 芽芽成长 Sprout · 官网（gh-pages 分支）

这个分支只放 [gxlself.github.io/ai-study](https://gxlself.github.io/ai-study/) 的静态站点，源代码在 [`main`](https://github.com/gxlself/ai-study) 分支。GitHub Pages 直接从本分支根目录发布。

This branch holds the static site for [gxlself.github.io/ai-study](https://gxlself.github.io/ai-study/). The project source lives on [`main`](https://github.com/gxlself/ai-study); GitHub Pages publishes this branch's root.

## 目录

```text
index.html, en/, 404.html   预渲染的中文页、英文页和 404（已提交的构建产物）
assets/                     CSS、JS、字体子集、插图、OG 图和图标
data/site-data.json         从 main 分支抽取的阶段、课程、活动和参考文献数据
demo/                       播放端演示版（main 分支 `build:demo` 的产物）
src/                        页面模板、双语文案、样式与脚本源码
tools/                      数据抽取、字体子集化和预渲染脚本
```

站点不依赖任何框架和第三方请求：字体全部自托管，没有统计脚本。

## 更新

```sh
# 在 main 的工作区旁边检出本分支
git worktree add ../ai-study-pages gh-pages
cd ../ai-study-pages

node tools/extract-data.mjs ../ai-study   # 抽取站点数据和插图
node tools/fonts.mjs                      # 文案字符有变化时重新子集化字体（需要 python3 + fonttools）
node tools/build.mjs                      # 预渲染页面、OG 图和 sitemap
```

更新演示版：在 main 分支运行 `pnpm --filter @sprout/player build:demo`，再用 `apps/player/dist-demo/` 整体替换本分支的 `demo/`。

## 许可

站点代码按 MIT 许可；页面中的课程文字按主仓库的 [CONTENT-LICENSE.md](https://github.com/gxlself/ai-study/blob/main/CONTENT-LICENSE.md)；字体为 SIL OFL 1.1（见 `assets/fonts/`）；插图来源与许可见 `assets/illustrations/CREDITS.md`。
