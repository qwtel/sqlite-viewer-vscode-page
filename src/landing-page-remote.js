async function collectionToArray(collection) {
  if (!collection) return [];
  const length = await collection.length;
  return Promise.all(Array.from({ length }, (_, index) => collection[index]));
}

function reportAsyncCallbackError(error) {
  console.error('Landing-page callback failed:', error);
}

function observerCallback(callback) {
  return (...args) => {
    Promise.resolve(callback(...args)).catch(reportAsyncCallbackError);
  };
}

async function setProperty(target, property, value) {
  const remoteSet = await target.$set;
  if (typeof remoteSet === 'function') return remoteSet(property, value);
  target[property] = value;
  return true;
}

async function listen(target, type, callback, options) {
  const remoteListen = await target.$listen;
  if (typeof remoteListen === 'function') return remoteListen(type, callback, options);

  const { preventDefault = false, ...listenerOptions } = typeof options === 'object' && options
    ? options
    : {};
  const listener = (event) => {
    if (preventDefault && event.cancelable) event.preventDefault();
    Promise.resolve(callback(event, event.target, event.currentTarget)).catch(reportAsyncCallbackError);
  };
  const nativeOptions = typeof options === 'boolean' ? options : listenerOptions;
  target.addEventListener(type, listener, nativeOptions);
  return { disconnect: () => target.removeEventListener(type, listener, nativeOptions) };
}

async function scrollToTarget(window, target, options = {}) {
  const [rect, style, viewportHeight, scrollY] = await Promise.all([
    target.getBoundingClientRect(),
    window.getComputedStyle(target),
    window.innerHeight,
    window.scrollY,
  ]);
  const [rawMarginTop, rawMarginBottom] = await Promise.all([
    style.scrollMarginTop,
    style.scrollMarginBottom,
  ]);
  const marginTop = Number.parseFloat(rawMarginTop) || 0;
  const marginBottom = Number.parseFloat(rawMarginBottom) || 0;
  const start = scrollY + rect.top - marginTop;
  const end = scrollY + rect.bottom - viewportHeight + marginBottom;
  const block = ['center', 'end', 'nearest', 'start'].includes(options.block) ? options.block : 'start';
  const top = block === 'end'
    ? end
    : block === 'center'
      ? scrollY + rect.top + rect.height / 2 - viewportHeight / 2
      : block === 'nearest'
        ? rect.top < 0
          ? start
          : rect.bottom > viewportHeight
            ? end
            : scrollY
        : start;
  await window.scrollTo({ top, behavior: options.behavior || 'smooth' });
}

async function initializeHashNavigation(window) {
  const document = await window.document;
  const links = await collectionToArray(await document.querySelectorAll('[data-scroll-to]'));

  await Promise.all(links.map(async (link) => {
    await listen(link, 'click', async () => {
      const href = await link.getAttribute('href');
      if (!href?.startsWith('#')) return;
      if (href === '#') {
        await window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      let targetId;
      try {
        targetId = decodeURIComponent(href.slice(1));
      } catch {
        return;
      }
      const target = await document.getElementById(targetId);
      if (!target) {
        await window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      const compactEnd = await link.hasAttribute('data-scroll-block-compact');
      const block = compactEnd
        && (await window.innerHeight) < 800
        && (await window.innerWidth) >= 780
        ? await link.getAttribute('data-scroll-block-compact')
        : 'start';
      await scrollToTarget(window, target, { block: block || 'start', behavior: 'smooth' });
    }, { preventDefault: true });
  }));
}

async function initializeVideoPlayback(window) {
  const document = await window.document;
  const cards = await document.getElementById('cards');
  const cardVideos = cards ? await collectionToArray(await cards.querySelectorAll('video')) : [];
  const spies = await collectionToArray(await document.querySelectorAll('.spy'));
  if (!cardVideos.length || !spies.length) return;

  await Promise.all(cardVideos.map((video) => setProperty(video, 'muted', true)));

  const videoForTarget = async (target) => {
    const style = await target.style;
    const index = Number(await style.getPropertyValue('--index'));
    return cardVideos[index - 1];
  };

  const inObserver = await new window.IntersectionObserver(observerCallback(async (entries) => {
    const windowHeight = (await window.innerHeight) - 96;
    for (const entry of entries) {
      const video = await videoForTarget(entry.target);
      if (!video) continue;
      const isWindowTooSmall = entry.boundingClientRect.height > windowHeight;
      if (entry.isIntersecting && (entry.intersectionRatio >= 1 || isWindowTooSmall)) {
        await video.play().catch(() => {});
      } else if (!entry.isIntersecting && isWindowTooSmall) {
        await video.pause();
      }
    }
  }), { threshold: [0.01, 1] });

  const outObserver = await new window.IntersectionObserver(observerCallback(async (entries) => {
    const windowHeight = await window.innerHeight;
    for (const entry of entries) {
      if (!entry.isIntersecting && entry.boundingClientRect.height < windowHeight) {
        const video = await videoForTarget(entry.target);
        if (video) await video.pause();
      }
    }
  }), { threshold: 0.8 });

  await Promise.all(spies.flatMap((spy) => [inObserver.observe(spy), outObserver.observe(spy)]));
}

async function initializeNavigationObserver(window) {
  const document = await window.document;
  const navLinks = await collectionToArray(await document.querySelectorAll('.opacity-link[href^="#"]'));
  const linksBySection = new Map();
  const sectionsById = new Map();

  for (const link of navLinks) {
    const href = await link.getAttribute('href');
    if (!href || href === '#') continue;
    const section = await document.querySelector(href);
    if (section) {
      const sectionId = await section.id;
      linksBySection.set(sectionId, link);
      sectionsById.set(sectionId, section);
    }
  }
  if (!linksBySection.size) return;

  let activeLink;
  const setActiveLink = async (sectionId) => {
    const nextLink = linksBySection.get(sectionId);
    if (!nextLink || nextLink === activeLink) return;
    if (activeLink) await (await activeLink.classList).remove('active');
    await (await nextLink.classList).add('active');
    activeLink = nextLink;
  };

  const observer = await new window.IntersectionObserver(observerCallback(async (entries) => {
    let mostVisible;
    for (const entry of entries) {
      if (entry.isIntersecting && (!mostVisible || entry.intersectionRatio > mostVisible.intersectionRatio)) {
        mostVisible = entry;
      }
    }
    if (!mostVisible) return;

    await setActiveLink(await mostVisible.target.id);
  }), {
    rootMargin: '-20% 0px -60% 0px',
    threshold: 0,
  });

  await Promise.all([...sectionsById.values()].map((section) => observer.observe(section)));

  let initialSectionId;
  let minimumDistance = Infinity;
  for (const [sectionId, section] of sectionsById) {
    const rect = await section.getBoundingClientRect();
    const distance = Math.abs(rect.top);
    if (distance < minimumDistance && rect.top <= 100) {
      minimumDistance = distance;
      initialSectionId = sectionId;
    }
  }
  if (initialSectionId) await setActiveLink(initialSectionId);
}

export async function initializeLandingPageInteractions(window = globalThis.window) {
  const document = await window.document;
  const root = await document.documentElement;
  const classList = await root.classList;
  await classList.remove('no-js');
  await classList.add('js', 'sr');

  await Promise.all([
    initializeHashNavigation(window),
    initializeVideoPlayback(window),
    initializeNavigationObserver(window),
  ]);
}

// The opaque iframe evaluates this bundle before the extension-owned runtime
// connects. The regular page imports the same function directly instead.
globalThis.initializeRemoteSandbox = initializeLandingPageInteractions;
