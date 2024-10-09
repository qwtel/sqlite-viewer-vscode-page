(() => {
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
    }, {
      threshold: 0.25,
    });

    document.querySelectorAll('.is-revealing').forEach(el => {
      el.style.opacity = '0';
      revealObserver.observe(el);
    });

    root.classList.add('anime-ready')
    /* global anime */
    anime.timeline({
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

    anime.timeline({
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

    anime({
      targets: '.hero-figure-box-01, .hero-figure-box-02, .hero-figure-box-03, .hero-figure-box-04, .hero-figure-box-08, .hero-figure-box-09, .hero-figure-box-10',
      duration: anime.random(600, 800),
      delay: anime.random(600, 800),
      rotate: [ anime.random(-360, 360), (el) => el.dataset.rotation],
      scale: [0.7, 1],
      opacity: [0, 1],
      easing: 'easeInOutExpo'
    })
  }

  const cards = document.getElementById('cards');
  const videos = cards.querySelectorAll('video');

  const inObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        videos.forEach(video => video.pause());
        const index = entry.target.style.getPropertyValue('--index');
        const video = videos[index - 1];
        video && video.play();
      } 
    }
  }, {
    threshold: 1.0,
  });

  const outObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) {
        const index = entry.target.style.getPropertyValue('--index');
        const video = videos[index - 1];
        video && video.pause();
      }
    }
  }, {
    threshold: 0.5,
  });

  document.querySelectorAll('.spy').forEach(div => {
    inObserver.observe(div);
    outObserver.observe(div);
  });
})()

