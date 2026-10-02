import type { ContrastProps } from '@sprout/schema';

export type ContrastPattern = ContrastProps['patterns'][number];

type Drawing = (ink: string, background: string) => string;

const drawings: Record<ContrastPattern, Drawing> = {
  bullseye: (ink, background) => [88, 66, 44, 22]
    .map((r, i) => `<circle cx="100" cy="100" r="${r}" fill="${i % 2 ? background : ink}"/>`)
    .join(''),
  stripes: () => [20, 65, 110, 155]
    .map((x) => `<rect x="${x}" y="15" width="25" height="170"/>`)
    .join(''),
  checker: () => Array.from({ length: 16 }, (_, i) => (Math.floor(i / 4) + i % 4) % 2 === 0
    ? `<rect x="${12 + i % 4 * 44}" y="${12 + Math.floor(i / 4) * 44}" width="44" height="44"/>`
    : '').join(''),
  dots: () => Array.from({ length: 9 }, (_, i) =>
    `<circle cx="${40 + i % 3 * 60}" cy="${40 + Math.floor(i / 3) * 60}" r="21"/>`).join(''),
  face: (ink) => `<g fill="none" stroke="${ink}" stroke-width="12" stroke-linecap="round">`
    + '<circle cx="100" cy="100" r="82"/><path d="M56 122 Q100 170 144 122"/>'
    + `<circle cx="70" cy="78" r="9" fill="${ink}" stroke="none"/>`
    + `<circle cx="130" cy="78" r="9" fill="${ink}" stroke="none"/></g>`,
  spiral: (ink) => '<path d="M100 102 C112 102 113 85 101 81 C78 73 66 99 77 117 C96 148 138 129 144 104 C157 52 90 28 53 64 C-1 117 60 193 123 176 C187 159 194 76 151 36"'
    + ` fill="none" stroke="${ink}" stroke-width="15" stroke-linecap="round"/>`,
  zigzag: (ink) => `<g fill="none" stroke="${ink}" stroke-width="18" stroke-linecap="round" stroke-linejoin="round">`
    + [60, 125].map((y) =>
      `<path d="M20 ${y + 22} L60 ${y - 22} L100 ${y + 22} L140 ${y - 22} L180 ${y + 22}"/>`).join('')
    + '</g>',
  circle: () => '<circle cx="100" cy="100" r="80"/>',
  square: () => '<rect x="25" y="25" width="150" height="150" rx="5"/>',
  triangle: (ink) => `<path d="M100 18 L184 174 L16 174 Z" stroke="${ink}" stroke-width="8" stroke-linejoin="round"/>`,
  star: (ink) => '<path d="M100 14 L126 70 L187 78 L143 123 L154 185 L100 154 L46 185 L57 123 L13 78 L74 70 Z"'
    + ` stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>`,
  heart: () => '<path d="M100 177 C73 156 17 119 17 71 C17 23 74 16 100 56 C126 16 183 23 183 71 C183 119 127 156 100 177 Z"/>',
};

/** 活动与实体卡共用；尺寸默认 200，颜色与背景完整内置，不依赖页面样式。 */
export function contrastSvg(
  pattern: ContrastPattern,
  palette: 'bw' | 'bwr',
  opts?: { invert?: boolean; size?: number },
): string {
  if (typeof pattern !== 'string' || !Object.hasOwn(drawings, pattern)) {
    throw new RangeError('Unknown contrast pattern');
  }
  if (palette !== 'bw' && palette !== 'bwr') throw new RangeError('Unknown contrast palette');
  const { invert = false, size = 200 } = opts ?? {};
  if (typeof invert !== 'boolean') throw new TypeError('Contrast invert must be a boolean');
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) {
    throw new RangeError('Contrast size must be a positive finite number');
  }

  const background = invert ? '#000' : '#fff';
  const ink = palette === 'bwr' ? '#dc2626' : invert ? '#fff' : '#000';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 200 200">`
    + `<rect width="200" height="200" fill="${background}"/>`
    + `<g fill="${ink}">${drawings[pattern](ink, background)}</g></svg>`;
}
