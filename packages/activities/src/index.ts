import type { ActivityPlugin } from '@sprout/plugin-sdk';
import { contrastActivity } from './activities/contrast';
import { wordCardsActivity } from './activities/word-cards';
import { peekabooActivity } from './activities/peekaboo';
import { bubblesActivity } from './activities/bubbles';
import { countActivity } from './activities/count';
import { subitizeActivity } from './activities/subitize';
import { chooseActivity } from './activities/choose';
import { sortActivity } from './activities/sort';
import { sequenceActivity } from './activities/sequence';
import { patternActivity } from './activities/pattern';
import { storyActivity } from './activities/story';
import { songActivity } from './activities/song';
import { movementActivity } from './activities/movement';
import { calmActivity } from './activities/calm';
import { videoActivity } from './activities/video';
import { webActivity } from './activities/web';
import { guideActivity } from './activities/guide';

export {
  contrastActivity, wordCardsActivity, peekabooActivity, bubblesActivity, countActivity,
  subitizeActivity, chooseActivity, sortActivity, sequenceActivity, patternActivity,
  storyActivity, songActivity, movementActivity, calmActivity, videoActivity, webActivity,
  guideActivity,
};
export { contrastSvg } from './contrast-svg';
export type { ContrastPattern } from './contrast-svg';
export { Scene } from './Scene';
export { ReadingArea, scrollReadingArea } from './ReadingArea';
export { parseNotes } from './music';
export type { ParsedNote } from './music';

export const builtinActivities: ActivityPlugin[] = [
  contrastActivity, wordCardsActivity, peekabooActivity, bubblesActivity, countActivity,
  subitizeActivity, chooseActivity, sortActivity, sequenceActivity, patternActivity,
  storyActivity, songActivity, movementActivity, calmActivity, videoActivity, webActivity,
  guideActivity,
];
