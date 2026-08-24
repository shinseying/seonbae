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

  function render(session) {
    var authenticated = Boolean(session && session.authenticated);
    var lang = language();

    document.querySelectorAll('[data-auth-primary]').forEach(function (link) {
      link.classList.remove('auth-pending');
      link.removeAttribute('aria-busy');
      link.removeAttribute('aria-hidden');
      link.removeAttribute('tabindex');
      link.href = authenticated ? '#' : '/login';
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
            window.location.assign('/');
          });
        });
      }
    });

    document.querySelectorAll('[data-auth-portal]').forEach(function (link) {
      link.href = authenticated ? (session.destination || '/portal') : '/get-matched';
      var label = link.querySelector('[data-auth-portal-label]');
      if (label) label.textContent = authenticated
        ? (lang === 'ko' ? '포털' : 'Portal')
        : (lang === 'ko' ? '시작하기' : 'Get started');
    });

    // A returning signed-in user goes straight to their own portal, but only on
    // the first homepage load of the browsing session. After that the homepage
    // is somewhere they chose to be — leaving the portal must not bounce them
    // back. ?stay=1 still opts out of even the first redirect.
    if (
      authenticated
      && window.location.pathname === '/'
      && new URLSearchParams(window.location.search).get('stay') !== '1'
    ) {
      var redirected = false;
      try {
        redirected = window.sessionStorage.getItem('seonbae-portal-redirected') === '1';
      } catch (e) {
        // Private mode without storage: redirect once per page load instead.
      }
      if (!redirected) {
        try {
          window.sessionStorage.setItem('seonbae-portal-redirected', '1');
        } catch (e) {}
        window.location.replace(session.destination || '/portal');
      }
    }
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
