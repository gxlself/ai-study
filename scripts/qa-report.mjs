import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'docs/dev/qa-report.md');
const viewports = ['1920x1080', '1024x768'];
const rootTestScopes = [
  'packages/schema', 'packages/core', 'packages/plugin-sdk', 'apps/server',
  'packages/activities', 'apps/admin', 'apps/player',
];
const expectedChecks = [
  '后台首次设置与三个孩子档案',
  '分龄计划、每日共看上限与知情提示',
  '遥控器连接、后台配对、选孩子、家长暗屏与记录',
  '共看课、结束线下活动及后台学习记录',
  '每日 1 分钟上限与家长门临时延长',
  'parent-only 的仅线下计划、家长记录与后台徽标',
  'A4 主题与单课打印无缺图',
  '后台安装插件、自定义课与真实插件预览',
  '后台导出与同版本覆盖、hello-pack 导入课程库',
];
const labels = { passed: '通过', failed: '失败', pending: '待验收' };
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const list = (value) => Array.isArray(value) ? value : [];
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const count = (value) => integer(value) ? String(value) : '未知';
const unique = (values) => [...new Set(values)];
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const result = (status, details) => ({ status, details });
const combine = (statuses) => statuses.includes('failed') ? 'failed'
  : !statuses.length || statuses.includes('pending') ? 'pending' : 'passed';
const jobStatus = (job) => job.error || job.signal ? 'failed'
  : job.exitCode === 0 ? 'passed' : job.exitCode == null ? 'pending' : 'failed';
const fatalLogLine = (line) => /\b(?:ERR_PNPM\w*|ELIFECYCLE)\b|\bERR!|(?:^|\s)Error:|Build failed|Command failed with exit code|exited with code [1-9]\d*/i.test(line);

function describe(value) {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, (key, item) =>
    /token|password|secret|authorization/i.test(key) ? '[已省略]' : item);
}

