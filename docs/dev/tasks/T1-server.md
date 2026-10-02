# T1 — 核心逻辑 @sprout/core + 服务端 @sprout/server

## 所有权
`packages/core/**`、`apps/server/**`、`docs/dev/server.md`（新建：服务端运行/配置/数据目录说明）

## A. packages/core（纯 TS，浏览器与 Node 通用，禁止使用 node:* 模块）
导出（**签名是契约，播放端离线模式也会调用**）：
```ts
export function localDateString(d: Date): string; // 本地日期 YYYY-MM-DD
export function findStage(route: Route, ageMonths: number): Stage | null; // 小于首阶段→首阶段；大于末阶段→末阶段；route 无阶段→null
export function resolveScreenPolicy(stage: Stage | null, screen: ChildScreenSettings):
  { sessionMaxMin: number; dailyMaxMin: number; lessonsPerDay: number; coView: 'required'|'recommended'|'optional' };
  // 孩子设置非 null 时覆盖阶段默认值；session 上限 30、daily 上限 60；stage 为 null 时默认 {10,20,2,'recommended'}
export function screenStatus(args: { policy: ReturnType<typeof resolveScreenPolicy>; windows: TimeWindow[]; usedSec: number; now: Date }): ScreenStatus;
  // windows 为空=全天允许；跨午夜窗口需支持；超出 daily → allowedNow=false, reason='daily-limit'；不在窗口 → 'outside-window' + nextWindow
export function summarizeLesson(lesson: Lesson, packId: string, resolveImage?: (packPath: string) => string): LessonSummary;
export function currentTheme(route: Route, stage: Stage, child: { birthday: string; plan: PlanOverrides }, date: Date):
  { theme: Theme; weekIndex: number } | null;
export function planToday(args: {
  route: Route;
  lessons: Record<string, LessonSummary>;       // 可用课程索引（已启用内容包）
  child: Pick<ChildProfile, 'id' | 'name' | 'birthday' | 'screen' | 'plan'>;
  history: Pick<SessionRecord, 'lessonId' | 'startedAt' | 'completed' | 'durationSec'>[]; // 近 60 天
  date: Date;
  usedSec: number;                               // 今日已用屏幕秒数
}): TodayPlan;
export function computeStats(sessions: Pick<SessionRecord,'lessonId'|'startedAt'|'completed'|'durationSec'>[], lessons: Record<string, LessonSummary>, days: number, today: Date): {...与 api.md stats 响应一致};
```
排课算法（确定性：同输入同输出）：
1. `ageOf(birthday, date)` → 月龄；`findStage`。
2. 主题：`plan.themeId` 指定且存在于路线 → 用它（weekIndex=0）。否则：从孩子满 `stage.ageRange[0]` 月的日期起算经过的周数 w，按 themes 的 weeks 累加定位；超出总周数则循环（w mod 总周数）。
3. N = `lessonsPerDay`。依次填充（去重、跳过 `plan.skipped`、只取 `lessons` 中存在的）：
   a. `plan.pinned`（reason 'pinned'）
   b. 当前主题课程：优先完成次数最少的，平局按 `(主题内序号 + 日序号) % len` 轮换（日序号 = 从 1970-01-01 起的本地天数）（reason 'theme'）
   c. 若 N≥2 且还有空位：上一个主题（同阶段前一主题，或上一阶段最后主题）中近 7 天未做过的一课（reason 'review'）
   d. `plan.focusDomains` 非空且还有空位：本阶段任一主题中主领域属于 focusDomains 的课（reason 'balance'）
   e. 仍不足：当前主题其余课程
4. 计划总时长（durationMin 之和）超过 dailyMaxMin 时从尾部删减（至少保留 1 课）。
5. `screen` = `screenStatus(...)`。
用 vitest 写充分测试（阶段边界、主题轮换、跨午夜窗口、pinned/skipped、确定性、"两"量词无关）。

