import { initializeLandingPageInteractions } from './landing-page-remote.js';

window.counterscale = { q: [['set', 'siteId', 'vscode.sqliteviewer.app'], ['trackPageview']] };

function getRequiredElement(id, ElementType) {
  const element = document.getElementById(id);
  if (!(element instanceof ElementType)) throw new Error(`Missing #${id}`);
  return element;
}

function initializePageAppearance() {
  const searchParams = new URLSearchParams(location.search);
  const colorScheme = searchParams.get('color-scheme');
  const colorSchemeMeta = document.head.querySelector('meta[name="color-scheme"]');
  if (colorSchemeMeta) colorSchemeMeta.content = colorScheme || 'dark light';
  document.body.classList.toggle('vscode', window.self !== window.top);
  if (colorScheme) document.body.classList.add(colorScheme);

  try {
    const cssVars = JSON.parse(searchParams.get('css-vars') || '{}');
    Object.entries(cssVars).forEach(([key, value]) => document.body.style.setProperty(key, String(value)));
  } catch {
    // Ignore malformed optional embedding configuration.
  }
}

function initializeExternalLinkDialog() {
  const dialog = getRequiredElement('vscode-external-link-dialog', HTMLDialogElement);
  const input = getRequiredElement('vscode-external-link-url', HTMLInputElement);
  const copyButton = getRequiredElement('vscode-external-link-copy', HTMLButtonElement);
  const status = getRequiredElement('vscode-external-link-status', HTMLElement);
  const copiedText = getRequiredElement('vscode-external-link-copied', HTMLElement).textContent;
  const copyFailedText = getRequiredElement('vscode-external-link-copy-failed', HTMLElement).textContent;

  function copySelectedText() {
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }

  async function copyLink() {
    input.focus();
    input.select();

    // The async Clipboard API may be denied in VS Code's nested iframe. Keep
    // the copy operation inside the trusted click gesture whenever possible.
    let copied = copySelectedText();
    if (!copied) {
      try {
        await navigator.clipboard.writeText(input.value);
        copied = true;
      } catch {
        copied = false;
      }
    }

    status.textContent = copied ? copiedText : copyFailedText;
  }

  copyButton.addEventListener('click', copyLink);
  dialog.addEventListener('close', () => {
    input.value = '';
    status.textContent = '';
  });

  return (href) => {
    const url = new URL(href);
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      url.searchParams.set('ref', 'vscode');
    }

    input.value = url.href;
    status.textContent = '';
    dialog.showModal();
    void copyLink();
  };
}

async function initializeVscodePage() {
  if (!document.body.classList.contains('vscode')) return;

  const licenseKeyLink = getRequiredElement('license-key', HTMLAnchorElement);
  const openInBrowserLink = getRequiredElement('open-in-browser', HTMLAnchorElement);
  const showExternalLinkDialog = initializeExternalLinkDialog();

  openInBrowserLink.classList.remove('display-none');
  openInBrowserLink.classList.add('display-inline');
  const openInBrowserUrl = new URL('/', location.href);
  openInBrowserUrl.searchParams.set('ref', 'vscode');
  openInBrowserUrl.searchParams.set('lang', document.documentElement.lang || 'en');
  openInBrowserLink.href = openInBrowserUrl.href;

  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const link = event.target.closest('a[href]');
    if (!(link instanceof HTMLAnchorElement)) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;

    event.preventDefault();
    showExternalLinkDialog(link.href);
  }, { capture: true });

  const Comlink = await import('./vendor/comlink.js');
  const wrappedParent = Comlink.wrap(Comlink.windowEndpoint(self.parent));
  licenseKeyLink.style.display = 'inline';
  licenseKeyLink.addEventListener('click', (event) => {
    event.preventDefault();
    void wrappedParent.enterLicenseKey();
  });
}

const root = document.documentElement;

