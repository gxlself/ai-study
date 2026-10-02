import type { Speech } from './common';

/**
 * 内置活动固定朗读的话（契约）。
 * - 活动实现（@sprout/activities）朗读这些话时**必须**引用这里的常量，不得自行改写文字；
 * - 音频脚本（scripts/gen-audio）会为全部常量预生成音频。
 * 用语原则：简短、温和、聚焦过程的鼓励；不说"错了""不对"。
 */
export const PHRASES = {
  tryAgain: { zh: '再找找', en: 'Try again' },
  thinkAgain: { zh: '再想想', en: 'Let’s think again' },
  lookAgain: { zh: '再看看', en: 'Look again' },
  youFoundIt: { zh: '你找到了！', en: 'You found it!' },
  wellDone: { zh: '做得真好！', en: 'Well done!' },
  lookCarefully: { zh: '你看得真仔细！', en: 'You looked so carefully!' },
  howMany: { zh: '有几个？', en: 'How many?' },
  whatsNext: { zh: '接下来是什么？', en: 'What comes next?' },
  whatToDoNext: { zh: '接下来做什么？', en: 'What do we do next?' },
  allDone: { zh: '看完啦！', en: 'All done!' },
  storyEnd: { zh: '故事讲完啦！', en: 'The end!' },
  bubblesBye: { zh: '泡泡飞走啦！', en: 'Bye-bye, bubbles!' },
  moveDone: { zh: '真棒，动完啦！', en: 'Great moving!' },
  breatheIntro: { zh: '我们一起慢慢呼吸', en: 'Let’s breathe slowly' },
  breatheIn: { zh: '吸气', en: 'Breathe in' },
  breatheOut: { zh: '呼气', en: 'Breathe out' },
  whereDidItGo: { zh: '去哪儿啦？', en: 'Where did it go?' },
  peekaboo: { zh: '在这儿！', en: 'Peekaboo!' },
  letsCount: { zh: '我们一起数一数', en: 'Let’s count together' },
  singTogether: { zh: '和宝宝一起唱', en: 'Let’s sing together' },
  sitBack: { zh: '坐远一点，保护眼睛', en: 'Sit back a little' },
  restTime: { zh: '休息一下吧', en: 'Time for a break' },
  timeToPlay: { zh: '我们去玩真的玩具吧！', en: 'Let’s go play for real!' },
} as const satisfies Record<string, Speech>;

export type PhraseKey = keyof typeof PHRASES;

/** 唱数与数量用到的数字范围（scripts/gen-audio 会生成 1-10 的中英文唱数音频） */
export const COUNT_RANGE = { min: 1, max: 10 } as const;
