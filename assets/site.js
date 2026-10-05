(() => {
  const doc = document;
  const root = doc.documentElement;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const safeStorage = {
    get(key) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Theme preference is optional; a blocked storage backend should not break the page.
      }
    },
  };

  const systemTheme = () =>
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

  const applyTheme = (preference) => {
    const resolved = preference === 'system' ? systemTheme() : preference;
    root.dataset.theme = resolved;
    root.dataset.themePreference = preference;
    const themeColor = doc.querySelector('meta[name="theme-color"]');
    if (themeColor) themeColor.setAttribute('content', resolved === 'dark' ? '#1f2a44' : '#fdf6ec');
  };

  const savedTheme = safeStorage.get('sprout-theme') || 'system';
  applyTheme(['light', 'dark', 'system'].includes(savedTheme) ? savedTheme : 'system');

  const themeToggle = doc.querySelector('[data-theme-toggle]');
  const themeOptions = doc.querySelector('#theme-options');
  const closeThemeOptions = () => {
    if (!themeOptions || !themeToggle) return;
    themeOptions.hidden = true;
    themeToggle.setAttribute('aria-expanded', 'false');
  };
  themeToggle?.addEventListener('click', () => {
    if (!themeOptions) return;
    themeOptions.hidden = !themeOptions.hidden;
    themeToggle.setAttribute('aria-expanded', String(!themeOptions.hidden));
  });
  doc.querySelectorAll('[data-theme-value]').forEach((button) => {
    button.addEventListener('click', () => {
      const preference = button.getAttribute('data-theme-value') || 'system';
      applyTheme(preference);
      safeStorage.set('sprout-theme', preference);
      closeThemeOptions();
    });
  });
  doc.addEventListener('click', (event) => {
    if (themeOptions?.hidden || themeToggle?.contains(event.target) || themeOptions?.contains(event.target)) return;
    closeThemeOptions();
  });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
    if (root.dataset.themePreference === 'system') applyTheme('system');
  });

  const menuToggle = doc.querySelector('[data-menu-toggle]');
  const mobileMenu = doc.querySelector('[data-mobile-menu]');
  const closeMenu = () => {
    if (!mobileMenu || !menuToggle) return;
    mobileMenu.hidden = true;
    menuToggle.setAttribute('aria-expanded', 'false');
  };
  menuToggle?.addEventListener('click', () => {
    if (!mobileMenu) return;
    mobileMenu.hidden = !mobileMenu.hidden;
    menuToggle.setAttribute('aria-expanded', String(!mobileMenu.hidden));
  });
  mobileMenu?.querySelectorAll('a[href^="#"]').forEach((anchor) => anchor.addEventListener('click', closeMenu));

  const hero = doc.querySelector('[data-hero-scene]');
  const playHero = () => {
    if (!hero || reducedMotion) return;
    hero.classList.remove('is-playing');
    void hero.getBoundingClientRect();
    hero.classList.add('is-playing');
  };
  window.requestAnimationFrame?.(() => window.setTimeout(playHero, 180));
  doc.querySelector('[data-replay-hero]')?.addEventListener('click', playHero);

  const brandLeaves = doc.querySelector('[data-brand-leaves]');
  const sections = [...doc.querySelectorAll('main > section')];
  let leafCount = 0;
  const updateLeaves = () => {
    if (!brandLeaves) return;
    brandLeaves.replaceChildren();
    for (let index = 0; index < Math.min(leafCount, 7); index += 1) {
      const leaf = doc.createElement('span');
      leaf.className = 'brand-leaf';
      leaf.style.transform = `rotate(${index % 2 ? 28 : -28}deg) translateY(${Math.max(0, 4 - index * 0.35)}px)`;
      brandLeaves.append(leaf);
    }
  };
  if ('IntersectionObserver' in window && !reducedMotion) {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || entry.target.dataset.seen === 'true') return;
          entry.target.dataset.seen = 'true';
          leafCount += 1;
          updateLeaves();
        });
      },
      { threshold: 0.35 },
    );
    sections.forEach((section) => sectionObserver.observe(section));
  } else {
    leafCount = Math.min(sections.length, 7);
    updateLeaves();
  }

  doc.querySelectorAll('[data-seed-toggle]').forEach((button) => {
    const panelId = button.getAttribute('aria-controls');
    const panel = panelId ? doc.getElementById(panelId) : null;
    button.addEventListener('click', () => {
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      if (panel) panel.hidden = expanded;
    });
  });

  const stageScale = doc.querySelector('[data-stage-scale]');
  const stagePanels = [...doc.querySelectorAll('[data-stage-panel]')];
  const stageTicks = [...doc.querySelectorAll('[data-stage-select]')];
  const stageSlider = doc.querySelector('[data-stage-slider]');
  const stageCount = stagePanels.length;
  let stageIndex = 0;
  let dragging = false;

  const stageText = (index) => {
    const panel = stagePanels[index];
    const title = panel?.querySelector('h3')?.textContent?.trim() || '';
    const age = panel?.querySelector('.kicker-row')?.textContent?.trim() || '';
    return `${title}${age ? ` · ${age}` : ''}`;
  };

  const setStage = (nextIndex) => {
    if (!stageCount) return;
    stageIndex = Math.max(0, Math.min(stageCount - 1, nextIndex));
    const progress = stageCount === 1 ? 0 : stageIndex / (stageCount - 1);
    stageScale?.style.setProperty('--stage-progress', String(progress));
    stagePanels.forEach((panel, index) => {
      const active = index === stageIndex;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    });
    stageTicks.forEach((tick, index) => tick.classList.toggle('is-current', index === stageIndex));
    if (stageSlider) {
      stageSlider.setAttribute('aria-valuenow', String(stageIndex));
      stageSlider.setAttribute('aria-valuetext', stageText(stageIndex));
    }
  };

  const stageFromPointer = (event) => {
    if (!stageScale || !stageCount) return;
    const rect = stageScale.getBoundingClientRect();
    const mobile = window.matchMedia?.('(max-width: 860px)').matches;
    const raw = mobile ? (event.clientX - rect.left) / rect.width : (event.clientY - rect.top) / rect.height;
    setStage(Math.round(Math.max(0, Math.min(1, raw)) * (stageCount - 1)));
  };

  stageTicks.forEach((tick, index) => tick.addEventListener('click', () => setStage(index)));
  stageSlider?.addEventListener('keydown', (event) => {
    if (['ArrowUp', 'ArrowLeft'].includes(event.key)) {
      event.preventDefault();
      setStage(stageIndex - 1);
    } else if (['ArrowDown', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      setStage(stageIndex + 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setStage(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setStage(stageCount - 1);
    }
  });
  stageSlider?.addEventListener('pointerdown', (event) => {
    dragging = true;
    stageSlider.setPointerCapture?.(event.pointerId);
    stageFromPointer(event);
  });
  stageSlider?.addEventListener('pointermove', (event) => {
    if (dragging) stageFromPointer(event);
  });
  stageSlider?.addEventListener('pointerup', () => {
    dragging = false;
  });
  stageSlider?.addEventListener('pointercancel', () => {
    dragging = false;
  });
  stageScale?.addEventListener('click', (event) => {
    if (event.target === stageScale || event.target === stageScale.querySelector('.scale-rail')) stageFromPointer(event);
  });
  setStage(0);

  const speechSupported = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  doc.querySelectorAll('[data-speak]').forEach((button) => {
    if (!speechSupported) {
      button.hidden = true;
      return;
    }
    button.addEventListener('click', () => {
      const utterance = new SpeechSynthesisUtterance(button.getAttribute('data-speak') || '');
      utterance.lang = button.getAttribute('data-speak-lang') || 'zh-CN';
      utterance.rate = 0.86;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  });

  const setPrintCard = (card) => {
    doc.querySelectorAll('[data-print-card]').forEach((item) => item.removeAttribute('data-print-selected'));
    card?.setAttribute('data-print-selected', '');
    doc.body.classList.add('print-one-active');
    window.setTimeout(() => {
      window.print();
      window.setTimeout(() => {
        doc.body.classList.remove('print-one-active');
        card?.removeAttribute('data-print-selected');
      }, 200);
    }, 80);
  };
  doc.querySelectorAll('[data-print-one]').forEach((button) => {
    button.addEventListener('click', () => setPrintCard(button.closest('[data-print-card]')));
  });

  doc.querySelectorAll('[data-dev-tab]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const key = tab.getAttribute('data-dev-tab');
      doc.querySelectorAll('[data-dev-tab]').forEach((item) => item.setAttribute('aria-selected', String(item === tab)));
      doc.querySelectorAll('[data-dev-panel]').forEach((panel) => {
        panel.hidden = panel.getAttribute('data-dev-panel') !== key;
      });
    });
  });

  doc.querySelectorAll('[data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = doc.getElementById(button.getAttribute('data-copy-target') || '');
      const label = button.querySelector('[data-copy-label]');
      if (!target) return;
      const value = target.textContent || '';
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        const area = doc.createElement('textarea');
        area.value = value;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        doc.body.append(area);
        area.select();
        doc.execCommand('copy');
        area.remove();
      }
      if (label) {
        const previous = label.textContent;
        label.textContent = root.lang.startsWith('zh') ? '已复制' : 'Copied';
        window.setTimeout(() => {
          label.textContent = previous;
        }, 1600);
      }
    });
  });

  const demoShell = doc.querySelector('[data-demo-shell]');
  const demoScreen = doc.querySelector('[data-demo-screen]');
  const demoOpen = doc.querySelector('[data-demo-open]');
  const demoPower = doc.querySelector('[data-demo-power]');
  const demoNote = doc.querySelector('[data-demo-note]');
  const demoClose = doc.querySelector('[data-demo-close]');
  let demoTimer = 0;
  let demoLoaded = false;
  const demoPath = root.lang.startsWith('zh') ? './demo/?lang=zh' : '../demo/?lang=en';
  const openDemo = () => {
    if (!demoShell || !demoScreen) return;
    demoShell.classList.add('is-on');
    if (!demoLoaded) {
      const loading = demoScreen.querySelector('[data-demo-loading]');
      const iframe = doc.createElement('iframe');
      iframe.src = demoPath;
      iframe.loading = 'lazy';
      iframe.title = root.lang.startsWith('zh') ? '芽芽成长 Sprout 浏览器演示' : 'Sprout browser demo';
      iframe.allow = 'autoplay';
      iframe.referrerPolicy = 'no-referrer';
      demoScreen.replaceChildren(iframe);
      demoLoaded = true;
      loading?.remove();
    }
    window.clearTimeout(demoTimer);
    demoTimer = window.setTimeout(() => {
      if (demoNote) demoNote.hidden = false;
    }, 600000);
  };
  const closeDemo = () => {
    if (!demoShell || !demoScreen) return;
    demoShell.classList.remove('is-on');
    demoNote && (demoNote.hidden = true);
    window.clearTimeout(demoTimer);
  };
  demoOpen?.addEventListener('click', openDemo);
  demoPower?.addEventListener('click', () => {
    if (demoShell?.classList.contains('is-on')) closeDemo();
    else openDemo();
  });
  demoClose?.addEventListener('click', closeDemo);

  if (reducedMotion) {
    doc.querySelectorAll('.hero-scene').forEach((scene) => scene.classList.remove('is-playing'));
  }
})();