function cell(value) {
  return describe(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\|/g, '&#124;').replace(/`/g, '&#96;').replace(/\r?\n/g, '<br>');
}

function table(headers, rows) {
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

function dateText(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未知' : new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(date);
}

async function readSource(relative, json = false) {
  const source = { relative, data: null, text: '', modifiedAt: null, status: 'pending', issue: '' };
  try {
    const file = path.join(root, relative);
    const [text, info] = await Promise.all([readFile(file, 'utf8'), stat(file)]);
    source.text = text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
    source.modifiedAt = info.mtime.toISOString();
    if (json) {
      source.data = JSON.parse(text);
      if (!isObject(source.data)) throw new Error('JSON 顶层必须为对象');
    }
    source.status = 'passed';
  } catch (error) {
    source.status = error.code === 'ENOENT' ? 'pending' : 'failed';
    source.issue = error.code === 'ENOENT' ? '文件缺失，不能据此宣称通过' : `读取或解析失败：${error.message}`;
    source.data = null;
  }
  return source;
}

function checkResult(rows) {
  if (!rows.length) return result('pending', '缺少 checks 记录');
  if (rows.length > 1) return result('failed', `同名检查有 ${rows.length} 条记录，不能擅自选择一次通过结果`);
  const row = rows[0];
  if (row.error || row.passed === false) return result('failed', row.error || 'passed=false，未提供错误详情');
  if (row.passed !== true) return result('pending', '缺少明确的 passed=true 记录');
  return result('passed', describe(row.details) || 'checks 明确记录 passed=true');
}

function inspectLesson(lesson, rows, formalBundle) {
  if (!rows.length) return result('pending', '缺少该课程的视口巡检记录');
  if (rows.length > 1) return result('failed', `同一课程/视口有 ${rows.length} 条记录，结果存在歧义`);
  const row = rows[0], failures = [], pending = [];
  if (row.error) failures.push(row.error);
  if (row.passed === false) failures.push('巡检记录未通过');
  else if (row.passed !== true) pending.push('未记录 passed=true');
  if (formalBundle === false) failures.push('集成结果明确未使用正式 bundle');
  else if (formalBundle !== true) pending.push('集成结果未确认正式 bundle');
  if (!Array.isArray(lesson.steps) || !lesson.steps.length) failures.push('正式课程缺少有效步骤');
  if (row.steps !== lesson.steps?.length) failures.push(`步骤数不一致：记录 ${count(row.steps)}，正式包 ${count(lesson.steps?.length)}`);
  if (list(row.consoleErrors).length) failures.push(`控制台错误：${describe(row.consoleErrors)}`);
  if (row.consoleErrors !== undefined && !Array.isArray(row.consoleErrors)) pending.push('consoleErrors 结构无效');
  if (!Array.isArray(row.inspections)) pending.push('缺少逐步 inspections 证据');
  const inspections = list(row.inspections);
  if (inspections.length !== lesson.steps?.length) pending.push(`逐步记录 ${inspections.length}/${count(lesson.steps?.length)}`);
  for (const [index, step] of list(lesson.steps).entries()) {
    if (!isObject(step)) { failures.push(`正式包第 ${index + 1} 步结构无效`); continue; }
    const matches = inspections.filter((inspection) => inspection?.step === index + 1);
    if (!matches.length) { pending.push(`第 ${index + 1} 步未巡检`); continue; }
    if (matches.length !== 1) { failures.push(`第 ${index + 1} 步记录重复`); continue; }
    const inspection = matches[0], prefix = `第 ${index + 1} 步`;
    if (inspection.type !== step.type) failures.push(`${prefix}活动类型与正式包不一致`);
    for (const [key, name] of [['broken', '破图'], ['overflow', '文字溢出']]) {
      if (!Array.isArray(inspection[key])) pending.push(`${prefix}缺少${name}检测`);
      else if (inspection[key].length) failures.push(`${prefix}${name}：${describe(inspection[key])}`);
    }
    for (const [key, name] of [['horizontalOverflow', '页面横向溢出'], ['blank', '白屏'], ['unknown', '未知活动']]) {
      if (inspection[key] === true) failures.push(`${prefix}${name}`);
      else if (inspection[key] !== false) pending.push(`${prefix}缺少${name}检测`);
    }
    if (!integer(inspection.presses)) pending.push(`${prefix}缺少完成步骤的按键记录`);
    else if (inspection.presses > 40) failures.push(`${prefix}按键次数 ${inspection.presses} 超过 40`);
  }
  if (failures.length) return result('failed', unique([...failures, ...pending]).join('；'));
  if (pending.length) return result('pending', unique(pending).join('；'));
  return result('passed', '');
}

function parseSummary(text) {
  const summary = { passed: 0, failed: 0, skipped: 0, todo: 0, pending: 0 };
  for (const match of text.matchAll(/(\d+)\s+(passed|failed|skipped|todo|pending)\b/g)) {
    summary[match[2]] += Number(match[1]);
  }
  const total = text.match(/\((\d+)\)\s*$/);
  summary.total = total ? Number(total[1]) : null;
  summary.complete = total !== null && ['passed', 'failed', 'skipped', 'todo', 'pending']
    .reduce((sum, key) => sum + summary[key], 0) === summary.total;
  return summary;
}

function sumSummaries(summaries) {
  if (!summaries.length) return null;
  return Object.fromEntries(['total', 'passed', 'failed', 'skipped', 'todo', 'pending', 'cancelled'].map((key) => [
    key, summaries.some((summary) => summary[key] === null || summary[key] === undefined && key === 'total')
      ? null : summaries.reduce((sum, summary) => sum + (summary[key] ?? 0), 0),
  ]));
}

function parseTests(source, requireTap = false, expectedScopes = []) {
  const runs = [], taps = [], errors = [];
  let run, tap;
  for (const [index, line] of source.text.split(/\r?\n/).entries()) {
    if (fatalLogLine(line)) errors.push(`第 ${index + 1} 行：${line.trim()}`);
    const started = line.match(/\bRUN\s+v\S+\s+(.+)$/);
    if (started) {
      run = { name: started[1].trim(), files: null, tests: null, noTests: false };
      runs.push(run); tap = null;
    }
    if (/^\s*TAP version \d+/.test(line)) {
      tap = {}; taps.push(tap); run = null;
    }
    if (/No test files found, exiting with code 0/.test(line) && run) run.noTests = true;
    const summary = line.match(/\b(Test Files|Tests)\s+(\d+\s+(?:passed|failed|skipped|todo|pending)\b.*)$/);
    if (summary) {
      if (!run) { run = { name: 'Vitest 汇总', files: null, tests: null, noTests: false }; runs.push(run); }
      run[summary[1] === 'Tests' ? 'tests' : 'files'] = parseSummary(summary[2]);
    }
    const tapCount = line.match(/^\s*# (tests|pass|fail|cancelled|skipped|todo) (\d+)\s*$/);
    if (tapCount) {
      if (!tap) { tap = {}; taps.push(tap); }
      const keys = { tests: 'total', pass: 'passed', fail: 'failed', cancelled: 'cancelled', skipped: 'skipped', todo: 'todo' };
      tap[keys[tapCount[1]]] = Number(tapCount[2]);
    }
  }
  const vitestStatuses = runs.map((item) => {
    if (item.files?.failed || item.tests?.failed) return 'failed';
    return item.noTests || item.files?.complete && item.tests?.complete ? 'passed' : 'pending';
  });
  const tapStatuses = taps.map((item) => {
    if (item.failed || item.cancelled) return 'failed';
    return ['total', 'passed', 'failed', 'cancelled', 'skipped', 'todo'].every((key) => integer(item[key]))
      && item.total === item.passed + item.failed + item.cancelled + item.skipped + item.todo ? 'passed' : 'pending';
  });
  const missingScopes = expectedScopes.filter((scope) =>
    !runs.some((item) => item.name.replace(/\/$/, '') === path.join(root, scope)));
  const vitestStatus = combine([...vitestStatuses, ...(missingScopes.length ? ['pending'] : [])]);
  const tapStatus = combine(tapStatuses);
  const status = combine([
    source.status, vitestStatus, ...(requireTap || taps.length ? [tapStatus] : []),
    ...(errors.length ? ['failed'] : []),
  ]);
  return {
    status, runs, errors, vitestStatus, tapStatus,
    files: sumSummaries(runs.flatMap((item) => item.files ? [item.files] : [])),
    vitest: sumSummaries(runs.flatMap((item) => item.tests ? [item.tests] : [])),
    tap: taps.length ? Object.fromEntries(['total', 'passed', 'failed', 'cancelled', 'skipped', 'todo'].map((key) => [
      key, taps.every((item) => integer(item[key])) ? taps.reduce((sum, item) => sum + item[key], 0) : null,
    ])) : null,
    details: source.issue || errors.join('；') || (status === 'pending'
      ? `缺少完整测试汇总，不能确认整个命令已结束${missingScopes.length ? `；未记录范围：${missingScopes.join('、')}` : ''}` : ''),
  };
}

function parseStrict(source) {
  const summaries = [], issues = [], errors = [];
  let headers;
  for (const [index, line] of source.text.split(/\r?\n/).entries()) {
    const issue = line.match(/\[(错误|警告|error|warn(?:ing)?)\]\s*(.+)$/i);
    if (issue) issues.push({ level: /错误|error/i.test(issue[1]) ? '错误' : '警告', text: issue[2], line: index + 1 });
    if (fatalLogLine(line)) errors.push(`第 ${index + 1} 行：${line.trim()}`);
    if (!line.includes('│')) continue;
    const cells = line.split('│').slice(1, -1).map((part) => part.trim());
    if (cells.includes('内容包') && cells.includes('错误') && cells.includes('警告')) { headers = cells; continue; }
    if (!headers || cells[headers.indexOf('内容包')]?.replace(/^['"]|['"]$/g, '') !== 'sprout.core') continue;
    const value = (name) => {
      const text = cells[headers.indexOf(name)];
      return /^\d+$/.test(text ?? '') ? Number(text) : null;
    };
    summaries.push({ errors: value('错误'), warnings: value('警告'), lessons: value('有效课程') });
  }
  const strict = /(?:^|\s)--strict(?:\s|$)/m.test(source.text);
  const zeroIssues = source.status === 'passed' && strict && summaries.length > 0
    && summaries.every((summary) => summary.errors === 0 && summary.warnings === 0)
    && !issues.length && !errors.length;
  const failed = issues.length || errors.length || summaries.some((summary) => summary.errors > 0 || summary.warnings > 0);
  return {
    status: failed ? 'failed' : zeroIssues ? 'passed' : source.status === 'failed' ? 'failed' : 'pending',
    summaries, issues, errors, zeroIssues,
    details: source.issue || (summaries.length ? summaries.map((summary) =>
      `有效课程 ${count(summary.lessons)}，错误 ${count(summary.errors)}，警告 ${count(summary.warnings)}`).join('；')
      : '未解析到 sprout.core 的严格校验汇总'),
  };
}

function parseBuild(source) {
  const lines = source.text.split(/\r?\n/);
  const errors = lines.filter(fatalLogLine);
  const warnings = lines.flatMap((line, index) => /\(!\)|\bwarning\b/i.test(line)
    ? [`第 ${index + 1} 行：${line.trim()}`] : []);
  const viteBuilds = [...source.text.matchAll(/built in \d+(?:\.\d+)?(?:ms|s)\b/g)].length;
  const server = /ESM[^\n]*Build success/.test(source.text);
  const formalCopy = /\[copy-bundled\][^\n]*正式内容包/.test(source.text);
  const swManifest = /\[write-sw-manifest\][^\n]*\/apps\/player\/dist\/sw\.js/.test(source.text);
  const serial = /--workspace-concurrency(?:=|\s+)1\b/.test(source.text);
  const quotedFilters = /--filter\s+(['"])\.\/packages\/\*\1/.test(source.text)
    && /--filter\s+(['"])\.\/apps\/\*\1/.test(source.text);
  const complete = server && viteBuilds >= 3 && formalCopy && swManifest && serial && quotedFilters;
  return {
    status: errors.length || source.status === 'failed' ? 'failed'
      : source.status === 'passed' && complete ? 'passed' : 'pending',
    warnings, errors,
    details: source.issue || `server 成功标记 ${server ? '有' : '无'}；Vite 完成标记 ${viteBuilds}；正式包复制 ${formalCopy ? '有' : '无'}；SW 清单完成 ${swManifest ? '有' : '无'}；串行/引号过滤 ${serial && quotedFilters ? '有' : '无'}；构建警告 ${warnings.length}`,
  };
}

function inspectAudio(source, lessons) {
  const audio = source.data, failures = [], pending = [];
  if (!audio) return result(source.status, source.issue);
  const steps = lessons.reduce((sum, lesson) => sum + list(lesson.steps).length, 0);
  if (!integer(audio.required) || !integer(audio.present)) pending.push('所需/已覆盖计数缺失或无效');
  else if (audio.present > audio.required) failures.push('已覆盖计数大于所需计数');
  else if (audio.present < audio.required) failures.push(`缺少 ${audio.required - audio.present} 条朗读音频`);
  else if (audio.required === 0) pending.push('所需音频为 0，不能推断正式包达到 100% 覆盖');
  if (!Array.isArray(audio.missing)) pending.push('缺少 missing 清单');
  else if (audio.missing.length) failures.push(`缺失音频：${describe(audio.missing)}`);
  if (!lessons.length) pending.push('缺少正式课程，无法核对覆盖范围');
  else if (audio.lessons !== lessons.length || audio.steps !== steps) failures.push('覆盖产物的课程/步骤计数与正式包不一致');
  const rows = list(audio.rows);
  if (!Array.isArray(audio.rows) || lessons.length && rows.length !== steps) pending.push(`逐步覆盖记录 ${rows.length}/${lessons.length ? steps : '未知'}`);
  for (const lesson of lessons) {
    for (const [index, step] of list(lesson.steps).entries()) {
      if (!isObject(step)) { failures.push(`${lesson.id} 正式包第 ${index + 1} 步结构无效`); continue; }
      const matches = rows.filter((row) => row?.lessonId === lesson.id && row.step === index + 1);
      if (!matches.length) { pending.push(`${lesson.id} 第 ${index + 1} 步缺少覆盖记录`); continue; }
      if (matches.length !== 1) { failures.push(`${lesson.id} 第 ${index + 1} 步覆盖记录重复`); continue; }
      const row = matches[0], prefix = `${lesson.id} 第 ${index + 1} 步`;
      if (row.type !== step.type) failures.push(`${prefix}活动类型不一致`);
      if (!integer(row.required)) pending.push(`${prefix}缺少所需文本计数`);
      for (const key of ['missing', 'uncollected']) {
        if (!Array.isArray(row[key])) pending.push(`${prefix}缺少 ${key} 清单`);
        else if (row[key].length) failures.push(`${prefix} ${key}：${describe(row[key])}`);
      }
    }
  }
  return result(failures.length ? 'failed' : pending.length ? 'pending' : 'passed',
    unique([...failures, ...pending]).join('；') || `运行时所需 ${audio.required}，已覆盖 ${audio.present}；逐课逐步记录完整`);
}

export async function generateReport() {
  const sources = await Promise.all([
    readSource('qa-artifacts/integration-results.json', true),
    readSource('qa-artifacts/audio-coverage.json', true),
    readSource('content/packs/sprout-core/bundle.json', true),
    readSource('qa-artifacts/logs/tests.log'),
    readSource('qa-artifacts/logs/pipeline-tests.log'),
    readSource('qa-artifacts/logs/strict-validate.log'),
    readSource('qa-artifacts/logs/build.log'),
    readSource('qa-artifacts/verification-results.json', true),
  ]);
  const [integrationSource, audioSource, bundleSource, testsSource, pipelineSource, strictSource, buildSource, verificationSource] = sources;
  const rawJobs = list(verificationSource.data?.jobs);
  const verificationJobs = rawJobs.filter(isObject);
  const requiredJobs = ['typecheck', 'pipeline-typecheck', 'tests', 'pipeline-tests', 'service-worker', 'strict-validate', 'build'];
  const commandResults = requiredJobs.map((name) => {
    const rows = verificationJobs.filter((job) => job.name === name);
    const status = rows.length > 1 ? 'failed' : rows.length ? jobStatus(rows[0]) : 'pending';
    const details = rows.length > 1 ? `${name} 有重复命令记录`
      : !rows.length ? `${name} 缺少命令退出记录`
      : rows[0].error || (rows[0].signal ? `${name} 被信号 ${rows[0].signal} 终止`
        : status === 'pending' ? `${name} 尚无退出码`
          : status === 'failed' ? `${name} 退出码 ${describe(rows[0].exitCode)}` : '');
    return { name, rows, status, details };
  });
  const invalidJobs = verificationSource.data && (!Array.isArray(verificationSource.data.jobs)
    || verificationJobs.length !== rawJobs.length
    || verificationJobs.some((job) => typeof job.name !== 'string' || !job.name
      || typeof job.command !== 'string' || !job.command));
  const verificationStatus = combine([
    verificationSource.status, verificationSource.data?.completed === true ? 'passed' : 'pending',
    ...commandResults.map((command) => command.status), ...verificationJobs.map(jobStatus),
    ...(verificationSource.data?.error || invalidJobs ? ['failed'] : []),
  ]);
  const integration = integrationSource.data, bundle = bundleSource.data, audio = audioSource.data;
  const lessons = list(bundle?.lessons).filter(isObject).sort((a, b) => order(String(a.id), String(b.id)));
  const steps = bundle && Array.isArray(bundle.lessons) ? lessons.reduce((sum, lesson) => sum + list(lesson.steps).length, 0) : null;
  const routes = list(bundle?.routes), stages = routes.flatMap((route) => list(route?.stages));
  const bundleProblems = [];
  if (bundle && bundle.manifest?.id !== 'sprout.core') bundleProblems.push('正式包 id 不是 sprout.core');
  if (bundle && (!Array.isArray(bundle.lessons) || lessons.length !== bundle.lessons.length)) bundleProblems.push('正式包 lessons 结构无效');
  if (bundle && !Array.isArray(bundle.routes)) bundleProblems.push('正式包 routes 结构无效');
  if (bundle && lessons.length !== 96) bundleProblems.push(`正式包实际 ${lessons.length} 节，T9 目标为 96 节；不补造课程行`);
  if (lessons.some((lesson) => typeof lesson.id !== 'string' || !lesson.id || !Array.isArray(lesson.steps) || !lesson.steps.length)) bundleProblems.push('正式课程 id/steps 无效');
  if (lessons.some((lesson) => list(lesson.steps).some((step) => !isObject(step) || typeof step.type !== 'string'))) bundleProblems.push('正式课程活动步骤结构无效');
  if (new Set(lessons.map((lesson) => lesson.id)).size !== lessons.length) bundleProblems.push('正式包有重复课程 id');
  const bundleResult = result(bundleProblems.length ? 'failed' : bundleSource.status,
    bundleProblems.join('；') || bundleSource.issue || `sprout.core，${lessons.length} 节，${steps} 步`);
  const checks = list(integration?.checks).filter(isObject);
  const names = unique([...expectedChecks, ...checks.map((row) => row.name).filter((name) => typeof name === 'string')]);
  const checklist = names.map((name) => ({ name, ...checkResult(checks.filter((row) => row.name === name)) }));
  const records = list(integration?.lessons), groups = new Map(), evidenceProblems = [];
  const ids = new Set(lessons.map((lesson) => lesson.id));
  if (integration && (!Array.isArray(integration.checks) || !Array.isArray(integration.lessons))) evidenceProblems.push('集成 JSON 的 checks/lessons 结构无效');
  if (Array.isArray(integration?.checks) && (checks.length !== integration.checks.length
    || checks.some((row) => typeof row.name !== 'string' || !row.name))) evidenceProblems.push('集成 JSON 含无效 checks 记录');
  for (const [index, row] of records.entries()) {
    if (!isObject(row) || !ids.has(row.id) || !viewports.includes(row.viewport)) {
      evidenceProblems.push(`逐课第 ${index + 1} 条记录不属于正式课程/指定视口：${describe(row)}`);
      continue;
    }
    const key = `${row.id}/${row.viewport}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  const lessonResults = lessons.map((lesson) => {
    const views = viewports.map((viewport) => inspectLesson(lesson, groups.get(`${lesson.id}/${viewport}`) ?? [], integration?.formalBundle));
    return { lesson, views, status: combine(views.map((view) => view.status)) };
  });
  const lessonStatus = combine([bundleResult.status, ...lessonResults.map((row) => row.status),
    ...(evidenceProblems.length ? ['failed'] : [])]);
  const totals = (rows) => Object.fromEntries(Object.keys(labels).map((status) => [status, rows.filter((row) => row.status === status).length]));
  const lessonTotals = totals(lessonResults), checkTotals = totals(checklist);
  const rootTests = parseTests(testsSource, true, rootTestScopes), pipelineTests = parseTests(pipelineSource, false, ['.']);
  const strict = parseStrict(strictSource), build = parseBuild(buildSource);
  for (const [name, parsed] of [['tests', rootTests], ['pipeline-tests', pipelineTests], ['strict-validate', strict], ['build', build]]) {
    const command = commandResults.find((item) => item.name === name);
    parsed.status = combine([parsed.status, command.status]);
    if (command.details) parsed.details = [parsed.details, command.details].filter(Boolean).join('；');
  }
  strict.zeroIssues = strict.zeroIssues && strict.status === 'passed';
  const audioResult = inspectAudio(audioSource, lessons);
  const bundleHash = createHash('sha256').update(bundleSource.text).digest('hex');
  const formalUse = bundleSource.status !== 'passed' ? result(bundleSource.status, bundleSource.issue)
    : integration?.formalBundle === true && integration.bundleSha256 === bundleHash
    ? result('passed', '使用正式 bundle，SHA-256 与当前源文件一致')
    : integration?.formalBundle === true && integration.bundleSha256
      ? result('failed', '验收 bundle 哈希与当前源文件不一致')
      : integration?.formalBundle === true ? result('pending', '缺少验收 bundle 哈希')
    : integration?.formalBundle === false ? result('failed', '集成 JSON 明确未使用正式 bundle')
      : result('pending', '集成 JSON 未确认使用正式 bundle');
  const cleanup = integration?.resourcesClosed === true ? result('passed', '集成 JSON 记录 resourcesClosed=true')
    : result('pending', '尚无 resourcesClosed=true，运行可能未结束');
  const recordedStatus = combine([
    integrationSource.status, bundleResult.status, audioResult.status, rootTests.status, pipelineTests.status,
    strict.status, build.status, lessonStatus, formalUse.status, cleanup.status, verificationStatus, ...checklist.map((row) => row.status),
    ...(integration?.error ? ['failed'] : []),
  ]);
  const coveragePercent = integer(audio?.present) && integer(audio?.required) && audio.required > 0
    ? `${(audio.present / audio.required * 100).toFixed(1)}%` : '不可确认';
  const validDates = sources.map((source) => source.modifiedAt).filter(Boolean).sort();
  const detailCheck = (name) => {
    const rows = checks.filter((row) => row.name === name);
    return rows.length === 1 && isObject(rows[0].details) ? rows[0] : null;
  };
  const pluginCheck = detailCheck(expectedChecks[7]), packCheck = detailCheck(expectedChecks[8]);
  const integrationDetails = [];
  if (pluginCheck) {
    const details = pluginCheck.details;
    integrationDetails.push(`- 插件检查：${labels[checkResult([pluginCheck]).status]}；实际 details：${cell(details)}。`);
    if (typeof details.customLesson === 'string' && details.activity === 'example.hello-stars') {
      integrationDetails.push(`- 上述检查对应 \`scripts/qa-integration.mjs\` 的链路：后台上传插件 ZIP 并确认信任；使用 admin token 经 \`POST /api/lessons\` 创建 \`${cell(details.customLesson)}\`，再在播放端预览并推进 \`${cell(details.activity)}\`。自定义课创建走管理端 API，不是后台编辑器表单验收。`);
    }
  } else integrationDetails.push('- 插件安装、自定义插件课与预览缺少完整 details；不宣称链路已通过。');
  if (packCheck) {
    integrationDetails.push(`- 内容包检查：${labels[checkResult([packCheck]).status]}；实际 details：${cell(packCheck.details)}。同版本覆盖只在 \`sameVersion=true\` 的实际检查记录中成立，核心课数与 hello-pack 课数按 details 展示。`);
  } else integrationDetails.push('- sprout.core 导出、同版本覆盖与 hello-pack 导入缺少完整 details；不宣称已成功。');
  const issues = [
    ...sources.filter((source) => source.issue).map((source) => `${source.relative}：${source.issue}`),
    ...bundleProblems, ...evidenceProblems,
    ...checklist.filter((row) => row.status !== 'passed').map((row) => `${row.name}：${labels[row.status]}；${row.details}`),
    ...(integration?.error ? [`集成运行错误：${describe(integration.error)}`] : []),
    ...(audioResult.status !== 'passed' ? [`音频覆盖：${labels[audioResult.status]}；${audioResult.details}`] : []),
    ...(rootTests.status !== 'passed' ? [`根工作区测试：${labels[rootTests.status]}；${rootTests.details}`] : []),
    ...(pipelineTests.status !== 'passed' ? [`内容流水线测试：${labels[pipelineTests.status]}；${pipelineTests.details}`] : []),
    ...(strict.status !== 'passed' ? [`严格内容校验：${labels[strict.status]}；${strict.details}`] : []),
    ...(build.status !== 'passed' ? [`正式构建：${labels[build.status]}；${build.details}`] : []),
    ...(lessonStatus !== 'passed' ? [`双视口巡检：${labels[lessonStatus]}；课程 ${lessonTotals.failed} 失败、${lessonTotals.pending} 待验收，具体问题见逐课表`] : []),
    ...(formalUse.status !== 'passed' ? [`正式包使用：${labels[formalUse.status]}；${formalUse.details}`] : []),
    ...(cleanup.status !== 'passed' ? [`集成资源关闭：${labels[cleanup.status]}；${cleanup.details}`] : []),
    ...(verificationStatus !== 'passed' ? [`串行验证命令：${labels[verificationStatus]}；${[
      verificationSource.issue, verificationSource.data?.error,
      invalidJobs ? 'jobs 结构无效' : '', ...commandResults.map((command) => command.details),
      verificationSource.data?.completed !== true ? '未记录 completed=true' : '',
    ].filter(Boolean).map(describe).join('；')}`] : []),
    ...build.errors,
  ];
  const logRows = [
    ['根工作区 Vitest', rootTests.vitestStatus, rootTests.vitest, rootTests.files, testsSource.relative],
    ['根工作区 Node TAP（示例插件）', rootTests.tapStatus, rootTests.tap, null, testsSource.relative],
    ['内容流水线 Vitest', pipelineTests.vitestStatus, pipelineTests.vitest, pipelineTests.files, pipelineSource.relative],
  ].map(([name, status, stats, files, source]) => [
    name, count(stats?.total), count(stats?.passed), count(stats?.failed),
    stats ? `${count(stats.skipped)} / ${count(stats.todo)}` : '未知',
    files ? count(files.total) : '不适用', labels[status], source,
  ]);
  const decision = strict.zeroIssues
    ? ['内容 warning 决策清单：空。严格日志明确记录 sprout.core 错误 0、警告 0，且未检测到告警明细或命令错误。']
    : [
      '内容决策清单不能标为空；以下仅转录真实严格校验日志，不改写课程源文件。',
      ...strict.issues.map((issue) => `- ${issue.level}（strict-validate.log 第 ${issue.line} 行）：${cell(issue.text)}`),
      ...strict.errors.map((error) => `- 严格校验命令错误：${cell(error)}`),
      ...strict.summaries.filter((summary) => summary.errors !== 0 || summary.warnings !== 0)
        .map((summary) => `- 严格汇总：错误 ${count(summary.errors)}，警告 ${count(summary.warnings)}；未打印的明细需父任务补充，不能推断已处理。`),
      ...(!strict.issues.length && !strict.errors.length && !strict.summaries.some((summary) => summary.errors !== 0 || summary.warnings !== 0)
        ? [`- 待确认：${cell(strict.details || strictSource.issue || '缺少带 --strict 的完整、可解析的 sprout.core 零错误/零警告证据。')}`] : []),
    ];
  const shellRoot = `'${root.replace(/'/g, "'\\''")}'`;
  const report = [
    '# 芽芽成长 Sprout T9 集成验收报告',
    '',
    `- 最新报告生成时间：${dateText(new Date())}（Asia/Seoul）。`,
    `- 集成验收日期：${cell(integration?.date || '未知')}；正式 bundle 构建时间：${cell(bundle?.builtAt || '未知')}。`,
    `- 验收 bundle SHA-256：${cell(integration?.bundleSha256 || '缺失')}。`,
    `- Headless Chrome：${cell(integration?.browserVersion || '未知')}。`,
    `- 最新输入文件修改时间：${validDates.length ? dateText(validDates.at(-1)) : '未知'}（Asia/Seoul）。修改时间不等同于测试执行时间。`,
    `- 当前已纳入证据的结论：**${labels[recordedStatus]}**。流程检查 ${checkTotals.passed} 通过 / ${checkTotals.failed} 失败 / ${checkTotals.pending} 待验收；正式课程 ${lessonTotals.passed} 通过 / ${lessonTotals.failed} 失败 / ${lessonTotals.pending} 待验收。`,
    '',
    '报告在运行时读取结构化 JSON 和日志，不运行测试、构建、浏览器或服务。缺失、未结束、重复或不完整记录不会被算作通过；技术修复说明不是测试结果。以下结论不涵盖 T8 原生验收。',
    '',
    '## 正式内容与音频实际数量',
    '',
    table(['项目', '实际记录'], [
      ['正式包', bundle ? `${bundle.manifest?.id ?? '未知'} @ ${bundle.manifest?.version ?? '未知'}` : '未知'],
      ['正式包课程 / 步骤', `${bundle && Array.isArray(bundle.lessons) ? bundle.lessons.length : '未知'} / ${count(steps)}（T9 目标 96 节）`],
      ['家长课 / 共看课', bundle && Array.isArray(bundle.lessons)
        ? `${lessons.filter((lesson) => lesson.audience === 'parent').length} / ${lessons.filter((lesson) => (lesson.audience ?? 'child') === 'child').length}` : '未知'],
      ['词条 / 路线 / 阶段 / 主题', bundle
        ? `${Array.isArray(bundle.lexicon?.concepts) ? bundle.lexicon.concepts.length : bundle.lexicon === null ? 0 : '未知'} / ${Array.isArray(bundle.routes) ? routes.length : '未知'} / ${stages.length} / ${stages.reduce((sum, stage) => sum + list(stage?.themes).length, 0)}` : '未知'],
      ['bundle 音频清单条目', isObject(bundle?.audio?.entries) ? Object.keys(bundle.audio.entries).length : '未知'],
      ['音频覆盖产物课程 / 步骤 / 逐步记录', `${count(audio?.lessons)} / ${count(audio?.steps)} / ${Array.isArray(audio?.rows) ? audio.rows.length : '未知'}`],
      ['所需文本 / 已覆盖 / 计数比例', `${count(audio?.required)} / ${count(audio?.present)} / ${coveragePercent}`],
      ['缺失音频 / 未采集文本条目（逐步）', `${Array.isArray(audio?.missing) ? audio.missing.length : '未知'} / ${Array.isArray(audio?.rows) && audio.rows.every((row) => Array.isArray(row?.uncollected)) ? audio.rows.reduce((sum, row) => sum + row.uncollected.length, 0) : '未知'}`],
      ['运行时音频覆盖结论', `${labels[audioResult.status]}；${audioResult.details}`],
    ]),
    '',
    '计数取自本次读取的正式 bundle 和 audio-coverage.json；逐步 required 可能重复同一文本，不能相加替代全包去重所需数。比例只表示产物的数值比，完整通过还要求正式课程逐步证据、missing 与 uncollected 清单一致。生成器不重新生成或播放音频。',
    '',
    '## 验收清单',
    '',
    table(['验收项', '结果', '实际详情 / 问题'], [
      ...checklist.map((row) => [row.name, labels[row.status], row.details]),
      ['正式 bundle 完整性', labels[bundleResult.status], bundleResult.details],
      ['集成使用正式 bundle', labels[formalUse.status], formalUse.details],
      ['逐课运行时音频覆盖', labels[audioResult.status], audioResult.details],
      ['根工作区测试（Vitest + Node TAP）', labels[rootTests.status], rootTests.details || `Vitest 通过 ${count(rootTests.vitest?.passed)}；Node TAP 通过 ${count(rootTests.tap?.passed)}`],
      ['内容流水线测试', labels[pipelineTests.status], pipelineTests.details || `Vitest 通过 ${count(pipelineTests.vitest?.passed)}`],
      ['严格内容校验', labels[strict.status], strict.details],
      ['串行构建与正式包复制', labels[build.status], build.details],
      ['正式课程双视口全量巡检', labels[lessonStatus], `${groups.size}/${lessons.length * viewports.length} 个课程/视口组合有记录；详见逐课表`],
      ['集成资源关闭', labels[cleanup.status], cleanup.details],
      ['串行验证命令退出码', labels[verificationStatus], '见下方命令记录'],
    ]),
    '',
    '缺少的预期流程检查仍保留为待验收行。checks.details 以实际 JSON 展示，passed 必须明确为 true；任何错误或重复检查都不能被后续通过记录掩盖。命令状态由串行验证器记录实际退出码，ZIP 制作结果另见 core-zip.log、hello-zip.log 与 release/ 产物。',
    '',
    table(['命令', '退出码', '状态', '详情'], [
      ...commandResults.flatMap((command) => command.rows.length ? command.rows.map((job) => [
        job.command || command.name, job.exitCode ?? '无退出码', labels[command.status], command.details,
      ]) : [[command.name, '未记录', labels[command.status], command.details]]),
      ...verificationJobs.filter((job) => !requiredJobs.includes(job.name)).map((job) => [
        job.command || job.name, job.exitCode ?? '无退出码', labels[jobStatus(job)], job.error || job.signal || '',
      ]),
    ]),
    '',
    '## 测试日志计数',
    '',
    table(['测试范围', '测试数', '通过', '失败', '跳过 / 待办', '测试文件数', '状态', '来源'], logRows),
    '',
    `根工作区 Vitest 和 Node TAP 分开统计；示例插件 Node TAP 的 # pass 汇总为 ${count(rootTests.tap?.passed)}，不是 Service Worker 单测数。无测试文件的包不贡献测试数；未记录全部预期包、失败或缺少最终汇总的运行不会算作已通过。日志汇总状态不等于命令退出状态；验收清单还要求对应命令明确成功。`,
    '',
    table(['Vitest 范围', '测试文件数', '测试数', '通过数', '汇总状态'], [
      ...rootTests.runs.map((run) => [
        run.name.startsWith(root) ? path.relative(root, run.name) || '.' : run.name,
        run.noTests ? 0 : count(run.files?.total), run.noTests ? 0 : count(run.tests?.total),
        run.noTests ? 0 : count(run.tests?.passed),
        run.files?.failed || run.tests?.failed ? '失败' : run.noTests ? '无测试文件'
          : run.files?.complete && run.tests?.complete ? '已记录完整汇总' : '待验收',
      ]),
    ]),
    '',
    '## 逐课双视口巡检',
    '',
    `课程行来自正式 bundle，按 id 稳定排序；当前 ${lessons.length} 行，目标 96 行。每行合并 1920x1080 与 1024x768，任一失败则整体失败，任一缺失或未完成则整体待验收。`,
    '',
    table(['课程 id', '步骤数', '1920x1080', '1024x768', '整体', '问题'], lessonResults.map((row) => [
      row.lesson.id, count(row.lesson.steps?.length), ...row.views.map((view) => labels[view.status]), labels[row.status],
      row.views.flatMap((view, index) => view.status === 'passed' ? [] : [`${viewports[index]}：${view.details}`]).join('；') || '无（两种视口逐步记录均完整通过）',
    ])),
    '',
    ...(!lessons.length ? ['正式 bundle 缺失或没有有效课程，无法生成 96 个真实课程行；不会虚构 id 或借用夹具。', ''] : []),
    '## 插件与内容包集成',
    '',
    ...integrationDetails,
    '- 家长课、共看课、offlineOnly、配对、学习记录、限时与家长门的实际结果分别见 checks 清单；不以单元测试或修复说明代替集成验收。',
    '',
    '## 截图目录规则',
    '',
    '- `qa-artifacts/lessons/<课程 id>/<1920x1080|1024x768>-step-<从 1 开始的步号>.png`：每个正式课程、每个视口、每一步的截图。',
    '- `qa-artifacts/lessons/<课程 id>/<视口>-failure.png`：失败现场；不能替代缺少的步骤截图或通过记录。',
    '- `qa-artifacts/flow/*.png`：档案、家长暗屏、结束页、学习记录、限时、线下版与插件预览；失败现场为 `admin-failure.png` / `player-failure.png`，弹层诊断为 `admin-failure-dom.json`。',
    '- `qa-artifacts/print/theme-a4.png` / `lesson-a4.png`：A4 宽度视口、print 媒体下的主题和单课打印截图；相关路由为 `/admin/print/theme/s1-t1`、`/admin/print/lesson/core.s3.find-animal`。',
    '- QA 截图与导出包属于本地验收产物，目录按 T9 规则由 `.gitignore` 排除。路径规范不代表文件已经存在；本生成器不巡检截图文件，也不修改忽略规则。',
    '',
    '## 父任务已记录的技术修复',
    '',
    '这些是父任务提供的修复记录，不自动赋予任何检查“通过”状态。',
    '',
    '1. 路线合并：保留 `_stages/s1..s6.json` 源阶段，生成 `sprout.core.route`，按闭区间检查 6–36 月龄连续；s4 每日 child 共看课上限为 1。parent-only 不足额时用本阶段 child 课补齐并标记 `offlineOnly`，仅显示家长导语、phrases 与线下 question/levels，不挂载活动，session 记 parent，不计孩子屏幕时间；后台与播放端首次共看知情提示可关闭并记已读。',
    '2. 朗读声明与采集对齐实际 `speeches(props)`、词库名称/拟声/短句、公共短句及 `cardinalitySpeech`，不递归采集家长导语、guide.say 或绘本家长提问等仅展示文字；song 歌词是旋律/显示内容，不当作 TTS 朗读采集，song 标题与 video 标题按实际朗读采集。',
    '3. 内容包导入允许同 id 同版本的 installed 包覆盖内置包，保留启停状态；仍拒绝版本降级。同版本覆盖的集成成功以实际 checks 为准，不能推断降级路径也做过浏览器验收。',
    "4. 根构建用串行 `--workspace-concurrency=1`，过滤器 `--filter './packages/*' --filter './apps/*'` 必须加引号，避免 shell 展开目录通配符。",
    '5. reduced-motion 的全局 1ms 过渡曾破坏后台弹层 left/top 同步测量；现改为 `animation: none`、`transition: none`，并以 Ant Design `motion` token 响应减少动画偏好。',
    '6. 服务端直接访问含点号课程 id 的打印路由（如 `core.s3.find-animal`）走已知打印路由的 SPA fallback，不把点号误当缺失静态文件扩展名；真正缺失的静态资源仍返回 404。',
    '7. choose、sort、pattern、subitize 依据当前 DOM 焦点处理连续方向键和 OK，避免 React 状态尚未提交时丢键或选中非高亮项；增加快速连续按键、循环、换轮和暂停回归测试。顺序题焦点框与双语提示增加安全间距；纯图片缩放不再误报为文字溢出。',
    '8. 提供项目已有芽芽图标的 favicon，避免首次打开页面的资源 404；显式线下版选择通过路由状态保留，不因后台模式刷新竞态挂载共看活动。',
    '9. 播放端 Vitest 恢复测试文件隔离，仍保持单 worker、文件不并行，防止页面 mock 被后续宿主测试的模块缓存复用。',
    '',
    '## 已知约束与未完成项',
    '',
    '- 浏览器 QA 串行使用单个 headless Google Chrome（Playwright chromium 驱动，可创建多个隔离 context），不是多浏览器兼容验收；context 设置 `serviceWorkers: block`。Service Worker 的独立 Node 单测由串行验证器执行，其退出码不等于真实设备离线验收。',
    '- QA context 用 `page.clock.runFor` / `fastForward` 加速家长暗屏与活动计时，媒体播放速率在 QA 注入脚本中调整；没有缩短或改变生产默认陪玩时长、屏幕上限与活动默认值。',
    '- 1920x1080 与 1024x768 是浏览器视口；方向键、Enter、Escape 模拟遥控器，后台表单也使用浏览器操作/API。并非 Android TV、iPad、iOS/Android 原生真实设备、硬件遥控器或触屏验收。',
    '- T8 所有权目录 `apps/player/android/`、`apps/player/ios/`、`deploy/`、`docs/deploy/` 排除在本报告验收范围外；本 sidecar 只实现报告生成器，未编辑这些目录或任何课程内容源。',
    '- 逐步图像/溢出检测只覆盖脚本指定 DOM 与截图时刻，截图为步骤推进前的现场，不代表全部动画帧、可访问性、听感或真实打印机效果。报告生成器不重新打开页面验证。',
    '- 报告核对正式 bundle 的 SHA-256、课程 id、步骤数和活动类型；这不替代对 JS/CSS 构建变更的追溯，最终验收应在构建稳定后完整执行。',
    '- 本次先完整扫描 96 课双视口，再对修复涉及的全部活动课程回归，最后重跑九项流程。原始结果保存在 `qa-artifacts/initial-full-results.json`，回归日志为 `browser-retest.log`，最终流程日志为 `browser-final-flow.log`；报告使用同一 bundle 哈希下的合并结果。',
    '- `SPROUT_QA_PHASE`、`SPROUT_QA_IDS`、`SPROUT_QA_TYPES` 可限制单次范围；`SPROUT_QA_MERGE=1` 仅允许在前次资源已关闭且 bundle 哈希一致时替换对应真实记录，不能用子集代表未检查课程。',
    '',
    ...(issues.length ? unique(issues).map((issue) => `- ${cell(issue)}`) : ['已纳入证据未记录失败；范围外项目与上述约束仍不代表已验收。']),
    ...(build.warnings.length ? ['', '构建日志告警（与内容 warning 决策分开）：', ...build.warnings.map((warning) => `- ${cell(warning)}`)] : []),
    '',
    '## 需要 Claude 决策（内容）',
    '',
    ...decision,
    '',
    '## 复现命令',
    '',
    '以下供父任务按阶段执行，不是本生成器自动执行的命令。最终集成应取消子集环境变量；报告生成应在结果 JSON 和日志写完之后进行。',
    '',
    '```sh',
    `cd ${shellRoot}`,
    'export pnpm_config_verify_deps_before_run=false',
    'pnpm content:route',
    'pnpm content:all --pack content/packs/sprout-core --prune',
    'pnpm content:validate --pack content/packs/sprout-core --strict',
    'pnpm content:bundle --pack content/packs/sprout-core',
    'pnpm content:zip content/packs/sprout-core --out release/',
    'pnpm content:zip content/examples/hello-pack --out release/',
    'pnpm -r --workspace-concurrency=1 typecheck',
    'pnpm content:typecheck',
    'pnpm -r --workspace-concurrency=1 test',
    'pnpm content:test',
    'pnpm --dir plugins/examples/hello-plugin build',
    'pnpm build',
    "# 根 build 实际展开为：pnpm -r --workspace-concurrency=1 --filter './packages/*' --filter './apps/*' build",
    'unset SPROUT_QA_PHASE SPROUT_QA_IDS',
    'node scripts/qa-integration.mjs',
    'node scripts/qa-verify.mjs',
    'node scripts/qa-report.mjs',
    '```',
    '',
    '单独生成报告只需 `node scripts/qa-report.mjs`，无需 pnpm 或启动服务。所有输入/输出路径都由生成器的 `import.meta.url` 定位仓库根，运行目录不影响读取；报告仅写入 `docs/dev/qa-report.md`。',
    '',
    '## 输入证据',
    '',
    table(['文件', '修改时间（Asia/Seoul）', '读取状态'], sources.map((source) => [
      source.relative, source.modifiedAt ? dateText(source.modifiedAt) : '未知',
      source.issue || (source.data ? 'JSON 可解析' : source.text.trim() ? '日志可读取' : '空日志，仍需验收证据'),
    ])),
    '',
  ].join('\n');
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, report, 'utf8');
  return { path: output, status: recordedStatus };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await generateReport();
    console.log(`已生成 ${report.path}；已纳入证据的结论：${labels[report.status]}`);
  } catch (error) {
    console.error(`QA 报告生成失败：${error.message}`);
    process.exitCode = 1;
  }
}