## B. apps/server（Fastify 5 + node:sqlite DatabaseSync）
- 完整实现 `docs/dev/api.md` 全部接口（含 Swagger `/api/docs`）。
- 配置（环境变量）：`PORT`(4310)、`HOST`(0.0.0.0)、`SPROUT_DATA_DIR`(仓库根/data)、`SPROUT_CONTENT_DIRS`(默认 仓库根/content/packs，逗号分隔)、`SPROUT_PLAYER_DIST`(apps/player/dist)、`SPROUT_ADMIN_DIST`(apps/admin/dist)、`SPROUT_MILESTONES`(content/milestones/milestones.json)。仓库根通过向上查找 pnpm-workspace.yaml 确定。dist 不存在时对应静态路由返回友好提示页而非崩溃。
- 结构建议：`src/index.ts`（启动）、`src/app.ts`（buildApp(config) 便于测试）、`src/db.ts`（迁移，user_version）、`src/auth.ts`、`src/content/`（PackRegistry：扫描/校验/索引/热重载/导入导出 zip）、`src/routes/*.ts`、`src/tts/`（provider 接口 + macos-say 实现：`say -v <voice> -o x.aiff` → `afconvert -f m4af -d aac` 转 m4a；非 macOS 或不可用则 available=false）、`src/plugins/`（插件注册表）。
- DB 表（自行设计）：settings、admin_tokens、children(JSON 列存 screen/plan)、devices、pairings、sessions、milestone_observations、plugins。密码用 `crypto.scrypt` + salt；token 存 sha256。
- 内容包加载：读取 `pack.json` → `PackManifest` 校验；词库、路线、`lessonsDir` 下递归所有 `*.json` 课程逐个 `validateLesson`（knownConcepts = 本包 + sprout.core + 其他启用包的词条 id）；有 error 的课程不进入索引但出现在 `PackInfo.errors` 与 `/validate`。若包目录有 `bundle.json` 也忽略它（以源文件为准）。
- `sprout.custom` 包：首次启动自动在 `data/custom/` 创建 pack.json（ageRange [0,72]）、空 lexicon、lessons/、assets/uploads/、audio/manifest.json。
- 内置插件列表：16 个内置活动来自 `BUILTIN_ACTIVITY_TYPES` 与 `BUILTIN_ACTIVITY_META`，作为 source='builtin' 的单个 PluginInfo（id 'sprout.builtin'）返回。
- 第三方活动 props 校验：已启用插件 `propsSchema`（JSON Schema）→ 用简易校验（可只校验 type/required，或引入 ajv：`pnpm --filter @sprout/server add ajv`）。
- 静态文件：`/packs/:id/*`、`/plugins/:id/*` 防路径穿越；SVG content-type；Cache-Control。player/admin dist SPA 回退。
- CORS：允许任意来源（局域网 + Capacitor `capacitor://localhost`、`http://localhost`）。
- 测试（vitest + `app.inject`）：setup/login 流程、孩子 CRUD、配对全流程、today、sessions 去重、pack 导入（用 fflate 在测试里现做 zip）、自定义课程 CRUD 与校验失败、路径穿越防护。测试使用临时 data 目录与一个测试用迷你内容包（放在 `apps/server/test/fixtures/`，不要依赖 content/packs 的实际内容，因为内容正在被其他任务编写）。
- `tsup` 构建到 `dist/index.js`（bundle @sprout/*，external fastify 等 node_modules 依赖即可）；`pnpm --filter @sprout/server start` 能跑。
- 写 `docs/dev/server.md`。

## 验收
`pnpm --filter @sprout/core test typecheck`、`pnpm --filter @sprout/server test typecheck build` 全通过；手动 `PORT=4410 SPROUT_DATA_DIR=<临时目录> node apps/server/dist/index.js` 启动后 curl `/api/health`、`/api/schemas`、`/api/docs` 正常，然后关闭。
