// main.js - copie email, nav actif, smooth scroll, burger menu, effets avancés
document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const copyBtn = document.getElementById('copyEmail');
  const links = document.querySelectorAll('.nav-link');
  const navToggle = document.getElementById('navToggle');
  const navList = document.getElementById('navList');
  const containerCard = document.querySelector('.container-card');
  const particles = document.querySelector('.particles');

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
    navToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const opened = navList.classList.toggle('show');
      navToggle.setAttribute('aria-expanded', opened ? 'true' : 'false');

      // toggle class for CSS-driven burger animation
      if (opened) {
        navToggle.classList.add('open');
        // Prevent body scroll when menu is open
        document.body.style.overflow = 'hidden';
      } else {
        navToggle.classList.remove('open');
        // Restore body scroll
        document.body.style.overflow = '';
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
        // Restore body scroll
        document.body.style.overflow = '';
      }
    });
  }

  // Close mobile nav on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && navList && navList.classList.contains('show')) {
      navList.classList.remove('show');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.classList.remove('open');
      // Restore body scroll
      document.body.style.overflow = '';
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

  // Effets avancés - Mouse tracking pour le container
  if (containerCard) {
    containerCard.addEventListener('mousemove', (e) => {
      const rect = containerCard.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      const rotateX = (y - centerY) / 10;
      const rotateY = (centerX - x) / 10;
      
      containerCard.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
    });

    containerCard.addEventListener('mouseleave', () => {
      containerCard.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0px)';
    });
  }

  // Effets de particules dynamiques
  if (particles) {
    const createParticle = () => {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = Math.random() * 100 + '%';
      particle.style.animationDuration = (Math.random() * 10 + 15) + 's';
      particle.style.animationDelay = Math.random() * 5 + 's';
      particles.appendChild(particle);

      setTimeout(() => {
        if (particle.parentNode) {
          particle.parentNode.removeChild(particle);
        }
      }, 25000);
    };

    // Créer des particules périodiquement
    setInterval(createParticle, 3000);
  }

  // Effet de typing pour le titre
  const title = document.querySelector('.card-title');
  if (title) {
    const text = title.textContent;
    title.textContent = '';
    let i = 0;
    
    const typeWriter = () => {
      if (i < text.length) {
        title.textContent += text.charAt(i);
        i++;
        setTimeout(typeWriter, 100);
      }
    };
    
    setTimeout(typeWriter, 1000);
  }

  // Effet de parallaxe pour les sections
  const cardSections = document.querySelectorAll('.card-section');
  cardSections.forEach((section, index) => {
    section.style.animationDelay = (index * 0.2) + 's';
  });
});
