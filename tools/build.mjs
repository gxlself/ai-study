import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data/site-data.json'), 'utf8'));
const template = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');
const zh = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/zh.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'src/i18n/en.json'), 'utf8'));

const github = 'https://github.com/gxlself/ai-study';
const releaseUrl = `${github}/releases/tag/v0.0.1`;
const publicRoot = 'https://gxlself.github.io/ai-study/';
const locales = { zh, en };

const h = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const attr = h;
const text = (value, fallback = '') => (value == null || value === '' ? fallback : String(value));
const localized = (value, locale, fallback = '') => {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value[locale] || value.zh || value.en || fallback;
};
const doc = (relativePath, anchor = '') => `${github}/blob/main/${relativePath}${anchor}`;
const link = (url, label, className = '') =>
  `<a class="${className}" href="${attr(url)}" target="_blank" rel="noreferrer">${h(label)} <span aria-hidden="true">↗</span></a>`;
const icon = (name, label = '') => {
  const paths = {
    arrow: '<path d="M5 12h13M13 6l6 6-6 6"/>',
    external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5H5V6h5"/>',
    volume: '<path d="M4 10v4h4l5 4V6l-5 4H4Z"/><path d="M17 9.5a4 4 0 0 1 0 5"/><path d="M19.5 7a7.2 7.2 0 0 1 0 10"/>',
    print: '<path d="M6 9V4h12v5"/><path d="M6 17H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><path d="M6 14h12v7H6z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
    code: '<path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    chevron: '<path d="m8 10 4 4 4-4"/>',
    spark: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>',
  };
  return `<svg class="icon ${label ? 'icon-labeled' : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false" ${label ? `title="${attr(label)}"` : ''}>${paths[name] || paths.spark}</svg>`;
};

const headingParts = {
  zh: {
    hero: ['屏幕只做引子，', '成长发生', '在你们之间。'],
    principles: ['五件事，', '装进五袋种子'],
    stages: ['六个阶段，', '不是一条竞赛跑道'],
    lesson: ['把「嘀嘀叭叭」', '展开看看'],
    activities: ['17 个小而有限的入口'],
    home: ['一台小服务器，', '把设备留在家里'],
    try: ['先按一下电源，', '再决定看多久'],
    evidence: ['像一面借书卡墙，', '记下我们为什么这样做'],
    developers: ['从一颗芽，', '到一个可运行的 monorepo'],
    faq: ['把犹豫留在门口，', '带轻一点进去'],
  },
  en: {
    hero: ['A screen can open the door.', 'Growing happens together.'],
    principles: ['Five things,', 'tucked into five seed packets'],
    stages: ['Six stages,', 'not a race track'],
    lesson: ['Unfold “Beep Beep, Let’s Go”'],
    activities: ['17 small, finite ways in'],
    home: ['One small server,', 'devices kept in the house'],
    try: ['Press the power,', 'then decide how long to look'],
    evidence: ['A library-card wall', 'for the reasons behind the choices'],
    developers: ['From one seedling,', 'to a runnable monorepo'],
    faq: ['Leave the worry at the door;', 'carry less inside'],
  },
};

const titleMarkup = (title, locale, key) => {
  const parts = headingParts[locale]?.[key] || [title];
  return parts.map((part) => `<span class="nobr">${h(part)}</span>`).join('');
};