function initializeAnimations() {
  if (document.body.classList.contains('has-animations')) {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry, index) => {
        const target = /** @type {HTMLElement} */(entry.target);
        if (entry.isIntersecting) {
          target.style.visibility = 'visible';
          setTimeout(() => {
            target.animate([
              { opacity: 0, transform: 'translateY(20px)' },
              { opacity: 1, transform: 'translateY(0)' }
            ], {
              duration: 600,
              easing: 'cubic-bezier(0.5, -0.01, 0, 1.005)',
              fill: 'forwards',
            });
          }, index * 100); // Stagger effect

          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.25 });

    document.querySelectorAll('.is-revealing').forEach(el => {
      el.style.opacity = '0';
      revealObserver.observe(el);
    });

    root.classList.add('anime-ready')

    /* global anime */
    const anime = window.anime;
    anime?.timeline({
      targets: '.hero-figure-box-05'
    }).add({
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: [0.05, 0.05],
      scaleY: [0, 1],
      perspective: '500px',
      delay: anime.random(0, 400)
    }).add({
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: 1
    }).add({
      duration: 800,
      rotateY: '-15deg',
      rotateX: '8deg',
      rotateZ: '-1deg'
    })

    anime?.timeline({
      targets: '.hero-figure-box-06, .hero-figure-box-07'
    }).add({
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: [0.05, 0.05],
      scaleY: [0, 1],
      perspective: '500px',
      delay: anime.random(0, 400)
    }).add({
      duration: 400,
      easing: 'easeInOutExpo',
      scaleX: 1
    }).add({
      duration: 800,
      rotateZ: '20deg'
    })

    anime?.({
      targets: '.hero-figure-box-01, .hero-figure-box-02, .hero-figure-box-03, .hero-figure-box-04, .hero-figure-box-08, .hero-figure-box-09, .hero-figure-box-10',
      duration: anime.random(600, 800),
      delay: anime.random(600, 800),
      rotate: [ anime.random(-360, 360), (el) => el.dataset.rotation],
      scale: [0.7, 1],
      opacity: [0, 1],
      easing: 'easeInOutExpo'
    })
  }
}

  // Handle view timeline-based card animations
async function initializeTimelineCards() {
  !CSS.supports('view-timeline-name', '--cards-element-scrolls-in-body') && document.querySelectorAll('.cards-stack').forEach(async (cardsStack) => {
    await import("./vendor/scroll-timeline.min.js");

    const cardContents = cardsStack.querySelectorAll('.card__content');

    const numCards = cardContents.length;
    cardsStack.style.setProperty('--num-cards', numCards);

    const viewTimeline = new ViewTimeline({ subject: cardsStack, axis: 'block' });

    cardContents.forEach((cardContent, index0) => {
      const index = index0 + 1;
      const reverseIndex0 = numCards - index;

      cardContent.animate({
        transform: [`scale(1)`, `scale(${1 - (0.1 * reverseIndex0)}`],
      }, {
        timeline: viewTimeline,
        fill: 'forwards',
        rangeStart: `exit-crossing ${CSS.percent(index0 / numCards * 100)}`,
        rangeEnd: `exit-crossing ${CSS.percent(index / numCards * 100)}`,
      });
    });
  });
}

function showSpinner() {
  const muOb = new MutationObserver((muts) => {
    for (const mut of muts) {
      for (const node of mut.addedNodes) {
        if (node instanceof HTMLElement) {
          const child = node.children[0];
          if (child && child.classList.contains('polar-loader-spinner')) {
            node.innerHTML = '';
            node.style.position = 'fixed';
            node.style.top = node.style.left = '0px';
            node.style.width = node.style.height ='100%';
            node.style.transform = ''
            node.style.display = 'grid';
            node.style.placeItems = 'center';
            node.insertAdjacentHTML('beforeend', '<div class="lds-ring"><div></div><div></div><div></div><div></div></div>');
            muOb.disconnect();
          }
        }
      }
    }
  })
  muOb.observe(document.body, { childList: true });
};

// Show loading spinner when clicking on checkout button
function initializeLoadingSpinner() {
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(`.lds-ring { color: functions.color(typography, 2); } .lds-ring, .lds-ring div { box-sizing: border-box; } .lds-ring { display: inline-block; position: relative; width: 80px; height: 80px; } .lds-ring div { box-sizing: border-box; display: block; position: absolute; width: 64px; height: 64px; margin: 8px; border: 8px solid currentColor; border-radius: 50%; animation: lds-ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite; border-color: currentColor transparent transparent transparent; } .lds-ring div:nth-child(1) { animation-delay: -0.45s; } .lds-ring div:nth-child(2) { animation-delay: -0.3s; } .lds-ring div:nth-child(3) { animation-delay: -0.15s; } @keyframes lds-ring { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`);
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  // const isNewTab = ev => ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1;
  // document.querySelectorAll('[data-polar-checkout]').forEach(el => {
  //   el.addEventListener('click', ev => isNewTab(ev) ? ev.stopImmediatePropagation() : showSpinner());
  // });
}

