import { createAsyncAnime } from './async-anime.js';

/**
 * @typedef {import('../../sqlite-viewer-core/src/vendor/domlink/types').RemoteWindow} RemoteWindow
 * @typedef {import('../../sqlite-viewer-core/src/vendor/domlink/types').Remote<Document>} RemoteDocument
 * @typedef {import('../../sqlite-viewer-core/src/vendor/domlink/types').Remote<Element>} RemoteElement
 * @typedef {import('../../sqlite-viewer-core/src/vendor/domlink/types').Remote<HTMLElement>} RemoteHTMLElement
 * @typedef {import('../../sqlite-viewer-core/src/vendor/domlink/types').Remote<HTMLAnchorElement>} RemoteAnchor
 * @typedef {import('../../sqlite-viewer-core/src/vendor/domlink/types').Remote<HTMLVideoElement>} RemoteVideo
 * @typedef {{ enterLicenseKey(): void | Promise<void> }} LandingPageHost
 * @typedef {{ behavior?: ScrollBehavior, block?: string }} ScrollToTargetOptions
 */

/** @param {unknown} error */
function reportAsyncCallbackError(error) {
  console.error('Landing-page callback failed:', error);
}

/**
 * @template {unknown[]} Args
 * @param {(...args: Args) => unknown | Promise<unknown>} callback
 * @returns {(...args: Args) => void}
 */