const seedArt = (index) => {
  const art = [
    '<circle cx="24" cy="23" r="10" fill="#f0c6a4" stroke="currentColor" stroke-width="2"/><circle cx="42" cy="27" r="7" fill="#f0c6a4" stroke="currentColor" stroke-width="2"/><path d="M12 47q4-14 16-14t16 14M35 47q3-10 12-10t11 10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>',
    '<path d="M13 12h38v35H13z" fill="#fffaf2" stroke="currentColor" stroke-width="2"/><path d="M20 20h22M20 27h15M20 34h19" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="m44 9 7 7" stroke="#f08a5d" stroke-width="3" stroke-linecap="round"/>',
    '<path d="M13 29h14M35 21h15M35 37h13" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><circle cx="10" cy="29" r="4" fill="#f08a5d"/><circle cx="32" cy="21" r="4" fill="#5da9e9"/><circle cx="32" cy="37" r="4" fill="#6c9a3b"/>',
    '<path d="M25 46c-9-13-18-15-15-25 2-7 11-5 15 2 4-7 13-9 15-2 3 10-6 12-15 25Z" fill="#98c968" stroke="currentColor" stroke-width="2"/><path d="M29 15c6-8 13-6 17-1-5 6-10 7-17 1Z" fill="#77b77d" stroke="currentColor" stroke-width="2"/>',
    '<circle cx="17" cy="39" r="6" fill="#d8b07b" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="39" r="6" fill="#d8b07b" stroke="currentColor" stroke-width="2"/><circle cx="47" cy="39" r="6" fill="#d8b07b" stroke="currentColor" stroke-width="2"/><path d="M17 25v9M32 21v13M47 25v9" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  ];
  return `<svg class="seed-art" viewBox="0 0 64 54" aria-hidden="true">${art[index] || art[0]}</svg>`;
};

const activityArt = (type) => {
  const drawings = {
    contrast: '<circle cx="40" cy="36" r="22" fill="#fffaf2"/><circle cx="40" cy="36" r="15" fill="#1f2a44"/><circle cx="40" cy="36" r="7" fill="#f08a5d"/>',
    'word-cards': '<rect x="13" y="10" width="54" height="47" rx="4" fill="#fffaf2" stroke="#3b3226" stroke-width="2"/><path d="M26 39c-7-10 7-19 14-7 7-12 21-3 14 7-5 8-14 13-14 13S31 47 26 39Z" fill="#f08a5d" stroke="#9b3f38" stroke-width="2"/><path d="M23 18h26" stroke="#5da9e9" stroke-width="3" stroke-linecap="round"/>',
    peekaboo: '<circle cx="41" cy="36" r="17" fill="#f0c6a4" stroke="#3b3226" stroke-width="2"/><circle cx="35" cy="34" r="2" fill="#3b3226"/><circle cx="47" cy="34" r="2" fill="#3b3226"/><path d="M15 16h20v39H15z" fill="#f08a5d" stroke="#9b3f38" stroke-width="2"/><path d="M15 16q12 9 20 0" fill="none" stroke="#fffaf2" stroke-width="2"/>',
    bubbles: '<circle cx="23" cy="38" r="12" fill="#dff1fb" stroke="#5da9e9" stroke-width="3"/><circle cx="47" cy="28" r="9" fill="#e6f4d7" stroke="#6c9a3b" stroke-width="3"/><circle cx="56" cy="47" r="5" fill="#f8e8c7" stroke="#f08a5d" stroke-width="2"/>',
    count: '<circle cx="23" cy="35" r="7" fill="#f08a5d"/><circle cx="40" cy="35" r="7" fill="#5da9e9"/><circle cx="57" cy="35" r="7" fill="#6c9a3b"/><path d="M13 17q17-12 29-2" fill="none" stroke="#3b3226" stroke-width="3" stroke-linecap="round"/><path d="m39 14 5 2-4 4" fill="none" stroke="#3b3226" stroke-width="2"/>',
    subitize: '<rect x="14" y="12" width="52" height="45" rx="7" fill="#fffaf2" stroke="#3b3226" stroke-width="3"/><circle cx="28" cy="25" r="3" fill="#3b3226"/><circle cx="52" cy="25" r="3" fill="#3b3226"/><circle cx="40" cy="34" r="3" fill="#3b3226"/><circle cx="28" cy="45" r="3" fill="#3b3226"/><circle cx="52" cy="45" r="3" fill="#3b3226"/>',
    choose: '<circle cx="24" cy="34" r="13" fill="#f08a5d"/><rect x="45" y="22" width="25" height="25" rx="4" fill="#5da9e9"/><path d="M10 12c10 3 18 9 25 18" fill="none" stroke="#3b3226" stroke-width="3" stroke-linecap="round"/><path d="m31 26 5 4-6 1" fill="none" stroke="#3b3226" stroke-width="2"/>',
    sort: '<path d="M12 33q14-8 28 0v21H12Z" fill="#d8b07b" stroke="#67472f" stroke-width="2"/><path d="M43 33q13-8 25 0v21H43Z" fill="#d8b07b" stroke="#67472f" stroke-width="2"/><circle cx="25" cy="28" r="7" fill="#f08a5d"/><rect x="50" y="20" width="12" height="12" rx="2" fill="#5da9e9"/>',
    sequence: '<rect x="10" y="21" width="18" height="25" rx="3" fill="#f8e8c7" stroke="#3b3226" stroke-width="2"/><rect x="35" y="21" width="18" height="25" rx="3" fill="#e6f4d7" stroke="#3b3226" stroke-width="2"/><path d="M28 33h7M32 29l4 4-4 4" fill="none" stroke="#f08a5d" stroke-width="2"/>',
    pattern: '<circle cx="17" cy="35" r="9" fill="#f08a5d"/><rect x="31" y="26" width="18" height="18" rx="3" fill="#5da9e9"/><circle cx="61" cy="35" r="9" fill="#f08a5d"/><path d="M5 15h62" stroke="#6c9a3b" stroke-width="3" stroke-dasharray="4 6"/>',
    story: '<path d="M12 19q14-7 28 1v35q-14-8-28 0Z" fill="#fffaf2" stroke="#3b3226" stroke-width="2"/><path d="M40 20q13-8 28-1v36q-15-8-28 0Z" fill="#fffaf2" stroke="#3b3226" stroke-width="2"/><path d="M20 29h13M20 36h11M48 29h12M48 36h9" stroke="#5da9e9" stroke-width="2" stroke-linecap="round"/>',
    song: '<path d="M28 18v29" stroke="#3b3226" stroke-width="3"/><path d="M28 18q19-7 29 0v9q-10-7-29 0Z" fill="#f08a5d" stroke="#9b3f38" stroke-width="2"/><ellipse cx="21" cy="49" rx="9" ry="6" fill="#5da9e9"/><path d="M52 40q8-8 14-2" fill="none" stroke="#6c9a3b" stroke-width="3" stroke-linecap="round"/>',
    movement: '<circle cx="41" cy="17" r="7" fill="#f0c6a4" stroke="#3b3226" stroke-width="2"/><path d="M41 25v18M41 30l-15-7M41 30l15-10M41 43l-14 12M41 43l16 10" fill="none" stroke="#3b3226" stroke-width="3" stroke-linecap="round"/><path d="m14 26 7-5M16 42l-7 3" stroke="#f08a5d" stroke-width="3" stroke-linecap="round"/>',
    calm: '<circle cx="40" cy="35" r="22" fill="none" stroke="#5da9e9" stroke-width="3"/><circle cx="40" cy="35" r="12" fill="none" stroke="#ffc93c" stroke-width="3"/><path d="M40 35 52 23" stroke="#6c9a3b" stroke-width="3" stroke-linecap="round"/>',
    video: '<rect x="10" y="13" width="60" height="43" rx="5" fill="#1f2a44" stroke="#3b3226" stroke-width="3"/><path d="m34 24 17 10-17 10Z" fill="#ffc93c"/><path d="M20 63h40" stroke="#3b3226" stroke-width="3" stroke-linecap="round"/>',
    web: '<rect x="9" y="13" width="62" height="45" rx="5" fill="#fffaf2" stroke="#3b3226" stroke-width="3"/><path d="M10 25h60" stroke="#3b3226" stroke-width="3"/><circle cx="18" cy="19" r="2" fill="#f08a5d"/><circle cx="26" cy="19" r="2" fill="#ffc93c"/><circle cx="34" cy="19" r="2" fill="#6c9a3b"/><path d="M23 40h35M23 47h22" stroke="#5da9e9" stroke-width="3" stroke-linecap="round"/>',
    guide: '<path d="M15 12h50v43H15z" fill="#f8e8c7" stroke="#67472f" stroke-width="2"/><path d="M23 22h30M23 30h24" stroke="#a45a3e" stroke-width="2" stroke-linecap="round"/><path d="m23 42 6 6 14-15" fill="none" stroke="#6c9a3b" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  return `<svg class="activity-svg" viewBox="0 0 80 70" aria-hidden="true">${drawings[type] || drawings.guide}</svg>`;
};

const stageAge = (stage, locale) => {
  const [min, max] = stage.ageRange;
  if (locale === 'zh') return min === max ? `${min} 月龄` : `${min}–${max} 月龄`;
  return min === max ? `${min} months` : `${min}–${max} months`;
};
const rangeAge = (range, locale) => {
  if (!range) return '';
  const [min, max] = range;
  return locale === 'zh'
    ? min === max
      ? `${min} 月龄`
      : `${min}–${max} 月龄`
    : min === max
      ? `${min} months`
      : `${min}–${max} months`;
};
const escapeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const sectionHeader = (locale, eyebrow, title, lede, titleKey = '') => `
  <div class="section-heading">
    <p class="eyebrow">${h(eyebrow)}</p>
    <h2 class="section-title balanced-title">${titleMarkup(title, locale, titleKey)}</h2>
    <p class="section-lede">${h(lede)}</p>
  </div>`;

const stagePolicy = (stage, locale, ui) => {
  const state = stage.screen.childScreen;
  return {
    text: ui.stagePolicies[stage.id] || (state === 'none' ? ui.stages.noChildScreen : ui.stages.defaultChildScreen),
    active: state === 'none' ? 'off' : state === 'optional' ? 'parent' : 'coView',
  };
};

const rhythmLabels = (stage, locale, ui) => {
  if (locale === 'en') return ui.rhythmLabels[stage.id] || [];
  return stage.dailyRhythm.map((item) => item.split('：')[0].split(':')[0]);
};

const stageRing = (stage, locale, ui) => {
  const labels = rhythmLabels(stage, locale, ui);
  const count = Math.max(1, labels.length);
  const angle = (stage.screen.dailyMaxMin / (12 * 60)) * 360;
  const screenPercent = ((stage.screen.dailyMaxMin / (12 * 60)) * 100).toFixed(1);
  // 环用 pathLength=360 的圆描边绘制：屏幕弧按真实比例居中在 12 点方向，其余生活段均分（示意）。
  const cx = 110;
  const cy = 128;
  const r = 78;
  const gap = 2.5;
  const restStart = angle / 2 + gap;
  const restSpan = (360 - angle - gap * 2 - gap * (count - 1)) / count;
  const arc = (start, span, cls, extra = '') =>
    `<circle class="${cls}" cx="${cx}" cy="${cy}" r="${r}" pathLength="360" stroke-dasharray="${span.toFixed(3)} 360" transform="rotate(${(
      -90 + start
    ).toFixed(3)} ${cx} ${cy})"${extra}/>`;
  const restArcs = labels
    .map((_, index) => arc(restStart + index * (restSpan + gap), restSpan, `ring-seg ring-c${index % 8}`))
    .join('');
  return `
    <div class="rhythm-wrap">
      <figure class="rhythm-figure">
        <svg class="rhythm-ring" viewBox="0 0 220 236" role="img" aria-label="${attr(
          locale === 'zh'
            ? `一天的示意环：整圈是 12 小时清醒时间，屏幕上限 ${stage.screen.dailyMaxMin} 分钟，占 ${screenPercent}%，其余是屏幕外生活。`
            : `Illustrative day ring: the full ring is 12 waking hours, screen time is ${stage.screen.dailyMaxMin} minutes or ${screenPercent}%, and the rest is outside the screen.`,
        )}">
          <circle class="ring-track" cx="${cx}" cy="${cy}" r="${r}"/>
          ${restArcs}
          ${arc(-angle / 2, angle, 'ring-screen')}
          <path class="ring-leader" d="M${cx} ${cy - r - 14}V${cy - r - 30}"/>
          <text class="ring-callout" x="${cx}" y="${cy - r - 38}" text-anchor="middle">${h(ui.stages.dayShapeScreen)} ${stage.screen.dailyMaxMin} ${h(
            ui.stages.minutes,
          )}</text>
          <text class="ring-value" x="${cx}" y="${cy + 6}" text-anchor="middle">${screenPercent}%</text>
          <text class="ring-unit" x="${cx}" y="${cy + 28}" text-anchor="middle">${stage.screen.dailyMaxMin} ${h(ui.stages.minutes)} / ${h(
            ui.stages.wakingHours,
          )}</text>
        </svg>
      </figure>
      <ul class="rhythm-legend">
        ${labels.map((label, index) => `<li><i class="ring-c${index % 8}"></i>${h(label)}</li>`).join('')}
      </ul>
    </div>
    <p class="micro-note">${h(ui.stages.dayShapeNote)}</p>`;
};

const stageScreenStates = (stage, locale, ui) => {
  const policy = stagePolicy(stage, locale, ui);
  const states = [
    ['off', ui.stages.screenStates.off, '◌'],
    ['parent', ui.stages.screenStates.parent, '◐'],
    ['coView', ui.stages.screenStates.coView, '◉'],
  ];
  return `
    <div class="screen-states" aria-label="${attr(ui.stages.screenTitle)}">
      ${states
        .map(
          ([key, label, mark]) => `
            <div class="screen-state ${key === policy.active ? 'is-active' : ''}">
              <span class="mini-tv" aria-hidden="true"><span>${mark}</span></span>
              <span>${h(label)}</span>
            </div>`,
        )
        .join('')}
    </div>`;
};

const stageFocus = (stage, locale) =>
  `<ul class="focus-list">${stage.focus
    .map(
      (item) =>
        `<li><span class="check-mark" aria-hidden="true">✓</span><span>${h(localized(item, locale))}</span></li>`,
    )
    .join('')}</ul>`;

const sampleIntro = (stage, lesson, locale, ui) => {
  if (locale === 'en') {
    if (lesson.id === data.selectedLessonId) return ui.lessonVehiclesEn.intro;
    return 'Read the short parent guide, then put the screen down and try it with a real object.';
  }
  return lesson.parentGuide.intro;
};

const samplePhrases = (lesson, locale, ui) => {
  if (locale === 'en' && lesson.id === data.selectedLessonId) {
    return ui.lessonVehiclesEn.phrases.map(([enText]) => ({ en: enText }));
  }
  return (lesson.parentGuide.phrases || []).slice(0, 2);
};

const stagePanel = (stage, locale, ui, index) => {
  const lesson = stage.sampleLesson;
  const policy = stagePolicy(stage, locale, ui);
  const age = stageAge(stage, locale);
  const title = localized(stage.title, locale);
  const subtitle = localized(stage.subtitle, locale);
  const samplePhrasesList = samplePhrases(lesson, locale, ui);
  const limitPrefix =
    stage.screen.childScreen === 'none'
      ? { session: ui.stages.parentSession, daily: ui.stages.parentDaily }
      : stage.screen.childScreen === 'optional'
        ? { session: ui.stages.optionalSession, daily: ui.stages.optionalDaily }
        : { session: ui.stages.session, daily: ui.stages.daily };
  return `
    <article class="stage-panel ${index === 0 ? 'is-active' : ''}" data-stage-panel="${attr(stage.id)}" ${
      index === 0 ? '' : 'hidden'
    }>
      <div class="stage-panel-top">
        <div>
          <div class="kicker-row"><span class="stage-pill">${h(stage.id.toUpperCase())}</span><span>${h(age)}</span></div>
          <h3>${h(title)}</h3>
          <p class="stage-subtitle">${h(subtitle)}</p>
        </div>
        <div class="stage-count">
          <strong>${stage.lessonCount}</strong>
          <span>${h(ui.stages.lessons)}</span>
        </div>
      </div>
      <div class="stage-grid">
        <div class="stage-column">
          <div class="subsection-label">${h(ui.stages.screenTitle)}</div>
          ${stageScreenStates(stage, locale, ui)}
          <p class="screen-policy">${h(policy.text)}</p>
          <div class="limit-row">
            <span><b>${h(limitPrefix.session)}</b> ${stage.screen.sessionMaxMin} ${h(ui.stages.minutes)}</span>
            <span><b>${h(limitPrefix.daily)}</b> ${stage.screen.dailyMaxMin} ${h(ui.stages.minutes)}</span>
          </div>
          <div class="audience-counts">
            <span>${stage.parentLessonCount} ${h(ui.stages.parentLessons)}</span>
            <span>${stage.childLessonCount} ${h(ui.stages.childLessons)}</span>
          </div>
        </div>
        <div class="stage-column day-shape">
          <div class="subsection-label">${h(ui.stages.dayShape)}</div>
          ${stageRing(stage, locale, ui)}
        </div>
      </div>
      <div class="stage-lower-grid">
        <div>
          <div class="subsection-label">${h(ui.stages.focus)}</div>
          ${stageFocus(stage, locale)}
        </div>
        <div>
          <div class="subsection-label">${h(ui.stages.themes)}</div>
          <div class="theme-index">
            ${stage.themes
              .map(
                (theme, themeIndex) => `
                  <details class="theme-item">
                    <summary><span class="theme-number">${String(themeIndex + 1).padStart(2, '0')}</span><span>${h(
                      localized(theme.title, locale),
                    )}</span><span class="summary-caret" aria-hidden="true">+</span></summary>
                    <div class="theme-body">
                      <p>${h(localized(theme.description, locale))}</p>
                      <ul>${(locale === 'en' ? ui.themeOfflineFocus?.[theme.id] || [] : theme.offlineFocus)
                        .slice(0, 3)
                        .map((item) => `<li>${h(item)}</li>`)
                        .join('')}</ul>
                    </div>
                  </details>`,
              )
              .join('')}
          </div>
        </div>
      </div>
      <div class="postcard">
        <div class="postcard-pin" aria-hidden="true"></div>
        <div class="postcard-head">
          <span>${h(ui.stages.postcard)}</span>
          <span class="postcard-stamp">${h(stage.id.toUpperCase())}</span>
        </div>
        <div class="postcard-body">
          <div>
            <h4>${h(localized(lesson.title, locale))}</h4>
            ${locale === 'zh' ? `<p class="english-line">${h(localized(lesson.title, 'en'))}</p>` : ''}
            <p>${h(localized(lesson.summary, locale))}</p>
          </div>
          <div class="postcard-copy">
            <span class="small-label">${h(ui.lesson.parentFirst)}</span>
            <p>${h(sampleIntro(stage, lesson, locale, ui))}</p>
          </div>
          <div class="postcard-phrases">
            <span class="small-label">${h(ui.lesson.phrases)}</span>
            ${samplePhrasesList
              .map((phrase) => `<p>“${h(localized(phrase, locale))}”</p>`)
              .join('')}
          </div>
        </div>
        <a class="text-link" href="#lesson" data-stage-lesson="${attr(lesson.id)}">${h(ui.stages.readMore)} ${icon('arrow')}</a>
      </div>
    </article>`;
};

const stageScale = (locale, ui) => `
  <div class="stage-scale" data-stage-scale>
    <div class="scale-rail" aria-hidden="true"></div>
    ${data.stages
      .map(
        (stage, index) => `
          <button class="scale-tick ${index === 0 ? 'is-current' : ''}" type="button" data-stage-select="${attr(
            stage.id,
          )}" style="--tick-index:${index}" aria-label="${attr(
            `${ui.stages.stageLabel} ${stage.id.toUpperCase()} · ${stageAge(stage, locale)}`,
          )}">
            <span class="tick-line"></span>
            <span class="tick-label">${h(stage.ageRange[0])}${locale === 'zh' ? ' 月' : ' mo'}</span>
            <span class="tick-title">${h(localized(stage.title, locale))}</span>
          </button>`,
      )
      .join('')}
    <button
      class="stage-marker"
      type="button"
      role="slider"
      tabindex="0"
      data-stage-slider
      aria-valuemin="0"
      aria-valuemax="${data.stages.length - 1}"
      aria-valuenow="0"
      aria-valuetext="${attr(`${data.stages[0].title[locale]} · ${stageAge(data.stages[0], locale)}`)}"
      aria-label="${attr(ui.stages.sliderHint)}"
    >
      <span class="marker-paper">${icon('spark')}<span aria-hidden="true"></span></span>
    </button>
  </div>`;

