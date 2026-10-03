import {
  ActivityStep,
  BUILTIN_ACTIVITY_PROPS,
  Concept,
  COUNT_RANGE,
  PHRASES,
  cardinalitySpeech,
  numberToEn,
  numberToZh,
  speechKey,
  validateLesson,
  type BuiltinActivityType,
  type ConceptRef,
  type InlineConcept,
  type Lexicon,
  type Speech,
} from '@sprout/schema';

export interface SpeechEntry {
  key: string;
  lang: 'zh' | 'en';
  text: string;
}

type BuiltinStep = {
  [T in BuiltinActivityType]: {
    type: T;
    props: ReturnType<(typeof BUILTIN_ACTIVITY_PROPS)[T]['parse']>;
  };
}[BuiltinActivityType];

/** 只收集实际朗读字段；本包词库全量生成，fallback 仅用于解析课程引用。 */
export function collectSpeech(input: {
  lexicon?: Lexicon | null;
  lessons?: readonly unknown[];
  fallbackConcepts?: readonly Concept[];
  includeCommon?: boolean;
}): SpeechEntry[] {
  const entries = new Map<string, SpeechEntry>();
  const concepts = new Map<string, Concept>();

  function add(speech: Speech | undefined): void {
    for (const lang of ['zh', 'en'] as const) {
      const text = speech?.[lang];
      if (typeof text !== 'string') continue;
      const key = speechKey(lang, text);
      const normalized = key.slice(lang.length + 1);
      if (normalized) entries.set(key, { key, lang, text: normalized });
    }
  }

  function resolve(ref: ConceptRef | undefined): Concept | InlineConcept | undefined {
    return typeof ref === 'string' ? concepts.get(ref) : ref;
  }

  function addNumbers(count: number): void {
    for (let n = COUNT_RANGE.min; n <= count; n += 1) {
      add({ zh: numberToZh(n), en: numberToEn(n) });
    }
  }

  for (const candidate of Array.isArray(input.fallbackConcepts) ? input.fallbackConcepts : []) {
    const parsed = Concept.safeParse(candidate);
    if (parsed.success) concepts.set(parsed.data.id, parsed.data);
  }

  for (const candidate of Array.isArray(input.lexicon?.concepts) ? input.lexicon.concepts : []) {
    const parsed = Concept.safeParse(candidate);
    if (!parsed.success) continue;
    const concept = parsed.data;
    concepts.set(concept.id, concept);
    add(concept);
    add(concept.sound);
    add(concept.phrase);
  }

  if (input.includeCommon ?? true) {
    Object.values(PHRASES).forEach(add);
    addNumbers(COUNT_RANGE.max);
  }

  function collectStep({ type, props }: BuiltinStep): void {
    switch (type) {
      case 'contrast':
        add(props.narration);
        break;
      case 'word-cards':
        add(props.intro);
        if (props.speak === 'none') break;
        for (const ref of props.items) {
          const concept = resolve(ref);
          add(concept);
          if (props.speak === 'name+sound') add(concept?.sound);
          if (props.speak === 'name+phrase') add(concept?.phrase);
        }
        break;
      case 'peekaboo':
        add(props.ask);
        add(props.reveal);
        props.items.forEach((ref) => add(resolve(ref)));
        break;
      case 'bubbles':
        if (props.sayName) props.items.forEach((ref) => add(resolve(ref)));
        break;
      case 'count':
        for (const round of props.rounds) {
          addNumbers(round.count);
          const concept = resolve(round.item);
          if (props.cardinality && concept) add(cardinalitySpeech(round.count, concept));
        }
        break;
      case 'subitize':
        for (const round of props.rounds) {
          addNumbers(round.count);
          const concept = resolve(round.item);
          // 默认圆点没有词条，只唱数，不凭空生成“几个圆点”等数量短句。
          if (concept) add(cardinalitySpeech(round.count, concept));
        }
        break;
      case 'choose':
        for (const round of props.rounds) {
          add(round.prompt);
          add(round.explain);
          for (const option of round.options) {
            add(typeof option === 'string' ? resolve(option) : resolve(option.concept) ?? option.label);
          }
        }
        break;
      case 'sort':
        add(props.prompt);
        props.items.forEach(({ item }) => add(resolve(item)));
        props.bins.forEach(({ label }) => add(label));
        break;
      case 'sequence':
        add(props.intro);
        props.steps.forEach((step) => add(step.say ?? step.caption));
        break;
      case 'pattern':
        add(props.intro ?? PHRASES.whatsNext);
        for (const round of props.rounds) {
          round.sequence.forEach((ref) => add(resolve(ref)));
          // 答案填入空位后也会随完整序列朗读，干扰选项不读。
          add(resolve(round.answer));
        }
        break;
      case 'story':
        add(props.title);
        props.pages.forEach((page) => {
          if (page.narrate) add(page.text);
        });
        break;
      case 'song':
        add(props.title);
        break;
      case 'movement':
        add(props.intro);
        props.moves.forEach((move) => {
          add(move.name);
          add(move.say);
        });
        break;
      case 'calm':
        add(props.say ?? PHRASES.breatheIntro);
        break;
      case 'video':
        add(props.title);
        break;
      case 'web':
      case 'guide':
        break;
    }
  }

  for (const candidate of Array.isArray(input.lessons) ? input.lessons : []) {
    if (!candidate || typeof candidate !== 'object' || !('steps' in candidate)) continue;
    if (!Array.isArray(candidate.steps)) continue;

    // 单个损坏/未知步骤不影响其他步骤，也不把原型属性误当作内置 schema。
    const steps = candidate.steps.flatMap((step: unknown) => {
      const parsed = ActivityStep.safeParse(step);
      return parsed.success && Object.hasOwn(BUILTIN_ACTIVITY_PROPS, parsed.data.type)
        ? [parsed.data]
        : [];
    });
    // 不启用引用校验：缺失词条时仍保留 prompt 等可朗读文本，由内容校验器报告引用问题。
    const { lesson, issues } = validateLesson({ ...candidate, steps });
    if (!lesson) continue;
    if (issues.some((issue) => issue.level === 'error' && !/^steps\.\d+(?:\.|$)/.test(issue.path))) continue;
    const invalidSteps = new Set(
      issues
        .filter((issue) => issue.level === 'error' && /^steps\.\d+(?:\.|$)/.test(issue.path))
        .map((issue) => Number(issue.path.split('.')[1])),
    );
    lesson.steps.forEach((step, index) => {
      if (lesson.audience === 'parent' && step.type !== 'song') return;
      if (!invalidSteps.has(index)) collectStep(step as BuiltinStep);
    });
  }

  // 不使用 localeCompare，避免不同系统的地区排序规则改变 manifest 顺序。
  return [...entries.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
