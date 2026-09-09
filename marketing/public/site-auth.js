(function () {
  var sessionPromise = window.__seonbaeSessionPromise || fetch('/api/auth/session', {
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  }).then(function (response) {
    return response.ok ? response.json() : { authenticated: false };
  }).catch(function () {
    return { authenticated: false };
  });

  function language() {
    return document.documentElement.dataset.lang === 'en' ? 'en' : 'ko';
  }

  function marketingPath(path, lang) {
    return lang === 'en' ? '/en' + path : path;
  }

  function render(session) {
    var authenticated = Boolean(session && session.authenticated);
    var lang = language();

    document.querySelectorAll('[data-auth-primary]').forEach(function (link) {
      link.classList.remove('auth-pending');
      link.removeAttribute('aria-busy');
      link.removeAttribute('aria-hidden');
      link.removeAttribute('tabindex');
      link.href = authenticated ? '#' : (lang === 'en' ? '/login?lang=en' : '/login');
      link.classList.toggle('is-logout', authenticated);
      var label = link.querySelector('[data-auth-primary-label]');
      if (label) label.textContent = authenticated
        ? (lang === 'ko' ? '로그아웃' : 'Log out')
        : (lang === 'ko' ? '로그인' : 'Log in');

      if (!link.dataset.logoutBound) {
        link.dataset.logoutBound = 'true';
        link.addEventListener('click', function (event) {
          if (!link.classList.contains('is-logout')) return;
          event.preventDefault();
          link.setAttribute('aria-busy', 'true');
          if (label) label.textContent = lang === 'ko' ? '로그아웃 중...' : 'Logging out...';
          fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { Accept: 'application/json' },
          }).finally(function () {
            window.location.assign(lang === 'en' ? '/en/' : '/');
          });
        });
      }
    });

    document.querySelectorAll('[data-auth-portal]').forEach(function (link) {
      link.href = authenticated ? (session.destination || '/portal') : marketingPath('/get-matched', lang);
      var label = link.querySelector('[data-auth-portal-label]');
      if (label) label.textContent = authenticated
        ? (lang === 'ko' ? '포털' : 'Portal')
        : (lang === 'ko' ? '시작하기' : 'Get started');
    });

  }

  async function refresh() {
    var session = await sessionPromise;
    render(session);
    return session;
  }

  document.querySelectorAll('[data-set-lang]').forEach(function (button) {
    button.addEventListener('click', function () {
      sessionPromise.then(function (session) {
        window.requestAnimationFrame(function () { render(session); });
      });
    });
  });

  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    sessionPromise = fetch('/api/auth/session', {
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    }).then(function (response) {
      return response.ok ? response.json() : { authenticated: false };
    });
    refresh();
  });

  refresh();
})();