const heroScene = (ui) => `
  <div class="hero-art-wrap">
    <div class="hero-art-note"><span class="dot"></span> ${h(ui.hero.sceneLabel)}</div>
    <div class="hero-scene-frame">
      <svg class="hero-scene" viewBox="0 0 620 460" role="img" aria-label="${attr(ui.hero.sceneLabel)}" data-hero-scene>
        <defs>
          <linearGradient id="hero-wall" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stop-color="#fffaf2"/>
            <stop offset="1" stop-color="#f3ead9"/>
          </linearGradient>
          <linearGradient id="hero-floor" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stop-color="#eadbc1"/>
            <stop offset="1" stop-color="#d8c29f"/>
          </linearGradient>
          <radialGradient id="hero-glow">
            <stop offset="0" stop-color="#ffc93c" stop-opacity=".72"/>
            <stop offset=".7" stop-color="#ffc93c" stop-opacity=".18"/>
            <stop offset="1" stop-color="#ffc93c" stop-opacity="0"/>
          </radialGradient>
          <filter id="hero-soft"><feGaussianBlur stdDeviation="14"/></filter>
        </defs>
        <rect class="hero-wall" width="620" height="460" rx="28" fill="url(#hero-wall)"/>
        <path class="hero-floor" d="M0 352 620 314v146H0Z" fill="url(#hero-floor)"/>
        <path d="M0 354 620 316" fill="none" stroke="#c9ae83" stroke-width="2" stroke-dasharray="7 12" opacity=".55"/>
        <circle class="hero-glow" cx="323" cy="260" r="155" fill="url(#hero-glow)" filter="url(#hero-soft)"/>
        <g class="hero-stars" aria-hidden="true">
          <circle cx="76" cy="82" r="2.5" fill="#ffc93c"/><circle cx="116" cy="117" r="1.8" fill="#fffaf2"/>
          <circle cx="571" cy="84" r="2" fill="#ffc93c"/><circle cx="592" cy="126" r="1.6" fill="#fffaf2"/>
          <path d="m79 147 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z" fill="#ffc93c"/>
        </g>
        <g class="hero-lamp" transform="translate(35 0)">
          <path d="M535 292v-104" fill="none" stroke="#6a5a45" stroke-width="8" stroke-linecap="round"/>
          <path d="M511 184q24-30 48 0l-8 16h-32Z" fill="#f4c36a" stroke="#6a5a45" stroke-width="4"/>
          <path d="M520 198h30l17 80h-64Z" fill="#ffdb83" opacity=".65"/>
          <ellipse cx="535" cy="291" rx="42" ry="8" fill="#6a5a45" opacity=".35"/>
        </g>
        <g class="hero-cabinet">
          <path d="M118 332h282l-14 91H132Z" fill="#8a5f3b" stroke="#67472f" stroke-width="5"/>
          <path d="M106 332h310l-12 18H114Z" fill="#b47a4c" stroke="#67472f" stroke-width="5"/>
          <path d="M155 351h210" stroke="#d69c64" stroke-width="4" opacity=".45"/>
          <circle cx="193" cy="387" r="15" fill="#5b412d"/>
          <circle cx="335" cy="387" r="15" fill="#5b412d"/>
        </g>
        <g class="hero-tv">
          <rect x="136" y="178" width="246" height="157" rx="28" fill="#66806a" stroke="#3b3226" stroke-width="6"/>
          <rect x="153" y="195" width="183" height="119" rx="17" class="hero-tv-screen"/>
          <path d="M173 216q43-20 99 0" fill="none" stroke="#fffaf2" stroke-width="6" opacity=".2" class="screen-reflection"/>
          <text x="322" y="301" text-anchor="end" class="screen-off-text">${h(ui.try.offLabel)}</text>
          <circle cx="355" cy="240" r="12" fill="#f2b134" stroke="#3b3226" stroke-width="4"/>
          <path d="M355 232v16" stroke="#3b3226" stroke-width="3" stroke-linecap="round"/>
          <path d="M350 322h22M354 322v17M368 322v17" fill="none" stroke="#3b3226" stroke-width="5" stroke-linecap="round"/>
        </g>
        <g class="hero-sprout">
          <path d="M296 198C290 168 296 142 315 111c17-28 23-54 14-84" fill="none" stroke="#6c9a3b" stroke-width="8" stroke-linecap="round"/>
          <path d="M298 177c-29-5-45-27-41-48 25-2 46 17 41 48Z" fill="#98c968" stroke="#548e5b" stroke-width="4"/>
          <path d="M307 148c4-29 24-47 49-44 2 26-16 46-49 44Z" fill="#77b77d" stroke="#548e5b" stroke-width="4"/>
          <path d="M267 141c-18-16-19-37-5-50 18 7 22 28 5 50Z" fill="#98c968" stroke="#548e5b" stroke-width="4"/>
          <path d="M278 91c7-16 22-24 36-18-2 17-15 26-36 18Z" fill="#77b77d" stroke="#548e5b" stroke-width="4"/>
          <path d="m279 78 7-11 8 11-8 13Z" fill="#f08a5d" stroke="#a45a3e" stroke-width="3"/>
          <path d="M279 73v-9M275 70l-4-5M284 70l5-5" fill="none" stroke="#f08a5d" stroke-width="2.5" stroke-linecap="round"/>
        </g>
        <ellipse class="hero-rug" cx="485" cy="414" rx="124" ry="20" fill="#e6f4d7" opacity=".8"/>
        <g class="hero-basket" transform="translate(-36 0)">
          <path d="M438 363q22-39 70 0l-8 42h-54Z" fill="#b47a4c" stroke="#67472f" stroke-width="4"/>
          <path d="M445 365q29-36 56 0" fill="none" stroke="#67472f" stroke-width="5"/>
          <circle cx="465" cy="368" r="15" fill="#e85d4d" stroke="#9b3f38" stroke-width="3"/>
          <circle cx="493" cy="370" r="12" fill="#5da9e9" stroke="#386b9b" stroke-width="3"/>
          <rect x="460" y="387" width="39" height="11" rx="4" fill="#f5d28a" transform="rotate(9 460 387)"/>
          <path d="M508 390h18v23h-18z" fill="#e6f4d7" stroke="#6c9a3b" stroke-width="3"/>
          <path d="m512 395 9 0M512 401h9" stroke="#6c9a3b" stroke-width="2"/>
        </g>
        <g class="hero-people" transform="translate(92 0)">
          <circle cx="383" cy="334" r="20" fill="#f0c6a4" stroke="#3b3226" stroke-width="4"/>
          <path d="M350 407q6-66 33-66t36 66Z" fill="#f08a5d" stroke="#3b3226" stroke-width="5"/>
          <circle cx="419" cy="363" r="14" fill="#f0c6a4" stroke="#3b3226" stroke-width="3"/>
          <path d="M396 420q4-52 24-52t26 52Z" fill="#5da9e9" stroke="#3b3226" stroke-width="4"/>
          <path d="M355 410q26 18 61 4M406 418q22 10 47 1" fill="none" stroke="#3b3226" stroke-width="4" stroke-linecap="round"/>
          <circle cx="379" cy="338" r="3" fill="#f08a5d" opacity=".7"/>
          <circle cx="424" cy="366" r="2.5" fill="#f08a5d" opacity=".7"/>
        </g>
      </svg>
      <button class="art-replay" type="button" data-replay-hero>${icon('spark')} ${h(ui.hero.replay)}</button>
    </div>
  </div>`;

