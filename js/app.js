import { supabase } from './supabase.js';
import { initAuth } from './auth.js';

const $ = (sel) => document.querySelector(sel);

const loadingScreen = $('#loading-screen');
const authScreen = $('#auth-screen');
const mainApp = $('#main-app');

let authInitialized = false;

function hideLoading() {
  loadingScreen.classList.add('fade-out');
}

function showAuth() {
  authScreen.classList.remove('hidden');
  mainApp.classList.add('hidden');
}

function showMain() {
  authScreen.classList.add('hidden');
  mainApp.classList.remove('hidden');
}

async function bootstrap() {
  // init theme
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  initAuth();

  // wait a bit for the initial session check
  const { data: { session } } = await supabase.auth.getSession();

  if (session) {
    showMain();
  } else {
    showAuth();
  }
  hideLoading();
  authInitialized = true;

  // respond to future auth changes
  supabase.auth.onAuthStateChange((event, session) => {
    if (!authInitialized) return;
    if (event === 'SIGNED_IN' && session) {
      showMain();
    } else if (event === 'SIGNED_OUT') {
      showAuth();
    }
  });

  // logout
  const logoutBtn = $('#logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await supabase.auth.signOut();
    });
  }
}

bootstrap();