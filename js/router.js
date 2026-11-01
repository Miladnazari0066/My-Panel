const ROUTES = ['dashboard', 'tasks', 'loans'];
const PAGE_TITLES = {
  dashboard: 'داشبورد',
  tasks: 'برنامه امروز',
  loans: 'وام‌ها و اقساط',
};
const DEFAULT_ROUTE = 'dashboard';

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '').trim();
  return ROUTES.includes(hash) ? hash : DEFAULT_ROUTE;
}

export function initRouter() {
  function navigate() {
    const route = parseHash();

    document.querySelectorAll('[data-page]').forEach((el) => {
      el.classList.toggle('hidden', el.dataset.page !== route);
    });

    document.querySelectorAll('[data-nav]').forEach((el) => {
      el.classList.toggle('active', el.dataset.nav === route);
    });

    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      titleEl.textContent = PAGE_TITLES[route] || '';
      titleEl.style.animation = 'none';
      void titleEl.offsetWidth;
      titleEl.style.animation = '';
    }

    const activePage = document.querySelector(`[data-page="${route}"]`);
    if (activePage) {
      activePage.classList.remove('page-enter');
      void activePage.offsetWidth;
      activePage.classList.add('page-enter');
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.addEventListener('hashchange', navigate);

  if (!location.hash) {
    history.replaceState(null, '', '#/' + DEFAULT_ROUTE);
  }

  navigate();

  return navigate;
}