const ratioBar = (lesson, ui, locale) => {
  const screenMin = lesson.durationMin;
  const outsideMin = lesson.offline?.[0]?.minutes || 10;
  const total = screenMin + outsideMin;
  const screenPct = Math.round((screenMin / total) * 1000) / 10;
  return `
    <div class="ratio-block">
      <div class="ratio-labels"><span><i class="ratio-screen"></i>${h(ui.hero.screen)} <b>${screenMin} ${h(ui.stages.minutes)}</b></span><span><i class="ratio-outside"></i>${h(
        ui.hero.outside,
      )} <b>${outsideMin} ${h(ui.stages.minutes)}</b></span></div>
      <div class="ratio-track" role="img" aria-label="${attr(
        `${ui.hero.screen} ${screenMin} ${ui.stages.minutes}; ${ui.hero.outside} ${outsideMin} ${ui.stages.minutes}`,
      )}">
        <span class="ratio-fill ratio-fill-screen" style="--ratio:${screenPct}%"></span><span class="ratio-fill ratio-fill-outside"></span>
      </div>
      <p class="micro-note">${h(ui.hero.ratioNote)} ${screenMin} ${h(ui.stages.minutes)} ${h(ui.hero.screen)} / ${outsideMin} ${h(
        ui.stages.minutes,
      )} ${h(ui.hero.outside)}。</p>
    </div>`;
};

const hero = (locale, ui) => {
  const lesson = data.lessons.find((item) => item.id === data.selectedLessonId);
  return `
    <section class="hero-section section-band" id="top">
      <div class="hero-inner">
        <div class="hero-copy">
          <p class="eyebrow">${h(ui.hero.eyebrow)}</p>
          <h1 class="balanced-title">${titleMarkup(ui.hero.title, locale, 'hero')}</h1>
          <p class="hero-lede">${h(ui.hero.lede)}</p>
          <div class="hero-actions">
            <a class="button button-primary" href="#try">${icon('arrow')} ${h(ui.hero.primary)}</a>
            <a class="button button-quiet" href="${github}" target="_blank" rel="noreferrer">${icon('external')} ${h(
              ui.hero.secondary,
            )}</a>
          </div>
          <p class="hero-meta">${h(ui.hero.meta)}</p>
          <div class="hero-stat-line" aria-label="${attr(
            `${data.stats.lessons} ${ui.stages.lessons}, ${data.stats.stages} ${ui.stages.stageLabel}, ${data.stats.activities} ${ui.activities.title}`,
          )}">
            <span><strong>${data.stats.lessons}</strong> ${h(ui.stages.lessons)}</span>
            <span><strong>${data.stats.stages}</strong> ${h(ui.stages.stageLabel)}</span>
            <span><strong>${data.stats.activities}</strong> ${h(locale === 'zh' ? '个活动' : 'activities')}</span>
          </div>
        </div>
        ${heroScene(ui)}
      </div>
      ${ratioBar(lesson, ui, locale)}
    </section>`;
};

const principles = (locale, ui) => `
  <section class="section-band paper-band" id="principles">
    <div class="content-wrap">
      ${sectionHeader(locale, ui.principles.eyebrow, ui.principles.title, ui.principles.lede, 'principles')}
      <div class="seed-grid">
        ${ui.principles.items
          .map(
            (item, index) => `
              <article class="seed-packet">
                <button type="button" class="seed-button" aria-expanded="false" aria-controls="seed-panel-${index}" data-seed-toggle>
                  <span class="seed-fold" aria-hidden="true"></span>
                  <span class="seed-number">${String(index + 1).padStart(2, '0')}</span>
                  ${seedArt(index)}
                  <span class="seed-label">${h(item.label)}</span>
                  <span class="seed-plus" aria-hidden="true">+</span>
                </button>
                <div class="seed-panel" id="seed-panel-${index}" hidden>
                  <h3>${h(item.title)}</h3>
                  <p>${h(item.body)}</p>
                  <a href="${doc('docs/research/evidence-review.md', index === 0 ? '#31-视频缺陷--迁移缺陷强' : index === 1 ? '#91-总体定位' : index === 2 ? '#4-语言中文母语--英语启蒙' : index === 3 ? '#4-语言中文母语--英语启蒙' : '#5-数学启蒙')}" target="_blank" rel="noreferrer">${h(
                    ui.principles.evidence,
                  )} <span aria-hidden="true">↗</span></a>
                </div>
              </article>`,
          )
          .join('')}
      </div>
      <p class="source-note"><span class="source-dot"></span>${h(
        locale === 'zh'
          ? `内置内容包含 ${data.stats.lessons} 节课、${data.stats.stages} 个阶段、${data.stats.activities} 个活动和 ${data.stats.wordEntries} 条词条。`
          : `The built-in pack includes ${data.stats.lessons} lessons, ${data.stats.stages} stages, ${data.stats.activities} activities, and ${data.stats.wordEntries} word entries.`,
      )}</p>
    </div>
  </section>`;

const stagesSection = (locale, ui) => `
  <section class="section-band" id="stages">
    <div class="content-wrap">
      ${sectionHeader(locale, ui.stages.eyebrow, ui.stages.title, ui.stages.lede, 'stages')}
      <div class="stage-browser">
        ${stageScale(locale, ui)}
        <div class="stage-panels">
          ${data.stages.map((stage, index) => stagePanel(stage, locale, ui, index)).join('')}
        </div>
      </div>
    </div>
  </section>`;

