import type { ValidationIssue } from '@sprout/schema';

export type JsonSchema = Record<string, unknown>;
export type SchemaKind = 'string' | 'number' | 'boolean' | 'enum' | 'object' | 'array' | 'union' | 'null' | 'json';
export interface SchemaField {
  key: string;
  schema: JsonSchema;
  required: boolean;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function asSchema(value: unknown): JsonSchema {
  return isRecord(value) ? value : {};
}

export function resolveSchema(input: JsonSchema, root: JsonSchema = input, seen = new Set<string>()): JsonSchema {
  let schema = { ...input };
  const ref = schema.$ref;
  if (typeof ref === 'string' && ref.startsWith('#/') && !seen.has(ref)) {
    let target: unknown = root;
    for (const segment of ref.slice(2).split('/')) {
      target = isRecord(target) ? target[segment.replace(/~1/g, '/').replace(/~0/g, '~')] : undefined;
    }
    if (isRecord(target)) {
      const { $ref: _, ...siblings } = schema;
      schema = { ...resolveSchema(target, root, new Set([...seen, ref])), ...siblings };
    }
  }
  if (Array.isArray(schema.allOf)) {
    const { allOf, ...base } = schema;
    schema = allOf.reduce<JsonSchema>((merged, part) => {
      const next = resolveSchema(asSchema(part), root, seen);
      return {
        ...merged,
        ...next,
        properties: { ...asSchema(merged.properties), ...asSchema(next.properties) },
        required: [...new Set([...stringArray(merged.required), ...stringArray(next.required)])],
      };
    }, base);
  }
  return schema;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function schemaBranches(input: JsonSchema, root: JsonSchema = input): JsonSchema[] {
  const schema = resolveSchema(input, root);
  const { anyOf, oneOf, type, default: _, ...common } = schema;
  const branches = Array.isArray(oneOf) ? oneOf : Array.isArray(anyOf) ? anyOf : null;
  if (branches) return branches.map((branch) => resolveSchema({ ...common, ...asSchema(branch) }, root));
  if (Array.isArray(type)) return type.map((item) => ({ ...common, type: item }));
  return [];
}

export function schemaKind(input: JsonSchema, root: JsonSchema = input): SchemaKind {
  const schema = resolveSchema(input, root);
  if (schemaBranches(schema, root).length) return 'union';
  if (Array.isArray(schema.enum) || Object.hasOwn(schema, 'const')) return 'enum';
  if (schema.type === 'integer' || schema.type === 'number') return 'number';
  if (schema.type === 'string' || schema.type === 'boolean' || schema.type === 'null') return schema.type;
  if (schema.type === 'array' || schema.items || schema.prefixItems) return 'array';
  if (schema.type === 'object' || schema.properties || schema.additionalProperties) return 'object';
  return 'json';
}

export function schemaFields(input: JsonSchema, root: JsonSchema = input): SchemaField[] {
  const schema = resolveSchema(input, root);
  const required = new Set(stringArray(schema.required));
  return Object.entries(asSchema(schema.properties)).map(([key, value]) => ({
    key,
    schema: resolveSchema(asSchema(value), root),
    required: required.has(key),
  }));
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function defaultForSchema(input: JsonSchema, root: JsonSchema = input, depth = 0): unknown {
  if (depth > 16) return undefined;
  const schema = resolveSchema(input, root);
  if (Object.hasOwn(schema, 'default')) return cloneJson(schema.default);
  if (Object.hasOwn(schema, 'const')) return cloneJson(schema.const);
  if (Array.isArray(schema.enum)) return cloneJson(schema.enum[0] ?? '');
  const branches = schemaBranches(schema, root);
  if (branches.length) return defaultForSchema(branches[0], root, depth + 1);
  switch (schemaKind(schema, root)) {
    case 'object': {
      const result: Record<string, unknown> = {};
      for (const field of schemaFields(schema, root)) {
        if (field.required || Object.hasOwn(field.schema, 'default')) {
          result[field.key] = defaultForSchema(field.schema, root, depth + 1);
        }
      }
      return result;
    }
    case 'array': {
      if (Array.isArray(schema.prefixItems)) {
        return schema.prefixItems.map((item) => defaultForSchema(asSchema(item), root, depth + 1));
      }
      const length = typeof schema.minItems === 'number' ? Math.min(schema.minItems, 100) : 0;
      return Array.from({ length }, () => defaultForSchema(asSchema(schema.items), root, depth + 1));
    }
    case 'boolean': return false;
    case 'number': {
      const lower = typeof schema.minimum === 'number' ? schema.minimum : 0;
      const upper = typeof schema.maximum === 'number' ? schema.maximum : Infinity;
      return Math.min(upper, Math.max(0, lower));
    }
    case 'null': return null;
    case 'json': return {};
    default: return '';
  }
}

export function matchesBranch(input: JsonSchema, value: unknown, root: JsonSchema = input): boolean {
  const schema = resolveSchema(input, root);
  if (Object.hasOwn(schema, 'const')) return schema.const === value;
  if (Array.isArray(schema.enum)) return schema.enum.includes(value);
  const branches = schemaBranches(schema, root);
  if (branches.length) return branches.some((branch) => matchesBranch(branch, value, root));
  switch (schemaKind(schema, root)) {
    case 'string': return typeof value === 'string';
    case 'number': return typeof value === 'number';
    case 'boolean': return typeof value === 'boolean';
    case 'null': return value === null;
    case 'array': return Array.isArray(value);
    case 'object': {
      if (!isRecord(value)) return false;
      return schemaFields(schema, root).every((field) =>
        !field.required || (Object.hasOwn(value, field.key) && matchesBranch(field.schema, value[field.key], root)),
      );
    }
    default: return true;
  }
}

export function branchForValue(branches: JsonSchema[], value: unknown, root: JsonSchema): number {
  let index = branches.findIndex((branch) => matchesBranch(branch, value, root));
  if (index < 0 && isRecord(value)) index = branches.findIndex((branch) => schemaKind(branch, root) === 'object');
  return Math.max(0, index);
}

export function isConceptUnion(input: JsonSchema, root: JsonSchema = input): boolean {
  const branches = schemaBranches(input, root);
  return branches.some((branch) => branch.type === 'string')
    && branches.some((branch) => {
      const props = asSchema(branch.properties);
      return !!props.zh && !!props.image;
    });
}

export function fieldWidget(input: JsonSchema, path: string, activityType?: string): 'concept' | 'image' | 'media' | 'color' | undefined {
  if (input.format === 'concept' || input['x-widget'] === 'concept') return 'concept';
  const key = path.split('.').at(-1) ?? '';
  if (key === 'concept' || key === 'item' || key === 'conceptId') return 'concept';
  if ((activityType === 'pattern' || activityType === 'choose') && /(?:options|sequence)\.\d+$/.test(path)) return 'concept';
  if (['image', 'poster', 'imageUrl'].includes(key) || input.format === 'image') return 'image';
  if (key === 'src') return 'media';
  if (['color', 'tint', 'bg'].includes(key)) return 'color';
  return undefined;
}

export function reorder<T>(items: readonly T[], from: number, to: number): T[] {
  const result = [...items];
  if (from < 0 || from >= result.length || to < 0 || to >= result.length || from === to) return result;
  result.splice(to, 0, result.splice(from, 1)[0]);
  return result;
}

export function normalizeIssuePath(path: string): string {
  return path.replace(/^#?\//, '').replace(/\//g, '.').replace(/\[(\d+)\]/g, '.$1')
    .replace(/^lesson\./, '').replace(/^concepts\.0\./, '').replace(/\.+$/, '');
}

export function issuesAt(issues: ValidationIssue[], path: string): ValidationIssue[] {
  return issues.filter((issue) => normalizeIssuePath(issue.path) === path);
}

export function issueMessage(message: string): string {
  if (/^Invalid input: expected/.test(message)) {
    const expected = /expected (\w+)/.exec(message)?.[1];
    const names: Record<string, string> = { string: '文字', number: '数值', int: '整数', boolean: '开关值', array: '列表', object: '对象' };
    return `请填写有效的${names[expected ?? ''] ?? '内容'}`;
  }
  if (/^Too small:/.test(message)) {
    const minimum = /(?:>=|>)(\d+)/.exec(message)?.[1];
    if (message.includes('string')) return minimum === '1' ? '此项不能为空' : `至少填写 ${minimum ?? 1} 个字符`;
    if (message.includes('array')) return `至少添加 ${minimum ?? 1} 项`;
    return `数值不能小于 ${minimum ?? '规定下限'}`;
  }
  if (/^Too big:/.test(message)) {
    const maximum = /(?:<=|<)(\d+)/.exec(message)?.[1];
    if (message.includes('string')) return `最多填写 ${maximum ?? '规定数量的'} 个字符`;
    if (message.includes('array')) return `最多添加 ${maximum ?? '规定数量的'} 项`;
    return `数值不能大于 ${maximum ?? '规定上限'}`;
  }
  if (/^Invalid (option|value)/.test(message)) return '请选择有效的选项';
  if (message === 'Invalid input') return '请检查所选类型及其必填字段';
  if (/^Invalid (URL|url)/.test(message)) return '请填写完整有效的网址';
  if (/^Invalid string:/.test(message)) return '文字格式不正确';
  return message;
}

export function parsePropsJson(text: string, path = ''): { value?: Record<string, unknown>; issues: ValidationIssue[] } {
  try {
    const value: unknown = JSON.parse(text);
    if (!isRecord(value)) {
      return { issues: [{ path, message: '活动参数必须是 JSON 对象，不能是数组、文字或 null', level: 'error' }] };
    }
    return { value, issues: [] };
  } catch (error) {
    return { issues: [{ path, message: `JSON 格式错误：${error instanceof Error ? error.message : '请检查语法'}`, level: 'error' }] };
  }
}

function isEmptyDraft(value: unknown): boolean {
  if (value === undefined || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (isRecord(value)) return Object.values(value).every(isEmptyDraft);
  return false;
}

export function normalizeOptionalValues(value: unknown, input: JsonSchema, root: JsonSchema = input): unknown {
  const schema = resolveSchema(input, root);
  const branches = schemaBranches(schema, root);
  if (branches.length) return normalizeOptionalValues(value, branches[branchForValue(branches, value, root)], root);
  if (isRecord(value) && schemaKind(schema, root) === 'object') {
    const result = { ...value };
    for (const field of schemaFields(schema, root)) {
      const normalized = normalizeOptionalValues(value[field.key], field.schema, root);
      if (!field.required && isEmptyDraft(normalized)) delete result[field.key];
      else if (normalized !== undefined) result[field.key] = normalized;
    }
    return result;
  }
  if (Array.isArray(value) && schemaKind(schema, root) === 'array') {
    const tuple = Array.isArray(schema.prefixItems) ? schema.prefixItems : undefined;
    return value.map((item, index) => normalizeOptionalValues(item, asSchema(tuple?.[index] ?? schema.items), root));
  }
  return value;
}

export const FIELD_LABELS: Record<string, string> = {
  schemaVersion: '格式版本', id: '标识符', title: '标题', summary: '简介', zh: '中文', en: '英文',
  pinyin: '拼音', ageRange: '适用月龄', domains: '学习领域（首项为主领域）', themeId: '主题',
  tags: '标签', durationMin: '屏幕时长（分钟）', coView: '家长陪同', objectives: '学习目标',
  cover: '封面', concept: '词条', image: '图片', bg: '背景', parentGuide: '家长指南',
  intro: '导语', tips: '陪伴技巧', phrases: '家长短语', why: '理念依据', refs: '参考文献编号',
  offline: '线下延伸活动', minutes: '时长（分钟）', materials: '所需材料', steps: '步骤',
  safety: '安全提示', type: '活动类型', parentTip: '本步家长提示', props: '活动参数',
  category: '类别', measure: '中文量词', plural: '英文复数', sound: '拟声与特征短语',
  phrase: '一句话描述', color: '颜色', value: '数值', items: '词条列表', item: '词条',
  show: '显示内容', text: '文字', english: '英文', speak: '朗读内容', autoAdvanceSec: '自动翻页间隔（秒）',
  patterns: '图案', palette: '配色', motion: '动作', secondsPerPattern: '每张停留（秒）',
  narration: '旁白', hideSec: '隐藏时间（秒）', ask: '提问', reveal: '揭晓', pops: '泡泡数量',
  sayName: '朗读名称', speed: '速度', rounds: '轮次', count: '数量', layout: '排列',
  showNumeral: '显示数字', cardinality: '强调总数', mode: '模式', arrangement: '摆放方式',
  showSec: '展示时间（秒）', choices: '显示选项', prompt: '提问', options: '选项', answer: '答案',
  explain: '解释', showLabels: '显示标签', hintAfter: '提示前尝试次数', bins: '分类篮子',
  bin: '所属篮子', label: '标签', scale: '缩放比例', tint: '着色', caption: '说明', say: '朗读',
  sequence: '规律序列', pages: '页面', scene: '场景', narrate: '自动朗读', prompts: '阅读提问',
  kind: '提问类型', ground: '地面', sprites: '场景元素', x: '横坐标（%）', y: '纵坐标（%）',
  size: '尺寸（%）', flip: '水平翻转', anim: '缓慢动画', delay: '延迟（秒）', z: '层级',
  credit: '署名', bpm: '节拍 / 分钟', instrument: '乐器', lines: '歌词', lang: '语言',
  notes: '音符', repeat: '重复次数', actions: '配套动作', moves: '动作列表', name: '名称',
  seconds: '持续时间（秒）', visual: '画面', cycles: '呼吸次数', inhaleSec: '吸气（秒）',
  exhaleSec: '呼气（秒）', src: '媒体文件', poster: '封面图片', captions: '字幕',
  maxSec: '最长时间（秒）', url: '网页地址', allowFullscreen: '允许全屏',
  audience: '课程对象', printables: '可打印材料', question: '开放式提问', levels: '玩法难度',
  easier: '更简单的玩法', harder: '更有挑战的玩法', goal: '陪玩目标', playMin: '屏幕外陪玩时长（分钟）',
  observe: '观察要点',
};

export function fieldLabel(key: string, schema: JsonSchema = {}): string {
  return typeof schema.title === 'string' ? schema.title : FIELD_LABELS[key] ?? key;
}

export const ENUM_LABELS: Record<string, string> = {
  parent: '家长指引课', child: '亲子共看课',
  required: '必须陪同', recommended: '建议陪同', optional: '可选陪同', zh: '中文', en: '英文',
  true: '是', false: '否', none: '无', name: '名称', 'name+sound': '名称和拟声',
  'name+phrase': '名称和短句', bw: '黑白', bwr: '黑白红', drift: '缓慢漂移',
  pulse: '缓慢缩放', rotate: '缓慢旋转', hands: '双手', curtain: '窗帘', box: '盒子',
  leaf: '叶子', cloud: '云朵', slow: '缓慢', normal: '正常', row: '一排',
  scatter: '散放', dice: '骰子排列', 'ten-frame': '十格框', guided: '手动引导',
  auto: '自动', line: '直线', random: '随机', show: '依次展示', order: '排顺序',
  completion: '填空', recall: '回忆', open: '开放提问', wh: '谁 / 什么 / 哪里',
  distancing: '联系生活', point: '指一指', grass: '草地', sand: '沙地', water: '水面',
  floor: '地板', snow: '雪地', bob: '上下浮动', sway: '轻轻摇摆', hop: '轻轻跳动',
  float: '漂浮', 'spin-slow': '慢速旋转', musicbox: '八音盒', marimba: '马林巴',
  flute: '长笛', piano: '钢琴', balloon: '气球', star: '星星', flower: '花朵',
  moon: '月亮', bullseye: '同心圆', stripes: '条纹', checker: '棋盘格', dots: '圆点',
  face: '笑脸', spiral: '螺旋', zigzag: '折线', circle: '圆形', square: '正方形',
  triangle: '三角形', heart: '爱心',
};