function asyncCallback(callback) {
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

/** @param {RemoteVideo} video */
async function playVideo(video) {
  try {
    await video.play();
  } catch (error) {
    // Autoplay policy and rapid observer reversals are expected races. Do not
    // hide transport, policy, CSP, or unsupported-source failures with them.
    if (error?.name !== 'AbortError' && error?.name !== 'NotAllowedError') throw error;
  }
}

/** @param {RemoteHTMLElement} root */
async function getRootScrollPosition(root) {
  const [rect, scrollTop] = await Promise.all([
    root.getBoundingClientRect(),
    root.scrollTop,
  ]);
  return { top: rect.top, scrollTop };
}

/**
 * @param {RemoteWindow} window
 * @param {RemoteHTMLElement} root
 * @param {RemoteElement} target
 * @param {ScrollToTargetOptions} [options]
 */
export async function scrollToTarget(window, root, target, options = {}) {
  const [rect, rootPosition, scrollTop, style, viewportHeight] = await Promise.all([
    target.getBoundingClientRect(),
    getRootScrollPosition(root),
    window.scrollY,
    window.getComputedStyle(target),
    window.innerHeight,
  ]);
  const [rawMarginTop, rawMarginBottom] = await Promise.all([
    style.scrollMarginTop,
    style.scrollMarginBottom,
  ]);
  const targetTop = rect.top - rootPosition.top + rootPosition.scrollTop;
  const targetBottom = rect.bottom - rootPosition.top + rootPosition.scrollTop;
  const visibleTop = targetTop - scrollTop;
  const visibleBottom = targetBottom - scrollTop;
  const marginTop = Number.parseFloat(rawMarginTop) || 0;
  const marginBottom = Number.parseFloat(rawMarginBottom) || 0;
  const start = targetTop - marginTop;
  const end = targetBottom - viewportHeight + marginBottom;
  const block = ['center', 'end', 'nearest', 'start'].includes(options.block) ? options.block : 'start';
  const top = block === 'end'
    ? end
    : block === 'center'
      ? targetTop + rect.height / 2 - viewportHeight / 2
      : block === 'nearest'
        ? visibleTop < 0
          ? start
          : visibleBottom > viewportHeight
            ? end
            : scrollTop
        : start;
  await window.scrollTo({ top, behavior: options.behavior || 'smooth' });
}

/**
 * @param {RemoteWindow} window
 * @param {RemoteDocument} document
 * @param {RemoteHTMLElement} root
 */
async function initializeHashNavigation(window, document, root) {
  const links = await document.querySelectorAll('a[href^="#"]');

  await Promise.all(Array.from(links, (link) => link.addEventListener(
    'click',
    asyncCallback(async (event) => {
      event.preventDefault();
      const [href, checkoutAction, id] = await Promise.all([
        link.getAttribute('href'),
        link.hasAttribute('data-checkout-product'),
        link.getAttribute('id'),
      ]);
      if (!href?.startsWith('#')) return;
      // Their placeholder hashes are owned by separate action handlers.
      if (checkoutAction || id === 'license-key') return;
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
      await scrollToTarget(window, root, target, { block: block || 'start', behavior: 'smooth' });
    }),
    { preventDefault: true },
  )));
}

/**
 * @param {RemoteDocument} document
 * @param {RemoteHTMLElement} root
 * @param {LandingPageHost | null} host
 */
async function initializeEmbeddedActions(document, root, host) {
  if (!host) return;

  const [openInBrowser, licenseKey] = /** @type {[RemoteAnchor|null, RemoteHTMLElement|null]} */(
    await Promise.all([
      document.getElementById('open-in-browser'),
      document.getElementById('license-key'),
    ])
  );

  if (openInBrowser) {
    const href = await openInBrowser.href;
    const url = new URL(href);
    url.searchParams.set('ref', 'vscode');
    url.searchParams.set('lang', await root.lang || 'en');
    const classList = await openInBrowser.classList;
    await Promise.all([
      openInBrowser.setAttribute('href', url.href),
      classList.remove('display-none'),
      classList.add('display-inline'),
    ]);
  }

  if (licenseKey) {
    await (await licenseKey.style).setProperty('display', 'inline');
    await licenseKey.addEventListener('click', asyncCallback(async (event) => {
      event.preventDefault();
      await host.enterLicenseKey();
    }), { preventDefault: true });
  }
}

/**
 * @param {RemoteWindow} window
 * @param {RemoteDocument} document
 */
async function initializeVideoPlayback(window, document) {
  const cards = await document.getElementById('cards');
  const cardVideos = cards ? await cards.querySelectorAll('video') : [];
  const spies = /** @type {RemoteHTMLElement[]} */ (await document.querySelectorAll('.spy'));
  if (!cardVideos.length || !spies.length) return;

  await Promise.all(Array.from(cardVideos, (video) => setProperty(video, 'muted', true)));

  /** @type {Map<RemoteElement, RemoteVideo | undefined>} */
  const videosByTarget = new Map(await Promise.all(Array.from(spies, async (target) => {
    const index = Number(await (await target.style).getPropertyValue('--index'));
    return /** @type {const} */ ([target, cardVideos[index - 1]]);
  })));

  const inObserver = await new window.IntersectionObserver(asyncCallback(async (entries) => {
    const windowHeight = (await window.innerHeight) - 96;
    const readings = entries.map((entry) => ({
      height: entry.boundingClientRect.height,
      intersectionRatio: entry.intersectionRatio,
      isIntersecting: entry.isIntersecting,
      video: videosByTarget.get(entry.target),
    }));
    for (const { height, intersectionRatio, isIntersecting, video } of readings) {
      if (!video) continue;
      const isWindowTooSmall = height > windowHeight;
      if (isIntersecting && (intersectionRatio >= 1 || isWindowTooSmall)) {
        await playVideo(video);
      } else if (!isIntersecting && isWindowTooSmall) {
        await video.pause();
      }
    }
  }), { threshold: [0.01, 1] });

  const outObserver = await new window.IntersectionObserver(asyncCallback(async (entries) => {
    const windowHeight = await window.innerHeight;
    const readings = entries.map((entry) => ({
      height: entry.boundingClientRect.height,
      isIntersecting: entry.isIntersecting,
      video: videosByTarget.get(entry.target),
    }));
    for (const { height, isIntersecting, video } of readings) {
      if (!isIntersecting && height < windowHeight) {
        if (video) await video.pause();
      }
    }
  }), { threshold: 0.8 });

  await Promise.all(Array.from(
    spies,
    (spy) => [inObserver.observe(spy), outObserver.observe(spy)],
  ).flat());
}

/**
 * @param {RemoteWindow} window
 * @param {RemoteDocument} document
 * @param {RemoteHTMLElement} root
 */
async function initializeNavigationObserver(window, document, root) {
  const navLinks = await document.querySelectorAll('.opacity-link[href^="#"]');
  const linksBySection = new Map();

  for (const link of navLinks) {
    const href = await link.getAttribute('href');
    if (!href || href === '#') continue;
    const section = await document.querySelector(href);
    if (section) linksBySection.set(section, link);
  }
  if (!linksBySection.size) return;

  /** @type {RemoteHTMLElement | null} */
  let activeLink;
  const setActiveLink = /** @type {(nextLink: RemoteHTMLElement|null) => Promise<void>} */ (async (nextLink) => {
    if (!nextLink || nextLink === activeLink) return;
    if (activeLink) await (await activeLink.classList).remove('active');
    await (await nextLink.classList).add('active');
    activeLink = nextLink;
  });

  const observer = await new window.IntersectionObserver(asyncCallback(async (entries) => {
    let mostVisible;
    for (const { intersectionRatio, isIntersecting, target } of entries) {
      if (isIntersecting && (!mostVisible || intersectionRatio > mostVisible.intersectionRatio)) {
        mostVisible = { intersectionRatio, target };
      }
    }
    if (!mostVisible) return;

    await setActiveLink(linksBySection.get(mostVisible.target));
  }), {
    rootMargin: '-20% 0px -60% 0px',
    threshold: 0,
  });

  await Promise.all(Array.from(linksBySection.keys(), (section) => observer.observe(section)));

  let initialLink;
  let minimumDistance = Infinity;
  const [rootPosition, scrollTop] = await Promise.all([
    getRootScrollPosition(root),
    window.scrollY,
  ]);
  for (const [section, link] of linksBySection) {
    const rect = await section.getBoundingClientRect();
    const top = rect.top - rootPosition.top + rootPosition.scrollTop - scrollTop;
    const distance = Math.abs(top);
    if (distance < minimumDistance && top <= 100) {
      minimumDistance = distance;
      initialLink = link;
    }
  }
  if (initialLink) await setActiveLink(initialLink);
}

/**
 * @param {RemoteWindow} window
 * @param {RemoteDocument} document
 * @param {RemoteHTMLElement} root
 */
async function initializeRevealAnimations(window, document, root) {
  if (!(await (await root.classList).contains('has-animations'))) return;

  const targets = await document.querySelectorAll('.is-revealing');
  if (!targets.length) return;

  let observer;
  observer = await new window.IntersectionObserver(asyncCallback(async (entries) => {
    const updates = [];
    let visibleIndex = 0;
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting || !target) continue;
      const delay = visibleIndex++ * 100;
      updates.push(
        Promise.resolve().then(() => target.animate([
          { visibility: 'visible', opacity: 0, transform: 'translateY(20px)' },
          { visibility: 'visible', opacity: 1, transform: 'translateY(0)' },
        ], {
          delay,
          duration: 600,
          easing: 'cubic-bezier(0.5, -0.01, 0, 1.005)',
          fill: 'forwards',
        })).catch(reportAsyncCallbackError),
        observer.unobserve(target),
      );
    }
    await Promise.all(updates);
  }), { threshold: 0.25 });

  await Promise.all(Array.from(targets, (target) => observer.observe(target)));
}