const lessonSection = (locale, ui) => {
  const lesson = data.lessons.find((item) => item.id === data.selectedLessonId);
  const isEnglish = locale === 'en';
  const vehicleUi = ui.lessonVehiclesEn;
  const intro = isEnglish ? vehicleUi.intro : lesson.parentGuide.intro;
  const tips = isEnglish ? vehicleUi.tips : lesson.parentGuide.tips || [];
  const phrases = isEnglish
    ? vehicleUi.phrases.map(([enText]) => ({ en: enText }))
    : lesson.parentGuide.phrases || [];
  const offline = lesson.offline[0];
  const offlineTitle = isEnglish ? vehicleUi.offlineTitle : offline.title;
  const offlineMaterials = isEnglish ? vehicleUi.materials : offline.materials || [];
  const offlineSteps = isEnglish ? vehicleUi.steps : offline.steps;
  const offlineSafety = isEnglish ? vehicleUi.safety : offline.safety;
  const offlineQuestion = isEnglish ? vehicleUi.question : offline.question;
  const easier = isEnglish ? vehicleUi.easier : offline.levels?.easier;
  const harder = isEnglish ? vehicleUi.harder : offline.levels?.harder;
  const why = isEnglish ? vehicleUi.why : lesson.parentGuide.why;
  const refs = lesson.parentGuide.refs || [];
  const conceptMap = new Map(data.selectedConcepts.map((concept) => [concept.id, concept]));
  const cards = lesson.printables?.find((item) => item.kind === 'cards')?.items || [];
  const referenceByNumber = new Map(data.references.map((reference) => [String(reference.number), reference]));
  return `
    <section class="section-band paper-band lesson-band" id="lesson">
      <div class="content-wrap">
        ${sectionHeader(locale, ui.lesson.eyebrow, ui.lesson.title, ui.lesson.lede, 'lesson')}
        <div class="lesson-meta-row">
          <span class="source-chip">${h(locale === 'zh' ? '内置课程示例' : 'Built-in lesson')}</span>
          <span>${h(rangeAge(lesson.ageRange, locale))}</span>
          <span>${lesson.durationMin} ${h(ui.stages.minutes)}</span>
          <span>${h(isEnglish ? 'parent guidance' : '家长指引')}</span>
        </div>
        <div class="lesson-fold">
          <div class="fold-step fold-step-intro">
            <div class="fold-index">01</div>
            <div class="fold-content">
              <div class="subsection-label">${h(ui.lesson.parentFirst)} <span class="under-note">${h(ui.lesson.parentFirstNote)}</span></div>
              <p class="large-copy">${h(intro)}</p>
              <ul class="tip-row">${tips
                .map((tip) => `<li><span class="tiny-leaf" aria-hidden="true">⌁</span>${h(tip)}</li>`)
                .join('')}</ul>
            </div>
          </div>
          <div class="fold-step">
            <div class="fold-index">02</div>
            <div class="fold-content">
              <div class="subsection-label">${h(ui.lesson.phrases)}</div>
              <div class="phrase-list">
                ${phrases
                  .map(
                    (phrase, index) => `
                      <div class="phrase-row">
                        <div><strong>${h(localized(phrase, locale))}</strong>${
                          phrase.en && locale === 'zh' ? `<span>${h(phrase.en)}</span>` : ''
                        }</div>
                        <button type="button" class="speak-button" data-speak="${attr(
                          localized(phrase, locale),
                        )}" data-speak-lang="${locale === 'zh' ? 'zh-CN' : 'en-US'}" aria-label="${attr(
                          `${ui.lesson.listen}: ${localized(phrase, locale)}`,
                        )}">${icon('volume')}<span>${h(ui.lesson.listen)}</span></button>
                      </div>`,
                  )
                  .join('')}
              </div>
            </div>
          </div>
          <div class="fold-step offline-step">
            <div class="fold-index">03</div>
            <div class="fold-content">
              <div class="subsection-label">${h(ui.lesson.offline)} <span class="under-note">${h(offlineTitle)}</span></div>
              <div class="offline-grid">
                <div>
                  <h3>${h(ui.lesson.materials)}</h3>
                  <ul class="plain-list">${offlineMaterials.map((item) => `<li>${h(item)}</li>`).join('')}</ul>
                  <h3>${h(ui.lesson.steps)}</h3>
                  <ol class="numbered-list">${offlineSteps.map((item) => `<li>${h(item)}</li>`).join('')}</ol>
                </div>
                <div class="safety-note">
                  <span class="safety-icon" aria-hidden="true">!</span>
                  <div><h3>${h(ui.lesson.safety)}</h3><p>${h(offlineSafety)}</p></div>
                </div>
              </div>
              <div class="levels-row">
                <div><span>${h(ui.lesson.easier)}</span><p>${h(easier)}</p></div>
                <div><span>${h(ui.lesson.harder)}</span><p>${h(harder)}</p></div>
              </div>
              ${offlineQuestion ? `<p class="question-note"><span>?</span>${h(offlineQuestion)}</p>` : ''}
            </div>
          </div>
          <div class="fold-step print-step">
            <div class="fold-index">04</div>
            <div class="fold-content">
              <div class="subsection-label">${h(ui.lesson.printables)} <span class="under-note">${h(ui.lesson.printNote)}</span></div>
              <div class="print-card-grid">
                ${cards
                  .map((conceptId) => {
                    const concept = conceptMap.get(conceptId);
                    const image = data.selectedIllustrations.find((item) => item.sourcePath === concept?.image);
                    if (!concept || !image) return '';
                    return `
                      <article class="print-card" data-print-card>
                        <img src="${attr(`${
                          locale === 'zh' ? './' : '../'
                        }assets/illustrations/${image.file}`)}" alt="${attr(localized(concept, locale))}" width="150" height="150">
                        <div><strong>${h(localized(concept, locale))}</strong>${
                          locale === 'zh' ? `<span>${h(localized(concept, 'en'))}</span>` : ''
                        }</div>
                        <button type="button" class="print-one" data-print-one>${icon('print')}<span>${h(ui.lesson.print)}</span></button>
                      </article>`;
                  })
                  .join('')}
              </div>
            </div>
          </div>
          <div class="fold-step why-step">
            <div class="fold-index">05</div>
            <div class="fold-content">
              <div class="subsection-label">${h(ui.lesson.why)}</div>
              <div class="why-box"><span class="quote-mark" aria-hidden="true">“</span><p>${h(why)}</p></div>
              <div class="ref-chips">
                ${refs
                  .map((ref) => {
                    const number = String(ref).replace(/\D/g, '');
                    const reference = referenceByNumber.get(number);
                    return `<a class="ref-chip" href="${attr(reference?.url || doc('docs/research/evidence-review.md', '#10-参考文献'))}" target="_blank" rel="noreferrer" title="${attr(
                      reference?.title || '',
                    )}">${h(ref)}</a>`;
                  })
                  .join('')}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>`;
};

const activitiesSection = (locale, ui) => `
  <section class="section-band" id="activities">
    <div class="content-wrap">
      ${sectionHeader(locale, ui.activities.eyebrow, ui.activities.title, ui.activities.lede, 'activities')}
      <div class="activity-grid">
        ${data.activities
          .map(
            (activity, index) => `
              <article class="activity-card activity-${attr(activity.type)}" style="--activity-index:${index}">
                <div class="activity-art">${activityArt(activity.type)}</div>
                <div class="activity-card-body">
                  <div class="activity-title-row"><h3>${h(localized(activity.title, locale))}</h3><span class="activity-index">${String(
                    index + 1,
                  ).padStart(2, '0')}</span></div>
                  <p>${h(ui.activities.descriptions[activity.type] || '')}</p>
                  <div class="activity-meta"><span>${h(ui.activities.type)} <code>${h(activity.type)}</code></span><span>${h(
                    ui.activities.age,
                  )} ${h(rangeAge(activity.ageRange, locale))}</span></div>
                </div>
              </article>`,
          )
          .join('')}
      </div>
      <div class="plugin-callout">
        <div><span class="callout-mark" aria-hidden="true">.</span><strong>${h(
          locale === 'zh' ? '第三方活动也要守住边界。' : 'Third-party activities keep the same boundaries.',
        )}</strong><p>${h(
          locale === 'zh'
            ? 'type 必须带命名空间，例如 example.hello-stars；宿主负责焦点、计时、家长门和资源。'
            : 'Types are namespaced, such as example.hello-stars; the host owns focus, timing, the parent gate, and resources.',
        )}</p></div>
        ${link(doc('docs/dev/plugin-guide.md'), ui.activities.pluginGuide, 'text-link')}
      </div>
    </div>
  </section>`;

const homeIllustration = (ui) => `
  <svg class="home-map" viewBox="0 0 760 380" role="img" aria-labelledby="home-map-title home-map-desc">
    <title id="home-map-title">${h(ui.home.title)}</title>
    <desc id="home-map-desc">${h(ui.home.lede)}</desc>
    <path d="M26 315h708" stroke="#c9ae83" stroke-width="3" stroke-linecap="round" stroke-dasharray="2 11"/>
    <path d="M56 313V122l92-62 92 62v191Z" fill="#fffaf2" stroke="#6f5b45" stroke-width="4"/>
    <path d="m47 126 101-72 101 72" fill="none" stroke="#6f5b45" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M56 238h184M56 174h184" stroke="#dec9aa" stroke-width="3"/>
    <path d="M148 122v190" stroke="#dec9aa" stroke-width="3"/>
    <rect x="72" y="86" width="48" height="34" rx="4" fill="#dff1fb" stroke="#6f5b45" stroke-width="3"/>
    <path d="M96 86v34M72 103h48" stroke="#6f5b45" stroke-width="2"/>
    <path d="M162 286q34-15 66 0v18h-66Z" fill="#e6f4d7" stroke="#6c9a3b" stroke-width="2"/>
    <path d="M169 269h44q7 0 7 8v10h-58v-10q0-8 7-8Z" fill="#f08a5d" stroke="#6f5b45" stroke-width="3"/>
    <path d="M221 263v-25M211 238h20l-4 9h-12Z" fill="#f4c36a" stroke="#6f5b45" stroke-width="2"/>
    <rect x="80" y="190" width="67" height="47" rx="7" fill="#1f2a44" stroke="#6f5b45" stroke-width="3"/>
    <rect x="88" y="198" width="51" height="31" rx="3" fill="#dff1fb"/>
    <path d="M93 222q15-15 27-3t20-6" fill="none" stroke="#6c9a3b" stroke-width="3"/>
    <rect x="166" y="201" width="39" height="31" rx="6" fill="#f3ead9" stroke="#6f5b45" stroke-width="3"/>
    <circle cx="185" cy="214" r="8" fill="#ffc93c"/>
    <text x="84" y="260" class="map-label">${h(ui.home.server)}</text>
    <text x="84" y="279" class="map-small">${h(ui.home.serverDetail)}</text>
    <rect x="300" y="159" width="154" height="111" rx="17" fill="#66806a" stroke="#3b3226" stroke-width="5"/>
    <rect x="317" y="176" width="112" height="68" rx="8" fill="#1f2a44"/>
    <path d="M347 262h61M359 269h37" stroke="#3b3226" stroke-width="5" stroke-linecap="round"/>
    <text x="323" y="292" class="map-label">${h(ui.home.tv)}</text>
    <text x="323" y="311" class="map-small">${h(ui.home.tvDetail)}</text>
    <rect x="493" y="203" width="64" height="91" rx="9" fill="#d7eff5" stroke="#6f5b45" stroke-width="4"/>
    <circle cx="525" cy="281" r="4" fill="#6f5b45"/>
    <path d="M508 220h34M508 228h22" stroke="#5da9e9" stroke-width="4" stroke-linecap="round"/>
    <text x="488" y="318" class="map-label">${h(ui.home.tablet)}</text>
    <text x="488" y="337" class="map-small">${h(ui.home.tabletDetail)}</text>
    <rect x="620" y="218" width="52" height="90" rx="10" fill="#f08a5d" stroke="#6f5b45" stroke-width="4"/>
    <rect x="628" y="230" width="36" height="58" rx="3" fill="#fffaf2"/>
    <circle cx="646" cy="296" r="4" fill="#fffaf2"/>
    <text x="604" y="331" class="map-label">${h(ui.home.phone)}</text>
    <text x="604" y="350" class="map-small">${h(ui.home.phoneDetail)}</text>
    <path class="network-line" d="M211 215C254 196 268 198 302 209"/>
    <path class="network-line network-line-delay" d="M454 218C475 220 481 235 493 243"/>
    <path class="network-line network-line-delay-2" d="M557 248C581 241 596 249 621 259"/>
    <circle class="network-node" cx="256" cy="204" r="5" fill="#ffc93c"/>
    <circle class="network-node network-node-delay" cx="479" cy="229" r="5" fill="#ffc93c"/>
    <circle class="network-node network-node-delay-2" cx="588" cy="248" r="5" fill="#ffc93c"/>
  </svg>`;

const homeSection = (locale, ui) => `
  <section class="section-band paper-band" id="home">
    <div class="content-wrap">
      ${sectionHeader(locale, ui.home.eyebrow, ui.home.title, ui.home.lede, 'home')}
      <div class="home-layout">
        <div class="home-illustration">${homeIllustration(ui)}</div>
        <div class="home-points">
          ${ui.home.points
            .map(
              (point, index) => `
                <article class="home-point"><span class="home-point-number">${String(index + 1).padStart(2, '0')}</span><div><h3>${h(
                  point.title,
                )}</h3><p>${h(point.body)}</p></div></article>`,
            )
            .join('')}
          <div class="home-doc-links">
            ${link(doc('docs/deploy/README.md'), ui.home.docs.docker)}
            ${link(doc('deploy/macos/install.sh'), ui.home.docs.macos)}
            ${link(doc('docs/deploy/README.md', '#android-tv'), ui.home.docs.android)}
            ${link(doc('docs/deploy/README.md', '#ipad'), ui.home.docs.ipad)}
          </div>
        </div>
      </div>
    </div>
  </section>`;

const trySection = (locale, ui) => {
  const demoSrc = locale === 'zh' ? './demo/?lang=zh' : '../demo/?lang=en';
  return `
  <section class="section-band try-band" id="try">
    <div class="content-wrap">
      ${sectionHeader(locale, ui.try.eyebrow, ui.try.title, ui.try.lede, 'try')}
      <div class="try-layout">
        <div class="try-tv-wrap">
          <div class="try-tv" data-demo-shell>
            <div class="try-tv-screen" data-demo-screen>
              <span class="off-screen-label">${h(ui.try.offLabel)}</span>
              <div class="demo-loading" data-demo-loading hidden>${icon('spark')}<span>...</span></div>
            </div>
            <div class="tv-speaker" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
            <button class="power-button" type="button" data-demo-power aria-label="${attr(ui.try.power)}"><span>⏻</span></button>
          </div>
          <div class="try-tv-stand" aria-hidden="true"></div>
          <div class="time-note" data-demo-note hidden>
            <span class="tape-corner" aria-hidden="true"></span>
            <p>${h(ui.try.tenMinuteNote)}</p>
            <button type="button" data-demo-close>${h(ui.try.tenMinuteAction)}</button>
          </div>
        </div>
        <div class="try-aside">
          <div class="try-actions">
            <button class="button button-primary" type="button" data-demo-open>${icon('arrow')} ${h(ui.try.power)}</button>
            <a class="button button-quiet" href="${attr(demoSrc)}" target="_blank" rel="noreferrer">${icon('external')} ${h(
              ui.try.fullscreen,
            )}</a>
          </div>
          <ul class="try-tips">
            <li><span>01</span>${h(ui.try.tip1)}</li>
            <li><span>02</span>${h(ui.try.tip2)}</li>
            <li><span>03</span>${h(ui.try.tip3)}</li>
          </ul>
          <p class="demo-availability">${h(
            locale === 'zh' ? '这是浏览器内的轻量演示，不连接家庭服务器。' : 'This is a small browser demo and does not connect to a family server.',
          )}</p>
        </div>
      </div>
    </div>
  </section>`;
};

const tradeoffs = {
  zh: {
    '1': '把屏幕放在优先级最后：2 岁前不建议久坐屏幕，先保留阅读、讲故事和互动游戏。',
    '3': '把 18 月龄以下做成家长工具；如引入数字媒体，要高质量、共看、不独看。',
    '6': '把两岁以内的屏幕留空，并设餐桌、卧室和单次时长边界。',
    '8': '以回应性照护和早期学习机会为主，避免把屏幕当作儿童的“玩伴”。',
    '11': '默认更接近 0–3 岁禁用，鼓励户外，并减少家长在孩子面前使用电子产品。',
    '15': '把视频设计成提示而不是答案，给小月龄留出从二维画面回到现实的距离。',
    '25': '把家长回应放在共看的中心：停下来、接住孩子，再继续。',
    '37': '把每节课接到真实对话，避免屏幕挤走成人词、儿童发声和回合对话。',
    '47': '用儿向语言和更多回合对话做真实输入，不把录播当作语言环境。',
    '80': '每个屏幕引子都接一个有目标、有支架、由孩子参与的游戏。',
    '96': '交互要主动、投入、有意义，并且把社会互动留在设计里。',
    '101': '用自然结束点让离开屏幕更平滑，而不是用自动连播把人留下。',
    '105': '拒绝挽留、奖励和退出障碍；离开应该和进入一样容易。'
  },
  en: {
    '1': 'Keep screens last in the priority order: under two, protect reading, stories, and shared play.',
    '3': 'Make under-18-month content an adult tool; if media is introduced, keep it high-quality and shared.',
    '6': 'Leave screen time empty for the first two years, with boundaries around meals, bedrooms, and session length.',
    '8': 'Center responsive care and early learning opportunities instead of treating a screen as a playmate.',
    '11': 'Use the stricter 0–3 default as the starting point, with outdoor time and less parental phone use around children.',
    '15': 'Use video as a prompt, not an answer, and leave younger children room to transfer back to real life.',
    '25': 'Put the parent response at the center of co-viewing: pause, notice, then continue.',
    '37': 'Connect every lesson to real conversation so screens do not crowd out adult words and conversational turns.',
    '47': 'Use child-directed speech and more conversational turns as the real language input.',
    '80': 'Attach each screen prompt to guided play with a goal, support, and child participation.',
    '96': 'Make interaction active, engaged, meaningful, and socially interactive.',
    '101': 'Use a natural stopping point so leaving the screen is easier than being pulled into another episode.',
    '105': 'Reject retention tricks, rewards, and exit barriers; leaving should be as easy as entering.'
  }
};

const evidenceSection = (locale, ui) => {
  const featured = [1, 3, 6, 8, 11, 15, 25, 37, 47, 80, 96, 101, 105];
  const references = featured.map((number) => data.references.find((reference) => reference.number === number)).filter(Boolean);
  return `
  <section class="section-band" id="evidence">
    <div class="content-wrap">
        ${sectionHeader(locale, ui.evidence.eyebrow, ui.evidence.title, ui.evidence.lede, 'evidence')}
      <div class="evidence-intro"><strong>${data.stats.evidenceReferences}</strong> ${h(ui.evidence.referenceCount)}<span>·</span><span>${h(
        locale === 'zh' ? '参考文献数量' : 'Reference list count',
      )}</span></div>
      <div class="library-grid">
        ${references
          .map(
            (reference, index) => `
              <article class="library-card">
                <div class="library-card-top"><span class="card-number">${String(index + 1).padStart(2, '0')}</span><span class="card-year">${
                  reference.year || ''
                }</span></div>
                <h3>${h(locale === 'en' ? ui.referenceTitles?.[String(reference.number)] || reference.title : reference.title)}</h3>
                <p><span>${h(ui.evidence.tradeoff)}：</span>${h(tradeoffs[locale][String(reference.number)] || '')}</p>
                ${reference.url ? link(reference.url, ui.evidence.readOriginal, 'text-link') : ''}
              </article>`,
          )
          .join('')}
      </div>
    </div>
  </section>`;
};

const devCode = (locale, ui) => {
  const snippets =
    locale === 'zh'
      ? {
          quickstart: `corepack enable
