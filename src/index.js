(async () => {
  {
    const el = document.getElementById('license-key');
    if (el && document.body.classList.contains('vscode')) {
      const Comlink = await import("./vendor/comlink.js");
      const parentEndpoint = Comlink.windowEndpoint(self.parent);
      const wrappedParent = Comlink.wrap(parentEndpoint);
      document.querySelectorAll('a[href]:not([href^="#"]').forEach(a => {
        a.addEventListener('click', event => {
          event.preventDefault();
          wrappedParent.openLink(a.href);
        });
      });
      document.getElementById('license-key').style.display = 'inline';
      document.getElementById('license-key').addEventListener('click', event => (event.preventDefault(), wrappedParent.enterLicenseKey()));
    }
  }

  const root = document.documentElement;

  root.classList.remove('no-js')
  root.classList.add('js')
  root.classList.add('sr')

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

  // Handle view timeline-based card animations
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

  // Handle scroll-based video playback
  {
    const cardVideos = document.getElementById('cards')?.querySelectorAll('video');
    const inObserver = new IntersectionObserver((entries) => {
      const windowHeight = window.innerHeight - 60 - 16 - 20; // 60px for header, 16px for padding, 20px for margin
      for (const entry of entries) {
        const isWindowTooSmall = entry.boundingClientRect.height > windowHeight;
        if (entry.isIntersecting && (entry.intersectionRatio >= 1 || isWindowTooSmall)) {
          const index = entry.target.style.getPropertyValue('--index');
          const video = cardVideos[index - 1];
          video && video.play();
        } 
        if (!entry.isIntersecting && isWindowTooSmall) {
          const index = entry.target.style.getPropertyValue('--index');
          const video = cardVideos[index - 1];
          video && video.pause();
        }
      }
    }, {
      threshold: [0.01, 1],
    });

    const outObserver = new IntersectionObserver((entries) => {
      const windowHeight = window.innerHeight;
      for (const entry of entries) {
        if (!entry.isIntersecting && entry.boundingClientRect.height < windowHeight) {
          const index = entry.target.style.getPropertyValue('--index');
          const video = cardVideos[index - 1];
          video && video.pause();
        }
      }
    }, {
      threshold: 0.8,
    });

    document.querySelectorAll('.spy').forEach(div => {
      inObserver.observe(div);
      outObserver.observe(div);
    });
  }

  // Show loading spinner when clicking on checkout button
  {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`.lds-ring { color: functions.color(typography, 2); } .lds-ring, .lds-ring div { box-sizing: border-box; } .lds-ring { display: inline-block; position: relative; width: 80px; height: 80px; } .lds-ring div { box-sizing: border-box; display: block; position: absolute; width: 64px; height: 64px; margin: 8px; border: 8px solid currentColor; border-radius: 50%; animation: lds-ring 1.2s cubic-bezier(0.5, 0, 0.5, 1) infinite; border-color: currentColor transparent transparent transparent; } .lds-ring div:nth-child(1) { animation-delay: -0.45s; } .lds-ring div:nth-child(2) { animation-delay: -0.3s; } .lds-ring div:nth-child(3) { animation-delay: -0.15s; } @keyframes lds-ring { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`);
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];

    const isNewTab = ev => ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button === 1;
    const showSpinner = () => {
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

    document.querySelectorAll('[data-polar-checkout]').forEach(el => {
      el.addEventListener('click', ev => isNewTab(ev) ? ev.stopImmediatePropagation() : showSpinner());
    });
  }

  // Lazy load Shoelace when carousel comes into view
  {
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

  // Navigation active state observer
  {
    class NavigationObserver {
      constructor() {
        this.navLinks = document.querySelectorAll('.opacity-link[href^="#"]');
        this.sections = new Map();
        this.activeLink = null;
        
        this.init();
      }
      
      init() {
        // Create a map of href -> section element
        this.navLinks.forEach(link => {
          const href = link.getAttribute('href');
          const section = document.querySelector(href);
          if (section) {
            this.sections.set(href, section);
          }
        });
        
        // Create intersection observer
        this.observer = new IntersectionObserver(
          (entries) => this.handleIntersection(entries),
          {
            root: null,
            rootMargin: '-20% 0px -60% 0px', // Trigger when section is 20% from top
            threshold: 0
          }
        );
        
        // Observe all sections
        this.sections.forEach(section => {
          this.observer.observe(section);
        });
        
        // Handle initial state
        this.setInitialActive();
      }
      
      handleIntersection(entries) {
        // Find the section that's most visible
        let mostVisible = null;
        let maxRatio = 0;
        
        entries.forEach(entry => {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisible = entry.target;
          }
        });
        
        if (mostVisible) {
          this.setActiveLink(mostVisible.id);
        }
      }
      
      setActiveLink(sectionId) {
        // Remove active class from all links
        this.navLinks.forEach(link => {
          link.classList.remove('active');
        });
        
        // Add active class to matching link
        const activeLink = document.querySelector(`a[href="#${sectionId}"]`);
        if (activeLink) {
          activeLink.classList.add('active');
          this.activeLink = activeLink;
        }
      }
      
      setInitialActive() {
        // Set initial active state based on current scroll position
        const scrollY = window.scrollY;
        let closestSection = null;
        let minDistance = Infinity;
        
        this.sections.forEach((section, href) => {
          const rect = section.getBoundingClientRect();
          const distance = Math.abs(rect.top);
          
          if (distance < minDistance && rect.top <= 100) {
            minDistance = distance;
            closestSection = section;
          }
        });
        
        if (closestSection) {
          this.setActiveLink(closestSection.id);
        }
      }
      
      destroy() {
        if (this.observer) {
          this.observer.disconnect();
        }
      }
    }

    // Initialize navigation observer
    new NavigationObserver();
  }

})();