function getCheckoutTheme() {
  const urlScheme = new URLSearchParams(window.location.search).get('color-scheme');
  if (urlScheme === 'dark' || urlScheme === 'light') return urlScheme;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function initializeEmbeddedCheckoutLinks() {
  const isNewTab = ev => ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1;

  document.querySelectorAll('a[href^="/api/checkout"], a[href^="' + window.location.origin + '/api/checkout"]').forEach((el) => {
    el.addEventListener('click', async (ev) => {
      if (isNewTab(ev)) return;
      if (ev.defaultPrevented) return;

      if (window.self !== window.top) {
        setTimeout(() => {
          import('./vendor/comlink.js')
            .then((Comlink) => {
              const parentEndpoint = Comlink.windowEndpoint(self.parent);
              const wrappedParent = Comlink.wrap(parentEndpoint);
              wrappedParent.enterLicenseKey();
            })
            .catch((err) => console.error(err));
        }, 800);
        return;
      }

      ev.preventDefault();

      const href = el.getAttribute('href') || el.href;
      const url = new URL(href, window.location.origin);
      const product = url.searchParams.get('product');
      const currency = url.searchParams.get('currency') || 'usd';
      const locale = url.searchParams.get('locale') || 'en';
      if (!product) return;

      const overlay = document.createElement('div');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:grid;place-items:center;z-index:9999;';
      overlay.innerHTML = '<div class="lds-ring"><div></div><div></div><div></div><div></div></div>';

      document.body.appendChild(overlay);
      document.body.classList.add('polar-no-scroll');

      let checkoutUrl;
      try {
        const res = await fetch('/api/checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product, currency, locale, embed_origin: window.location.origin }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Checkout unavailable');
        checkoutUrl = data.url;
      } catch (err) {
        console.error('Checkout fetch failed', err);
        window.location.href = href;
        return;
      } finally {
        overlay.remove();
      }

      if (!checkoutUrl) {
        window.location.href = href;
        return;
      }

      const EmbedCheckout = window.Polar?.EmbedCheckout;
      if (typeof EmbedCheckout?.create === 'function') {
        try {
          showSpinner();
          await EmbedCheckout.create(checkoutUrl, getCheckoutTheme());
        } catch (e) {
          console.error('Embed open failed', e);
          window.location.href = checkoutUrl;
        }
      } else {
        window.location.href = checkoutUrl;
      }
    });
  });
}

function initializeCheckoutTheme() {
  const theme = getCheckoutTheme();
  document.querySelectorAll('[data-polar-checkout]').forEach((element) => {
    element.setAttribute('data-polar-checkout-theme', theme);
  });
}

  // Lazy load Shoelace when carousel comes into view
function initializeLazyLoadShoelace() {
  const carouselSection = document.querySelector('.changelog-carousel');
  if (!carouselSection) return;
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // Load Shoelace CSS and JS one by one using insertAdjacentHTML
        document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" media="(prefers-color-scheme:light)" href="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/themes/light.css"/>');
        document.head.insertAdjacentHTML('beforeend', '<link rel="stylesheet" media="(prefers-color-scheme:dark)" href="https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/themes/dark.css"/>');
        import('https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.20.1/cdn/shoelace.js').catch(console.error);
        
        // Add dark mode listener
        const darkMode = window.matchMedia('(prefers-color-scheme: dark)');
        darkMode.addEventListener('change', (ev) => document.documentElement.classList.toggle('sl-theme-dark', ev.matches));
        if (darkMode.matches) document.documentElement.classList.add('sl-theme-dark');
        
        // Disconnect observer since we only need to load once
        observer.disconnect();
      }
    });
  }, {
    rootMargin: '1500px'
  });
  
  observer.observe(carouselSection);
}

(async () => {
  initializePageAppearance();

  try {
    await initializeVscodePage();
  } catch (error) {
    console.error('Failed to initialize VS Code page integration:', error);
  }

  try {
    await initializeLandingPageInteractions();
  } catch (error) {
    console.error('Failed to initialize shared landing-page interactions:', error);
  }

  try {
    initializeAnimations();
  } catch (error) {
    console.error('Failed to initialize animations:', error);
  }

  try {
    await initializeTimelineCards();
  } catch (error) {
    console.error('Failed to initialize timeline cards:', error);
  }

  try {
    initializeLoadingSpinner();
  } catch (error) {
    console.error('Failed to initialize loading spinner:', error);
  }

  try {
    initializeCheckoutTheme();
    initializeEmbeddedCheckoutLinks();
  } catch (error) {
    console.error('Failed to initialize embedded checkout links:', error);
  }

  try {
    initializeLazyLoadShoelace();
  } catch (error) {
    console.error('Failed to initialize lazy load Shoelace:', error);
  }

})();