export pnpm_config_verify_deps_before_run=false
pnpm install

# 构建工作区应用
pnpm build

# 启动服务端
pnpm start`,
          content: `content/examples/hello-pack/
  pack.json
  lexicon.json
  assets/
  routes/hello-route.json
  lessons/hello.s1.shapes.json

pnpm content:typecheck
pnpm content:validate --pack content/examples/hello-pack --strict`,
          plugin: `{
  "id": "example.hello",
  "entry": "index.js",
  "activities": [{
    "type": "example.hello-stars"
  }]
}

// mount(el, ctx) -> ActivityInstance
// 清理 DOM、事件、计时器和声音`,
        }
      : {
          quickstart: `corepack enable
export pnpm_config_verify_deps_before_run=false
pnpm install

pnpm build
pnpm start`,
          content: `content/examples/hello-pack/
  pack.json
  lexicon.json
  assets/
  routes/hello-route.json
  lessons/hello.s1.shapes.json

pnpm content:typecheck
pnpm content:validate --pack content/examples/hello-pack --strict`,
          plugin: `{
  "id": "example.hello",
  "entry": "index.js",
  "activities": [{
    "type": "example.hello-stars"
  }]
}

// mount(el, ctx) -> ActivityInstance
// Clean DOM, events, timers, and sound`,
        };
  return snippets;
};

