(() => {
  if (window.__sproutNativeRuntime || !window.Capacitor?.registerPlugin) return;
  window.__sproutNativeRuntime = true;
  const screen = window.Capacitor.registerPlugin('SproutScreen');
  let last;
  let queue = Promise.resolve();

  function publish(awake, force = false) {
    if (!force && awake === last) return;
    last = awake;
    // 顺序提交，快速暂停/恢复时最后的状态不能被迟到的调用覆盖。
    queue = queue.then(() => screen.setAwake({ awake })).catch(() => { last = undefined; });
  }

  function update(force = false) {
    const playing = document.querySelector(
      '.lesson-page.phase-playing:not(.guide-dim) .activity-stage[aria-busy="false"]'
    );
    const blocked = document.querySelector('.parent-gate, .pause-overlay');
    publish(!document.hidden && Boolean(playing) && !blocked, force);
  }

  function start() {
    const observer = new MutationObserver(() => update());
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ['class', 'aria-busy'],
    });
    document.addEventListener('visibilitychange', () => update());
    window.addEventListener('sprout:native-resume', () => update(true));
    window.addEventListener('pageshow', () => update(true));
    window.addEventListener('pagehide', () => publish(false, true));
    update();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
