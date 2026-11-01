import { supabase } from './supabase.js';

let mode = 'login'; // 'login' | 'signup'

const $ = (sel) => document.querySelector(sel);

const els = {
  form: $('#auth-form'),
  email: $('#email'),
  password: $('#password'),
  fullName: $('#full-name'),
  nameGroup: $('#name-group'),
  submit: $('#auth-submit'),
  submitText: $('#submit-text'),
  submitLoader: $('#submit-loader'),
  error: $('#auth-error'),
  title: $('#auth-title'),
  subtitle: $('#auth-subtitle'),
  switchHint: $('#switch-hint'),
  switchMode: $('#switch-mode'),
  togglePassword: $('#toggle-password'),
};

function setMode(newMode) {
  mode = newMode;
  if (mode === 'login') {
    els.title.textContent = 'خوش آمدید';
    els.subtitle.textContent = 'برای ادامه وارد حساب خود شوید';
    els.submitText.textContent = 'ورود';
    els.switchHint.textContent = 'حساب ندارید؟';
    els.switchMode.textContent = 'ثبت‌نام کنید';
    els.nameGroup.classList.add('hidden');
    els.password.autocomplete = 'current-password';
  } else {
    els.title.textContent = 'ساخت حساب جدید';
    els.subtitle.textContent = 'شروع یک مسیر منظم';
    els.submitText.textContent = 'ثبت‌نام';
    els.switchHint.textContent = 'حساب دارید؟';
    els.switchMode.textContent = 'وارد شوید';
    els.nameGroup.classList.remove('hidden');
    els.password.autocomplete = 'new-password';
  }
  hideError();
}

function showError(msg) {
  els.error.textContent = msg;
  els.error.classList.add('show');
}
function hideError() {
  els.error.classList.remove('show');
}

function setLoading(loading) {
  els.submit.disabled = loading;
  els.submitText.classList.toggle('hidden', loading);
  els.submitLoader.classList.toggle('hidden', !loading);
}

function translateError(msg) {
  const map = {
    'Invalid login credentials': 'ایمیل یا رمز عبور اشتباه است',
    'User already registered': 'این ایمیل قبلاً ثبت شده است',
    'Email not confirmed': 'ایمیل شما تأیید نشده است. ایمیل خود را چک کنید',
    'Password should be at least 6 characters': 'رمز عبور باید حداقل ۶ کاراکتر باشد',
    'Unable to validate email address: invalid format': 'فرمت ایمیل صحیح نیست',
    'Signups not allowed for this instance': 'ثبت‌نام غیرفعال است',
  };
  return map[msg] || msg || 'خطایی رخ داد. دوباره تلاش کنید';
}

async function handleSubmit(e) {
  e.preventDefault();
  hideError();

  const email = els.email.value.trim();
  const password = els.password.value;

  if (!email || !password) {
    showError('ایمیل و رمز عبور را وارد کنید');
    return;
  }
  if (password.length < 6) {
    showError('رمز عبور باید حداقل ۶ کاراکتر باشد');
    return;
  }

  setLoading(true);
  try {
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const fullName = els.fullName.value.trim();
      if (!fullName) {
        showError('نام خود را وارد کنید');
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });
      if (error) throw error;
      // اگر ایمیل تأیید لازم باشه، session null برمیگرده
      if (!data.session) {
        showError('ثبت‌نام موفق! لطفاً ایمیل خود را برای تأیید چک کنید');
        setLoading(false);
        return;
      }
    }
    // onAuthStateChange در app.js بقیه کارها رو انجام میده
  } catch (err) {
    showError(translateError(err.message));
    setLoading(false);
  }
}

export function initAuth() {
  els.form.addEventListener('submit', handleSubmit);

  els.switchMode.addEventListener('click', () => {
    setMode(mode === 'login' ? 'signup' : 'login');
  });

  els.togglePassword.addEventListener('click', () => {
    const isPassword = els.password.type === 'password';
    els.password.type = isPassword ? 'text' : 'password';
  });

  setMode('login');
}