const developersSection = (locale, ui) => {
  const snippets = devCode(locale, ui);
  const map = `apps/
  server/                 Fastify + SQLite
  admin/                  Parent area · React + Ant Design
  player/                 TV / iPad player
packages/
  schema/                 Zod data contracts
  core/                   scheduler + screen policy
  plugin-sdk/             activity contract + tokens
  activities/             17 built-in activities
content/packs/             sprout-core
plugins/examples/          namespaced plugin examples`;
  return `
  <section class="section-band paper-band" id="developers">
    <div class="content-wrap">
      ${sectionHeader(locale, ui.dev.eyebrow, ui.dev.title, ui.dev.lede, 'developers')}
      <div class="dev-layout">
        <div>
          <div class="subsection-label">${h(ui.dev.mapTitle)}</div>
          <pre class="repo-map"><code>${h(map)}</code></pre>
          <div class="tech-badges">${ui.dev.badges.map((badge) => `<span>${h(badge)}</span>`).join('')}</div>
        </div>
        <div class="dev-tabs-wrap">
          <div class="dev-tabs" role="tablist" aria-label="${attr(ui.dev.title)}">
            ${Object.entries(ui.dev.tabs)
              .map(
                ([key, label], index) =>
                  `<button type="button" role="tab" aria-selected="${index === 0}" aria-controls="dev-panel-${key}" data-dev-tab="${key}">${h(
                    label,
                  )}</button>`,
              )
              .join('')}
          </div>
          <div class="dev-panels">
            ${Object.keys(ui.dev.tabs)
              .map(
                (key, index) => `
                  <div class="dev-panel" id="dev-panel-${key}" role="tabpanel" data-dev-panel="${key}" ${
                    index === 0 ? '' : 'hidden'
                  }>
                    <button type="button" class="copy-button" data-copy-target="dev-code-${key}">${icon('copy')}<span data-copy-label>${h(
                      ui.dev.copy,
                    )}</span></button>
                    <pre><code id="dev-code-${key}">${h(snippets[key])}</code></pre>
                  </div>`,
              )
              .join('')}
          </div>
        </div>
      </div>
      <div class="release-license-grid">
        <div class="release-card">
          <span class="eyebrow">${h(ui.dev.release)}</span>
          <h3>v0.0.1</h3>
          <p>${h(ui.dev.releaseNote)}</p>
          <div class="release-links">
            ${link(releaseUrl, ui.dev.apk)}
            ${link(releaseUrl, ui.dev.pack)}
          </div>
        </div>
        <div class="license-card">
          <span class="eyebrow">${h(ui.dev.license)}</span>
          <p>${h(ui.dev.licenseBody)}</p>
          <div class="license-links">
            ${link(`${github}/blob/main/LICENSE`, 'LICENSE')}
            ${link(`${github}/blob/main/CONTENT-LICENSE.md`, 'CONTENT-LICENSE.md')}
          </div>
          <p class="micro-note">${h(ui.dev.fontCredit)}</p>
        </div>
      </div>
    </div>
  </section>`;
};

const faqSection = (locale, ui) => `
  <section class="section-band" id="faq">
    <div class="content-wrap narrow-content">
      ${sectionHeader(locale, ui.faq.eyebrow, ui.faq.title, '', 'faq')}
      <div class="faq-list">
        ${ui.faq.items
          .map(
            (item, index) => `
              <details class="faq-item" ${index === 0 ? 'open' : ''}>
                <summary><span>${h(item.q)}</span><b aria-hidden="true">+</b></summary>
                <p>${h(item.a)}</p>
              </details>`,
          )
          .join('')}
      </div>
    </div>
  </section>`;

const body = (locale, ui) =>
  `${hero(locale, ui)}
  ${principles(locale, ui)}
  ${stagesSection(locale, ui)}
  ${lessonSection(locale, ui)}
  ${activitiesSection(locale, ui)}
  ${homeSection(locale, ui)}
  ${trySection(locale, ui)}
  ${evidenceSection(locale, ui)}
  ${developersSection(locale, ui)}
  ${faqSection(locale, ui)}`;

const replacementMap = (locale, ui, bodyHtml) => {
  const isZh = locale === 'zh';
  const pageUrl = isZh ? publicRoot : `${publicRoot}en/`;
  const assetPrefix = isZh ? './' : '../';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: '芽芽成长 Sprout',
    applicationCategory: 'EducationalApplication',
    operatingSystem: 'Web, Android, iOS',
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
    description: ui.description,
    url: pageUrl,
    softwareVersion: '0.0.1',
    license: `${github}/blob/main/LICENSE`,
  };
  const values = {
    lang: ui.lang,
    pageLang: locale,
    title: ui.title,
    description: ui.description,
    canonical: pageUrl,
    zhUrl: publicRoot,
    enUrl: `${publicRoot}en/`,
    ogLocale: isZh ? 'zh_CN' : 'en_US',
    ogImage: `${publicRoot}assets/${isZh ? 'og.png' : 'og-en.png'}`,
    assetPrefix,
    jsonld: escapeJson(jsonLd),
    body: bodyHtml,
    skipLabel: isZh ? '跳到主要内容' : 'Skip to main content',
    brandLabel: '芽芽成长 Sprout',
    navLabel: isZh ? '主导航' : 'Primary navigation',
    navPrinciples: ui.nav.principles,
    navStages: ui.nav.stages,
    navLesson: ui.nav.lesson,
    navActivities: ui.nav.activities,
    navHome: ui.nav.home,
    navTry: ui.nav.try,
    navDev: ui.nav.dev,
    switchLang: isZh ? 'en' : 'zh-CN',
    languageUrl: isZh ? './en/' : '../',
    languageText: ui.nav.language,
    languageLabel: isZh ? 'Switch to English' : '切换到中文',
    themeLabel: ui.nav.theme,
    themeLight: ui.footer.themeOptions.light,
    themeDark: ui.footer.themeOptions.dark,
    themeSystem: ui.footer.themeOptions.system,
    menuLabel: isZh ? '打开菜单' : 'Open menu',
    homeUrl: assetPrefix,
    footerDisclaimer: ui.footer.disclaimer,
    footerFocus: ui.footer.focus,
    footerCredits: ui.footer.credits,
    footerRelease: ui.footer.release,
    footerDocs: ui.footer.docs,
    projectGuide: locale === 'zh' ? '项目说明' : 'Project guide',
    footerMade: ui.footer.made,
  };
  return Object.entries(values).reduce((html, [key, value]) => html.replaceAll(`{{${key}}}`, String(value)), template);
};

