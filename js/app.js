import { supabase } from './supabase.js';
import { initAuth } from './auth.js';
import { initTheme } from './theme.js';
import { initRouter } from './router.js';
import { initToastDelegation } from './ui.js';
import { initTasks } from './tasks.js';

const $ = (sel) => document.querySelector(sel);

const loadingScreen = $('#loading-screen');
const authScreen = $('#auth-screen');
const mainApp = $('#main-app');

let authInitialized = false;
let navigate = null;

function hideLoading() {
  loadingScreen.classList.add('fade-out');
}

function showAuth() {
  authScreen.classList.remove('hidden');
  mainApp.classList.add('hidden');
}

function showMain(user) {
  authScreen.classList.add('hidden');
  mainApp.classList.remove('hidden');
  if (user) {
    updateUserUI(user);
    initTasks(user);
  }
  if (navigate) navigate();
}

function getGreeting(hour) {
  if (hour >= 5 && hour < 12) return 'صبح بخیر';
  if (hour >= 12 && hour < 17) return 'ظهر بخیر';
  if (hour >= 17 && hour < 20) return 'عصر بخیر';
  return 'شب بخیر';
}

function updateUserUI(user) {
  const fullName = (user.user_metadata && user.user_metadata.full_name) || '';
  const email = user.email || '';
  const firstName = fullName.split(' ')[0] || (email ? email.split('@')[0] : 'دوست');
  const initialSource = fullName || email;
  const initial = (initialSource.charAt(0) || 'U').toUpperCase();

  document.querySelectorAll('#user-avatar, #user-avatar-large').forEach((el) => {
    el.textContent = initial;
  });

  const nameEl = $('#user-name');
  if (nameEl) nameEl.textContent = fullName || 'کاربر';

  const emailEl = $('#user-email');
  if (emailEl) emailEl.textContent = email || '-';

  const greetingEl = $('#greeting-text');
  if (greetingEl) {
    const hour = new Date().getHours();
    greetingEl.textContent = `${getGreeting(hour)}، ${firstName} 👋`;
  }

  const dateEl = $('#greeting-date');
  if (dateEl) {
    try {
      dateEl.textContent = new Intl.DateTimeFormat('fa-IR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date());
    } catch {
      dateEl.textContent = new Date().toLocaleDateString();
    }
  }
}

function setupUserMenu() {
  const avatarBtn = $('#user-avatar');
  const dropdown = $('#user-dropdown');
  const logoutBtn = $('#logout-btn');

  if (avatarBtn && dropdown) {
    avatarBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('open');
    });

    document.addEventListener('click', () => {
      dropdown.classList.remove('open');
    });

    dropdown.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (dropdown) dropdown.classList.remove('open');
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.error('Logout failed:', err);
      }
    });
  }
}

async function bootstrap() {
  initTheme();
  initAuth();
  initToastDelegation();
  setupUserMenu();

  let session = null;
  try {
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch (err) {
    console.error('Session fetch failed:', err);
  }

  if (session) {
    showMain(session.user);
  } else {
    showAuth();
  }

  navigate = initRouter();
  if (session) navigate();

  hideLoading();
  authInitialized = true;

  supabase.auth.onAuthStateChange((event, newSession) => {
    if (!authInitialized) return;

    if (event === 'SIGNED_IN' && newSession) {
      showMain(newSession.user);
    } else if (event === 'SIGNED_OUT') {
      initTasks(null);
      showAuth();
    } else if (event === 'TOKEN_REFRESHED' && newSession) {
      updateUserUI(newSession.user);
    }
  });
}

bootstrap();