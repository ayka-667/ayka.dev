// main.js - copie email, nav actif, smooth scroll, burger menu
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const copyBtn = document.getElementById('copyEmail');
  const links = document.querySelectorAll('.nav-link');
  const navToggle = document.getElementById('navToggle');
  const navList = document.getElementById('navList');

  // Copier l'email
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const email = 'contact@ayka.dev';
      try {
        await navigator.clipboard.writeText(email);
        const prev = copyBtn.textContent;
        copyBtn.textContent = 'Copié !';
        setTimeout(() => copyBtn.textContent = prev, 1400);
      } catch (err) {
        // fallback : ouvrir mailto
        window.location.href = 'mailto:' + email;
      }
    });
  }

  // Smooth scroll et gestion active
  function setActiveFromHash() {
    links.forEach(l => l.classList.remove('active'));
    const hash = window.location.hash || '#home';
    const active = document.querySelector(`.nav-link[href="${hash}"]`);
    if (active) active.classList.add('active');
  }

  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const href = a.getAttribute('href');
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        // close mobile menu if open
        if (navList && navList.classList.contains('show')) {
          navList.classList.remove('show');
          navToggle.setAttribute('aria-expanded', 'false');
          navToggle.classList.remove('open');
        }
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        history.replaceState(null, '', href);
        setActiveFromHash();
      }
    });
  });

  setActiveFromHash();
  window.addEventListener('hashchange', setActiveFromHash);

  // Burger menu toggle (mobile)
  if (navToggle && navList) {
    navToggle.addEventListener('click', () => {
      const opened = navList.classList.toggle('show');
      navToggle.setAttribute('aria-expanded', opened ? 'true' : 'false');

      // toggle class for CSS-driven burger animation
      if (opened) {
        navToggle.classList.add('open');
      } else {
        navToggle.classList.remove('open');
      }
    });

    // Close menu when clicking outside
    document.addEventListener('click', (e) => {
      if (!navList.classList.contains('show')) return;
      const inside = navList.contains(e.target) || navToggle.contains(e.target);
      if (!inside) {
        navList.classList.remove('show');
        navToggle.setAttribute('aria-expanded', 'false');
        navToggle.classList.remove('open');
      }
    });
  }

  // Close mobile nav on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navList && navList.classList.contains('show')) {
      navList.classList.remove('show');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.classList.remove('open');
    }
  });

  // Optional: highlight nav when scrolling near sections (adds progressive active state)
  const sections = document.querySelectorAll('main [id]');
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = '#' + entry.target.id;
          links.forEach(l => l.classList.toggle('active', l.getAttribute('href') === id));
        }
      });
    }, { root: null, rootMargin: '0px 0px -40% 0px', threshold: 0.25 });

    sections.forEach(s => obs.observe(s));
  }
});