const write = (relativePath, value) => {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
};

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 180 180"><rect width="180" height="180" rx="42" fill="#fdf6ec"/><path d="M90 143c-3-29 0-48 14-69" fill="none" stroke="#548e5b" stroke-width="14" stroke-linecap="round"/><path d="M91 104C62 105 39 84 42 57c31-2 51 18 49 47Z" fill="#98c968" stroke="#3b3226" stroke-width="7"/><path d="M102 95c-1-34 21-56 54-53 4 31-17 56-54 53Z" fill="#77b77d" stroke="#3b3226" stroke-width="7"/><circle cx="130" cy="48" r="6" fill="#f08a5d"/></svg>`;
write('assets/favicon.svg', faviconSvg);
write(
  'assets/site.webmanifest',
  `${JSON.stringify(
    {
      name: '芽芽成长 Sprout',
      short_name: 'Sprout',
      start_url: '../',
      scope: '../',
      display: 'standalone',
      background_color: '#fdf6ec',
      theme_color: '#fdf6ec',
      icons: [{ src: './favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
    },
    null,
    2,
  )}\n`,
);
fs.mkdirSync(path.join(root, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'src/site.css'), path.join(root, 'assets/site.css'));
fs.copyFileSync(path.join(root, 'src/site.js'), path.join(root, 'assets/site.js'));

for (const [locale, ui] of Object.entries(locales)) {
  const html = replacementMap(locale, ui, body(locale, ui));
  write(locale === 'zh' ? 'index.html' : 'en/index.html', html);
}

const notFound = replacementMap(
  'zh',
  {
    ...zh,
    title: '芽芽成长 Sprout · 这一页还在发芽',
    description: '这一页还在发芽。回到芽芽成长首页。',
  },
  `<section class="not-found-section"><div class="not-found-art" aria-hidden="true"><span class="soil"></span><span class="tiny-sprout"></span></div><p class="eyebrow">404 · 这一页还在发芽</p><h1>找不到这片叶子。</h1><p>可能是链接还没长好，也可能只是走错了小路。</p><div class="not-found-actions"><a class="button button-primary" href="./">回到首页 ${icon('arrow')}</a><a class="button button-quiet" href="./en/">English</a></div></section>`,
);
write('404.html', notFound);

// 只有在还没有放入播放端演示构建（demo/sw.js）时才写占位页，避免覆盖真实演示
if (!fs.existsSync(path.join(root, 'demo', 'sw.js'))) write(
  'demo/index.html',
  `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>芽芽成长 Sprout · 浏览器演示</title><style>:root{color-scheme:light;background:#fdf6ec;color:#3b3226;font-family:"PingFang SC","Microsoft YaHei",system-ui,sans-serif}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,#fffaf2 0 18%,#fdf6ec 54%,#f3ead9 100%)}main{max-width:34rem;padding:3rem 2rem;text-align:center}svg{width:88px;height:88px;margin-bottom:1.5rem}h1{font-size:clamp(1.8rem,6vw,3.2rem);font-weight:600;line-height:1.15;margin:.3rem 0 1rem}p{color:#7a6a55;line-height:1.8}a{display:inline-flex;margin-top:1rem;color:#3b3226;border-bottom:2px solid #ffc93c;text-decoration:none;padding:.4rem .1rem}.en{display:none}</style></head><body><main><svg viewBox="0 0 100 100" aria-hidden="true"><path d="M50 82c-2-17 0-29 8-43" fill="none" stroke="#6c9a3b" stroke-width="8" stroke-linecap="round"/><path d="M51 59C34 59 21 47 23 31c18-2 30 10 28 28Z" fill="#98c968" stroke="#3b3226" stroke-width="3"/><path d="M57 54c-1-20 12-33 31-31 2 18-10 33-31 31Z" fill="#77b77d" stroke="#3b3226" stroke-width="3"/></svg><p>SPROUT · DEMO</p><h1><span class="zh">浏览器演示</span><span class="en">Browser demo</span></h1><p><span class="zh">这是一个安静的本地演示。数据留在浏览器，朗读使用浏览器自带语音。</span><span class="en">A quiet local demo. Data stays in this browser and speech uses the browser.</span></p><a href="../"><span class="zh">回到芽芽成长首页 →</span><span class="en">Back to Sprout home →</span></a></main><script>const en=new URLSearchParams(location.search).get("lang")==="en";document.documentElement.lang=en?"en":"zh-CN";document.querySelectorAll(".zh").forEach((el)=>el.style.display=en?"none":"inline");document.querySelectorAll(".en").forEach((el)=>el.style.display=en?"inline":"none");</script></body></html>`,
);

write(
  'robots.txt',
  `User-agent: *\nAllow: /\nSitemap: ${publicRoot}sitemap.xml\n`,
);
write(
  'sitemap.xml',
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${publicRoot}</loc></url><url><loc>${publicRoot}en/</loc></url></urlset>\n`,
);

const chromeCandidates = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean);
const chrome = chromeCandidates.find((candidate) => fs.existsSync(candidate));
const renderSvgPng = (filename, svg, width = 1200, height = 630) => {
  const svgPath = path.join(root, `assets/.${filename}.svg`);
  const pngPath = path.join(root, `assets/${filename}.png`);
  write(`assets/.${filename}.svg`, svg);
  if (chrome) {
    execFileSync(
      chrome,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--hide-scrollbars',
        '--force-device-scale-factor=1',
        `--window-size=${width},${height}`,
        `--screenshot=${pngPath}`,
        pathToFileURL(svgPath).href,
      ],
      { stdio: 'ignore' },
    );
  } else {
    throw new Error('Chrome is required to render OG images. Set CHROME_BIN to a local Chrome binary.');
  }
  fs.rmSync(svgPath, { force: true });
};
const og = (english = false) => {
  const title = english ? 'A screen can open the door.' : '屏幕只做引子，成长发生在你们之间。';
  const sub = english ? 'Sprout · open-source family learning · 6 months–3 years' : '芽芽成长 Sprout · 开源亲子共学 · 6 个月–3 岁';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><defs><linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#fdf6ec"/><stop offset="1" stop-color="#e6f4d7"/></linearGradient><radialGradient id="glow"><stop stop-color="#ffc93c" stop-opacity=".55"/><stop offset="1" stop-color="#ffc93c" stop-opacity="0"/></radialGradient></defs><rect width="1200" height="630" fill="url(#bg)"/><circle cx="850" cy="300" r="240" fill="url(#glow)"/><path d="M0 530c220-80 390-42 590-70 230-33 405-88 610-32v202H0Z" fill="#f3ead9"/><g transform="translate(730 105)"><rect x="0" y="120" width="270" height="176" rx="31" fill="#66806a" stroke="#3b3226" stroke-width="8"/><rect x="21" y="141" width="198" height="130" rx="18" fill="#1f2a44"/><circle cx="239" cy="182" r="14" fill="#f2b134" stroke="#3b3226" stroke-width="5"/><path d="M121 250c-6-91 3-115 29-158" fill="none" stroke="#6c9a3b" stroke-width="12" stroke-linecap="round"/><path d="M128 182c-42-2-61-27-57-55 39-5 67 19 57 55Z" fill="#98c968" stroke="#548e5b" stroke-width="5"/><path d="M148 154c0-42 26-67 63-64 4 37-19 66-63 64Z" fill="#77b77d" stroke="#548e5b" stroke-width="5"/><path d="M149 91l10-16 10 17-10 17Z" fill="#f08a5d" stroke="#a45a3e" stroke-width="4"/></g><g fill="#3b3226"><text x="84" y="145" font-family="Arial, sans-serif" font-size="28" letter-spacing="2" fill="#6c9a3b">SPROUT / 芽芽成长</text><text x="80" y="270" font-family="Arial, sans-serif" font-size="${english ? 62 : 58}" font-weight="700">${title}</text><text x="84" y="334" font-family="Arial, sans-serif" font-size="27" fill="#7a6a55">${sub}</text></g><path d="M85 420q152-22 270 0" fill="none" stroke="#c9ae83" stroke-width="5" stroke-linecap="round" stroke-dasharray="2 18"/><text x="84" y="486" font-family="Arial, sans-serif" font-size="24" fill="#7a6a55">${english ? 'Read a prompt. Put the screen down. Play for a while.' : '看一会儿提示，放下屏幕，一起玩一会儿。'}</text></svg>`;
};
renderSvgPng('og', og(false));
renderSvgPng('og-en', og(true));
renderSvgPng('apple-touch-icon', faviconSvg, 180, 180);

console.log(
  JSON.stringify(
    {
      built: ['index.html', 'en/index.html', '404.html', 'demo/index.html', 'robots.txt', 'sitemap.xml'],
      stats: data.stats,
      chrome: Boolean(chrome),
    },
    null,
    2,
  ),
);