/**
 * @param {RemoteDocument} document
 * @param {RemoteHTMLElement} root
 */
async function initializeHeroAnimations(document, root) {
  if (!(await (await root.classList).contains('has-animations'))) return;

  const anime = createAsyncAnime(document);
  const animations = [
    anime.timeline({ targets: '.hero-figure-box-05' }).add({
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: [0.05, 0.05],
      scaleY: [0, 1],
      perspective: 500,
      delay: anime.random(0, 400),
    }).add({
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: 1,
    }).add({
      duration: 800,
      rotateY: -15,
      rotateX: 8,
      rotateZ: -1,
    }),
    anime.timeline({ targets: '.hero-figure-box-06, .hero-figure-box-07' }).add({
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: [0.05, 0.05],
      scaleY: [0, 1],
      perspective: 500,
      delay: anime.random(0, 400),
    }).add({
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: 1,
    }).add({
      duration: 800,
      rotateZ: 20,
    }),
    anime({
      targets: '.hero-figure-box-01, .hero-figure-box-02, .hero-figure-box-03, .hero-figure-box-04, .hero-figure-box-08, .hero-figure-box-09, .hero-figure-box-10',
      duration: anime.random(600, 800),
      delay: anime.random(600, 800),
      rotate: [anime.random(-360, 360), (element) => element.getAttribute('data-rotation')],
      scale: [0.7, 1],
      opacity: [0, 1],
      easing: 'easeInOutExpo',
    }),
  ];

  // Keep the hidden CSS gate closed until every initial keyframe is active.
  await Promise.all(animations.map((animation) => animation.ready));
  await (await root.classList).add('anime-ready');
}

/**
 * The regular page is the synchronous provider for the same await-compatible
 * contract exposed by Domlink in the sandbox.
 *
 * @param {RemoteWindow} [window]
 * @param {LandingPageHost | null} [host]
 */
export async function initializeLandingPageInteractions(
  window = /** @type {RemoteWindow} */ (/** @type {unknown} */ (globalThis.window)),
  host = null,
) {
  const document = window.document;
  const root = await document.getElementById('page-root') || await document.documentElement;
  const classList = await root.classList;
  await classList.remove('no-js');
  await classList.add('js', 'sr');

  await Promise.all([
    initializeEmbeddedActions(document, root, host),
    initializeHashNavigation(window, document, root),
    initializeVideoPlayback(window, document),
    initializeNavigationObserver(window, document, root),
    initializeRevealAnimations(window, document, root),
    initializeHeroAnimations(document, root),
  ]);
}

// The opaque iframe evaluates this bundle before the extension-owned runtime
// connects. The regular page imports the same function directly instead.
globalThis.initializeRemoteSandbox = initializeLandingPageInteractions;
