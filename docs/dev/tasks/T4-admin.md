# T4 — 后台管理 @sprout/admin（家长用，手机与电脑浏览器均可用）

## 所有权
`apps/admin/**`、`docs/dev/admin.md`（新建：后台使用说明，面向家长，配截图位置说明）

## 技术
Vite 8 + React 19 + antd 6 + @ant-design/icons + react-router（BrowserRouter，basename `/admin`）+ dayjs。`vite.config.ts`：`base: '/admin/'`，dev 端口 5311，代理 `/api` `/packs` `/plugins` → `http://localhost:4310`，另代理 `/player` 不需要（预览 iframe 指向服务器根 `/#/preview/...`，开发时指向 `http://localhost:5310/#/preview/...`，用 `import.meta.env.DEV` 区分）。
API 契约：`docs/dev/api.md`；类型全部从 `@sprout/schema` 导入。统一 `api.ts`（fetch 封装：Bearer token 存 localStorage `sprout.adminToken`，401 跳登录，错误 message 中文提示）。
界面中文；移动端自适应（Layout 侧边栏在小屏变抽屉）；主色 `#F08A5D`（antd ConfigProvider theme token），圆角柔和。

## 页面
1. **首次设置 / 登录**：`/api/setup/status` 未初始化 → 设置向导（家庭名、管理员密码、第一个孩子：名字/生日/语言模式）；已初始化 → 登录。
2. **概览 Dashboard**：孩子切换（顶部 Select，全局状态）；孩子卡片（头像、月龄"1 岁 3 个月"、当前阶段与主题）；今日计划（`/today`，列出课程与原因标签：主题/复习/置顶/均衡）+ 今日屏幕时间进度；近 7 天屏幕时间柱状图（纯 SVG/CSS 实现，不引图表库）与领域分布（彩色条，用 `DOMAIN_LABELS` 颜色）；本月龄待观察里程碑数量入口；线下活动建议（来自今日课程 offline 第一条）。
3. **孩子档案**：列表 + 新建/编辑抽屉（名字、昵称、生日、头像（词库动物选择器）、语言模式（四选一，附说明）、显示拼音、屏幕设置：单次/每日上限（留空=阶段默认，显示阶段默认值；超过阶段默认时黄色提示"超过推荐值"；每日 >60 禁止）、可用时段（多段 TimePicker）、护眼提醒；计划：手动指定主题（按路线阶段分组的 Select，可选"自动"）、置顶课程、跳过课程、加强领域）。
4. **成长路线**：读取 `/api/routes/:id`，按阶段 Tabs/时间轴展示：阶段标题、月龄、发展重点、屏幕策略、一日作息建议；每个主题卡片（周数、领域标签、课程列表——点击打开课程详情抽屉）；标记孩子当前所在阶段与主题。
5. **课程库**：筛选（月龄、领域、内容包、主题、关键字）+ 卡片/表格切换；课程详情抽屉：目标、家长导语、短语、线下活动、步骤列表、"预览"按钮（Modal 内 16:9 iframe 加载播放端预览：`<playerOrigin>/#/preview/<id>?token=<adminToken>&mode=<孩子语言模式>&age=<月龄>`）、"复制为我的课程"、"置顶给孩子"/"跳过"。
6. **课程编辑器**（自定义课程）：元数据表单（标题中英、月龄、领域、时长、陪同、目标、家长导语/技巧/短语/理念依据、线下活动（动态列表））；步骤编辑：添加步骤（从 `/api/plugins` 列出的全部活动类型中选择，显示适龄）、拖拽排序、每步 props 编辑 —— 依据 `/api/schemas` 的 `activity.<type>` JSON Schema（第三方用其 propsSchema）**自动生成表单**（支持 string/number/boolean/enum/array/object/nullable/union(string|object) 常见形态；词条字段用词库选择器（带图）；图片字段可上传 `/api/media`）；同时提供"JSON 模式"（textarea + 实时 JSON 校验）。保存前调用服务端校验，展示 issues（定位到字段）。右侧/底部实时预览（iframe postMessage `{type:'sprout:preview', lesson, packId:'sprout.custom'}`）。
7. **词库**：网格展示所有词条（图、中英、拼音、类别筛选、搜索）；自定义词条增删改（上传图片，如家人照片："这是奶奶"）；点击可朗读试听（调用 `/api/tts` 或浏览器 speechSynthesis）。
8. **里程碑**：按孩子月龄定位到对应月龄组（6/9/12/15/18/24/30/36），每条显示中英文，三态按钮（已做到/正在萌芽/还没有）+ 备注 + 日期；显示 disclaimer（不是诊断工具）；统计各月龄完成度。
9. **学习记录**：sessions 表格（时间、课程、时长、完成度、设备）+ 日期范围筛选；统计（`/stats?days=30`）。
10. **内容包**：列表（名称、版本、来源、课程数、词条数、启用开关、校验问题徽标）；导入 zip（Upload）；导出；重新扫描；查看校验问题详情；显示署名 credits。
11. **插件**：列表（内置 16 个活动展示为一组，第三方可启停/删除）；上传插件 zip；登记远程 plugin.json URL；显示权限声明（network/microphone…）并提示风险。
12. **设备**：列表（名称、类型、绑定孩子、最后在线）；"添加设备"：输入电视上显示的 6 位配对码 + 名称 + 绑定孩子；改名/改绑/吊销。附"如何在电视/iPad 上打开播放端"说明卡（显示本机局域网地址：用 `serverUrlHint` 或 `location.origin`）。
13. **设置**：家庭名；TTS（状态、provider、中英文声音选择、试听）；修改密码；备份下载 / 恢复上传；关于（版本、开源素材许可、循证理念简介链接到 docs）。

## 质量要求
- 所有列表空状态友好（引导下一步）；所有破坏性操作 Popconfirm；表单校验中文提示。
- vitest：JSON Schema → 表单字段映射函数、月龄格式化、api 封装错误处理。
- 写 `docs/dev/admin.md`。

## 验收
`pnpm --filter @sprout/admin typecheck test build` 通过（产物在 `apps/admin/dist`，base `/admin/`）。服务端由 T1 并行开发中：若可用，可 `pnpm --filter @sprout/server dev`（或用 `PORT=4410` 避免冲突并相应改代理）联调；若服务端尚不可用，用 `apps/admin/src/mocks/`（MSW 或简单 fetch mock，仅开发模式 `?mock=1` 启用）验证主要页面渲染，并用 headless 浏览器截图存 `apps/admin/test-artifacts/`（加入该包 .gitignore）。
