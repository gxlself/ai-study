import { describe, expect, it } from 'vitest';
import { activityPropsJsonSchema, Concept, Lesson } from '@sprout/schema';
import {
  asSchema, branchForValue, defaultForSchema, fieldWidget, isConceptUnion, normalizeIssuePath,
  normalizeOptionalValues, parsePropsJson, reorder, resolveSchema, schemaBranches, schemaFields, schemaKind,
} from './schema';
import { CONTRACT_SCHEMAS } from './model';

describe('JSON Schema 字段映射', () => {
  it.each([
    [{ type: 'string' }, 'string'],
    [{ type: 'integer' }, 'number'],
    [{ type: 'number' }, 'number'],
    [{ type: 'boolean' }, 'boolean'],
    [{ enum: ['a', 'b'] }, 'enum'],
    [{ const: 1 }, 'enum'],
    [{ type: 'array', items: { type: 'string' } }, 'array'],
    [{ type: 'object', properties: { zh: { type: 'string' } } }, 'object'],
    [{ anyOf: [{ type: 'string' }, { type: 'object' }] }, 'union'],
    [{ type: ['number', 'null'] }, 'union'],
    [{ type: 'null' }, 'null'],
    [{}, 'json'],
  ])('%j 映射为 %s', (schema, kind) => {
    expect(schemaKind(schema)).toBe(kind);
  });

  it('读取服务端契约的必填项、默认值及 nullable', () => {
    const schema = activityPropsJsonSchema('word-cards');
    const fields = schemaFields(schema);
    expect(fields.find((field) => field.key === 'items')?.required).toBe(true);
    expect(fields.find((field) => field.key === 'intro')?.required).toBe(false);
    const defaults = asSchema(defaultForSchema(schema));
    expect(defaults).toMatchObject({
      items: [''], show: { text: true, english: true, pinyin: false }, speak: 'name', autoAdvanceSec: null,
    });
    expect(defaults).not.toHaveProperty('intro');
    const nullable = fields.find((field) => field.key === 'autoAdvanceSec')!.schema;
    const branches = schemaBranches(nullable);
    expect(branchForValue(branches, null, schema)).toBe(1);
    expect(branchForValue(branches, 8, schema)).toBe(0);
    expect(defaultForSchema(branches[0], schema)).toBe(4);
  });

  it('正确处理 union(string|object) 与内联词条', () => {
    const props = asSchema(activityPropsJsonSchema('word-cards').properties);
    const item = asSchema(asSchema(props.items).items);
    const branches = schemaBranches(item);
    expect(isConceptUnion(item)).toBe(true);
    expect(branchForValue(branches, 'apple', item)).toBe(0);
    expect(branchForValue(branches, { zh: '奶奶', image: 'assets/photo.png' }, item)).toBe(1);
    expect(branchForValue(branches, {}, item)).toBe(1);
    expect(defaultForSchema(branches[1])).toEqual({ zh: '', image: '' });
  });

  it('不会让父级 null 默认值覆盖数字分支', () => {
    const schema = { default: null, type: ['integer', 'null'], minimum: 4 };
    expect(defaultForSchema(schema)).toBe(null);
    expect(defaultForSchema(schemaBranches(schema)[0])).toBe(4);
  });

  it('解析本地 $ref、JSON pointer 转义和 allOf 对象', () => {
    const root = {
      $defs: { 'word/type': { type: 'string', minLength: 1 } },
      type: 'object',
      allOf: [
        { properties: { zh: { $ref: '#/$defs/word~1type' } }, required: ['zh'] },
        { properties: { en: { type: 'string' } } },
      ],
    };
    expect(schemaFields(root).map((field) => field.key)).toEqual(['zh', 'en']);
    expect(resolveSchema({ $ref: '#/$defs/word~1type' }, root)).toEqual({ type: 'string', minLength: 1 });
    expect(defaultForSchema(root)).toEqual({ zh: '' });
  });

  it('所有元数据字段都可映射，含 refs、拼音和月龄 tuple', () => {
    expect(schemaFields(CONTRACT_SCHEMAS.lesson).map((field) => field.key)).toEqual([
      'schemaVersion', 'id', 'title', 'summary', 'ageRange', 'domains', 'themeId', 'tags',
      'durationMin', 'coView', 'audience', 'printables', 'objectives', 'cover', 'parentGuide', 'offline', 'steps',
    ]);
    const props = asSchema(CONTRACT_SCHEMAS.lesson.properties);
    expect(defaultForSchema(asSchema(props.ageRange))).toEqual([0, 0]);
    expect(schemaFields(asSchema(props.parentGuide)).map((field) => field.key)).toContain('refs');
    expect(schemaFields(asSchema(props.title)).map((field) => field.key)).toContain('pinyin');
  });

  it('生成彼此独立的动态列表项', () => {
    const value = defaultForSchema({ type: 'array', minItems: 2, items: {
      type: 'object', properties: { value: { type: 'number', default: 4 } },
    } }) as { value: number }[];
    value[0].value = 9;
    expect(value[1].value).toBe(4);
  });

  it('词条、图片和颜色控件不会误判文字', () => {
    expect(fieldWidget({ type: 'string' }, 'steps.0.props.rounds.0.options.0', 'choose')).toBe('concept');
    expect(fieldWidget({ type: 'string' }, 'steps.0.props.rounds.0.options.0', 'contrast')).toBeUndefined();
    expect(fieldWidget({ type: 'string' }, 'cover.image')).toBe('image');
    expect(fieldWidget({ type: 'string' }, 'color')).toBe('color');
    expect(fieldWidget({ type: 'string' }, 'title.zh')).toBeUndefined();
  });
});

describe('可选字段与 JSON 持久化', () => {
  it('删除完全空白的可选对象和字符串，保留必填字段错误', () => {
    const raw = {
      title: { zh: '测试课程', en: '', pinyin: '' },
      summary: { zh: '', en: '', pinyin: '' },
      cover: { concept: '', image: '', bg: '' },
      parentGuide: { intro: '', why: '', tips: [], phrases: [], refs: [] },
    };
    const normalized = normalizeOptionalValues(raw, CONTRACT_SCHEMAS.lesson);
    expect(normalized).toEqual({ title: { zh: '测试课程' }, parentGuide: { intro: '' } });
    expect(Lesson.safeParse(normalized).success).toBe(false);
  });

  it('可选对象部分填写但缺少必填项时不丢弃', () => {
    const normalized = normalizeOptionalValues({ summary: { zh: '', en: 'Hello' } }, CONTRACT_SCHEMAS.lesson);
    expect(normalized).toEqual({ summary: { zh: '', en: 'Hello' } });
  });

  it('保留 null、false、0 以及 union 对象中的有效值', () => {
    const schema = activityPropsJsonSchema('word-cards');
    const value = {
      items: ['apple', { zh: '奶奶', en: '', image: 'assets/grandma.jpg', sound: { zh: '', en: '' } }],
      autoAdvanceSec: null,
      show: { text: false, english: false, pinyin: false },
    };
    expect(normalizeOptionalValues(value, schema)).toEqual({
      items: ['apple', { zh: '奶奶', image: 'assets/grandma.jpg' }],
      autoAdvanceSec: null,
      show: { text: false, english: false, pinyin: false },
    });
    expect(normalizeOptionalValues({ value: 0 }, { type: 'object', properties: { value: { type: 'number' } } })).toEqual({ value: 0 });
  });

  it('词条可选短句空对象不提交，数值零可保存', () => {
    const schema = asSchema(asSchema(asSchema(CONTRACT_SCHEMAS.lexicon.properties).concepts).items);
    const raw = { id: 'zero', category: 'numbers', zh: '零', en: 'zero', image: 'assets/zero.svg', sound: { zh: '', en: '' }, phrase: {}, value: 0 };
    expect(Concept.parse(normalizeOptionalValues(raw, schema))).toEqual({
      id: 'zero', category: 'numbers', zh: '零', en: 'zero', image: 'assets/zero.svg', value: 0,
    });
  });

  it('实时 JSON 校验接受对象并拒绝数组、null 和语法错误', () => {
    expect(parsePropsJson('{"n":0,"auto":null,"flag":false}').value).toEqual({ n: 0, auto: null, flag: false });
    for (const text of ['[1]', 'null', '"x"', '{', '{"n":}']) {
      expect(parsePropsJson(text, 'steps.1.props').issues[0]).toMatchObject({ path: 'steps.1.props', level: 'error' });
    }
  });

  it('错误路径统一为可定位字段路径', () => {
    expect(normalizeIssuePath('lesson.steps[2].props.items[0]')).toBe('steps.2.props.items.0');
    expect(normalizeIssuePath('/steps/0/props')).toBe('steps.0.props');
    expect(normalizeIssuePath('concepts.0.color')).toBe('color');
  });

  it('排序保留对象及 JSON 草稿，忽略越界索引', () => {
    const items = [{ key: 'a', json: '{' }, { key: 'b', json: '{}' }];
    expect(reorder(items, 0, 1)).toEqual([items[1], items[0]]);
    expect(reorder(items, -1, 1)).toEqual(items);
    expect(reorder(items, 0, 9)).toEqual(items);
    expect(items.map((item) => item.key)).toEqual(['a', 'b']);
  });
});
