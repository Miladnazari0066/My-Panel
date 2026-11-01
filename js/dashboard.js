import { supabase } from './supabase.js';

let currentUser = null;
let tasks = [];
let loans = [];
let payments = [];
let channel = null;
let initialized = false;

// ---------- utils ----------
function toPersianNum(n) {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMoney(amount) {
  const num = Math.round(Number(amount) || 0);
  try {
    return num.toLocaleString('fa-IR') + ' تومان';
  } catch {
    return toPersianNum(num) + ' تومان';
  }
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseDateLocal(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
}

function daysBetween(a, b) {
  const da = typeof a === 'string' ? parseDateLocal(a) : a;
  const db = typeof b === 'string' ? parseDateLocal(b) : b;
  if (!da || !db) return 0;
  da.setHours(0, 0, 0, 0);
  db.setHours(0, 0, 0, 0);
  return Math.round((db - da) / 86400000);
}

function computeLoanData(loan) {
  const loanPayments = payments.filter((p) => p.loan_id === loan.id);
  const total_amount = Number(loan.total_amount) || 0;
  const total_installments = Number(loan.total_installments) || 0;
  const installment_amount =
    Number(loan.installment_amount) > 0
      ? Number(loan.installment_amount)
      : total_installments > 0
      ? Math.round(total_amount / total_installments)
      : 0;

  const paid_count = loanPayments.length;
  const paid_amount = loanPayments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const remaining_amount = Math.max(0, total_amount - paid_amount);
  const remaining_installments = Math.max(0, total_installments - paid_count);
  const percent = total_amount > 0 ? Math.min(100, (paid_amount / total_amount) * 100) : 0;
  const is_complete = remaining_installments === 0 || remaining_amount <= 0;

  let nextDate = null;
  let daysLeft = null;
  let is_overdue = false;

  if (!is_complete && loan.start_date) {
    const start = parseDateLocal(loan.start_date);
    nextDate = addMonths(start, paid_count);
    daysLeft = daysBetween(new Date(), nextDate);
    is_overdue = daysLeft < 0;
  }

  return {
    ...loan,
    installment_amount,
    paid_count,
    paid_amount,
    remaining_amount,
    remaining_installments,
    percent,
    is_complete,
    is_overdue,
    nextDate,
    daysLeft,
  };
}

// ---------- data ----------
async function loadAllData() {
  if (!currentUser) return;
  const [tRes, lRes, pRes] = await Promise.all([
    supabase.from('tasks').select('*'),
    supabase.from('loans').select('*'),
    supabase.from('loan_payments').select('*'),
  ]);
  tasks = tRes.data || [];
  loans = lRes.data || [];
  payments = pRes.data || [];
}

// ---------- render: insight ----------
function renderInsight() {
  const banner = document.getElementById('insight-banner');
  const titleEl = document.getElementById('insight-title');
  const descEl = document.getElementById('insight-desc');
  if (!banner || !titleEl || !descEl) return;

  const today = todayStr();
  const todayTasks = tasks.filter((t) => !t.completed && t.due_date === today);
  const overdueLoans = loans.filter((l) => {
    const d = computeLoanData(l);
    return !d.is_complete && d.is_overdue;
  });
  const dueSoonLoans = loans.filter((l) => {
    const d = computeLoanData(l);
    return !d.is_complete && d.daysLeft !== null && d.daysLeft >= 0 && d.daysLeft <= 3;
  });

  banner.classList.remove(
    'hidden',
    'insight-success',
    'insight-info',
    'insight-warning',
    'insight-danger'
  );

  if (overdueLoans.length > 0) {
    banner.classList.add('insight-danger');
    titleEl.textContent = `${toPersianNum(overdueLoans.length)} قسط عقب‌افتاده داری ⚠️`;
    descEl.textContent = 'به بخش وام‌ها برو و پرداخت کن';
  } else if (todayTasks.length > 0 && dueSoonLoans.length > 0) {
    banner.classList.add('insight-warning');
    titleEl.textContent = `امروز ${toPersianNum(todayTasks.length)} تسک و ${toPersianNum(dueSoonLoans.length)} قسط نزدیک داری`;
    descEl.textContent = 'روز پرکاری داری، برنامه‌ریزی کن';
  } else if (todayTasks.length > 0) {
    banner.classList.add('insight-info');
    titleEl.textContent = `امروز ${toPersianNum(todayTasks.length)} تسک داری`;
    descEl.textContent = 'بریم انجامشون بدیم 💪';
  } else if (dueSoonLoans.length > 0) {
    banner.classList.add('insight-warning');
    titleEl.textContent = `${toPersianNum(dueSoonLoans.length)} قسط نزدیک سررسید داری`;
    descEl.textContent = 'به بخش وام‌ها سر بزن';
  } else {
    banner.classList.add('insight-success');
    titleEl.textContent = 'همه‌چیز مرتبه ✨';
    descEl.textContent = 'کار عقب‌افتاده یا قسط نزدیکی نداری';
  }
}

// ---------- render: weekly chart ----------
function getWeeklyData() {
  const labels = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
    const completed = tasks.filter(
      (t) => t.completed && t.completed_at && t.completed_at.startsWith(key)
    ).length;
    days.push({
      label: labels[d.getDay()],
      completed,
    });
  }
  return days;
}

function renderWeeklyChart() {
  const el = document.getElementById('weekly-chart');
  const totalEl = document.getElementById('weekly-total');
  if (!el) return;

  const data = getWeeklyData();
  const max = Math.max(1, ...data.map((d) => d.completed));
  const total = data.reduce((s, d) => s + d.completed, 0);

  if (totalEl) totalEl.textContent = `${toPersianNum(total)} کار`;

  el.innerHTML = data
    .map((d, i) => {
      const height = d.completed > 0 ? Math.max(8, (d.completed / max) * 100) : 3;
      const active = d.completed > 0;
      return `
        <div class="chart-bar-wrap">
          <div class="chart-bar-container">
            ${active ? `<div class="chart-bar-value">${toPersianNum(d.completed)}</div>` : ''}
            <div class="chart-bar${active ? ' active' : ''}" style="height:${height}%;animation-delay:${i * 60}ms"></div>
          </div>
          <div class="chart-bar-label">${d.label}</div>
        </div>
      `;
    })
    .join('');
}

// ---------- render: tasks preview ----------
function renderTasksPreview() {
  const el = document.getElementById('dashboard-tasks-preview');
  const emptyEl = document.getElementById('dashboard-tasks-empty');
  const emptyTextEl = document.getElementById('dashboard-tasks-empty-text');
  if (!el || !emptyEl) return;

  const today = todayStr();
  const order = { high: 0, medium: 1, low: 2 };
  const todayIncomplete = tasks
    .filter((t) => !t.completed && t.due_date === today)
    .sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
  const todayCompleted = tasks.filter((t) => t.completed && t.due_date === today).length;

  if (!todayIncomplete.length) {
    el.innerHTML = '';
    emptyEl.classList.remove('hidden');
    if (emptyTextEl) {
      emptyTextEl.textContent =
        todayCompleted > 0
          ? `🎉 همه ${toPersianNum(todayCompleted)} تسک امروز انجام شده!`
          : 'تسکی برای امروز نداری';
    }
    return;
  }

  emptyEl.classList.add('hidden');
  const shown = todayIncomplete.slice(0, 5);
  let html = shown
    .map(
      (t, i) => `
      <a href="#/tasks" class="dashboard-task-item dashboard-task-${t.priority || 'medium'}" style="animation-delay:${i * 50}ms">
        <span class="dashboard-task-priority-dot"></span>
        <div class="dashboard-task-body">
          <div class="dashboard-task-title">${escapeHtml(t.title)}</div>
          ${t.description ? `<div class="dashboard-task-desc">${escapeHtml(t.description)}</div>` : ''}
        </div>
      </a>
    `
    )
    .join('');

  if (todayIncomplete.length > 5) {
    html += `<a href="#/tasks" class="dashboard-more-link">+ ${toPersianNum(todayIncomplete.length - 5)} تسک دیگر</a>`;
  }
  el.innerHTML = html;
}

// ---------- render: upcoming ----------
function getUpcomingItems() {
  const items = [];
  const today = todayStr();

  tasks
    .filter((t) => !t.completed && t.due_date && t.due_date > today)
    .forEach((t) => {
      const diff = daysBetween(today, t.due_date);
      if (diff >= 0 && diff <= 7) {
        items.push({ kind: 'task', diff, data: t });
      }
    });

  loans.forEach((l) => {
    const d = computeLoanData(l);
    if (!d.is_complete && d.daysLeft !== null && d.daysLeft >= -7 && d.daysLeft <= 7) {
      items.push({ kind: 'installment', diff: d.daysLeft, data: l, loanData: d });
    }
  });

  return items.sort((a, b) => a.diff - b.diff);
}

function relativeDay(diff) {
  if (diff < 0) return `${toPersianNum(Math.abs(diff))} روز گذشته`;
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'فردا';
  return `${toPersianNum(diff)} روز آینده`;
}

function renderUpcoming() {
  const el = document.getElementById('dashboard-upcoming');
  const emptyEl = document.getElementById('dashboard-upcoming-empty');
  if (!el || !emptyEl) return;

  const items = getUpcomingItems();

  if (!items.length) {
    el.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }

  emptyEl.classList.add('hidden');
  el.innerHTML = items
    .slice(0, 5)
    .map((item, i) => {
      if (item.kind === 'task') {
        const p = item.data.priority;
        const pLabel = p === 'high' ? 'زیاد' : p === 'low' ? 'کم' : 'متوسط';
        return `
          <a href="#/tasks" class="upcoming-item" style="animation-delay:${i * 50}ms">
            <div class="upcoming-day-badge upcoming-day-task">${relativeDay(item.diff)}</div>
            <div class="upcoming-content">
              <div class="upcoming-title">${escapeHtml(item.data.title)}</div>
              <div class="upcoming-meta">تسک · اولویت ${pLabel}</div>
            </div>
          </a>
        `;
      }
      const d = item.loanData;
      const badgeClass = item.diff < 0 ? 'upcoming-day-overdue' : 'upcoming-day-installment';
      return `
        <a href="#/loans" class="upcoming-item" style="animation-delay:${i * 50}ms">
          <div class="upcoming-day-badge ${badgeClass}">${relativeDay(item.diff)}</div>
          <div class="upcoming-content">
            <div class="upcoming-title">قسط ${escapeHtml(item.data.title)}</div>
            <div class="upcoming-meta">${formatMoney(d.installment_amount)}</div>
          </div>
        </a>
      `;
    })
    .join('');
}

// ---------- main render ----------
function render() {
  renderInsight();
  renderWeeklyChart();
  renderTasksPreview();
  renderUpcoming();
}

// ---------- realtime ----------
function subscribeRealtime() {
  if (!currentUser) return;

  channel = supabase
    .channel(`dashboard-${currentUser.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${currentUser.id}` },
      handleRealtime
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'loans', filter: `user_id=eq.${currentUser.id}` },
      handleRealtime
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'loan_payments',
        filter: `user_id=eq.${currentUser.id}`,
      },
      handleRealtime
    )
    .subscribe();
}

let realtimeTimer = null;
function handleRealtime() {
  if (realtimeTimer) clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(async () => {
    await loadAllData();
    render();
  }, 200);
}

// ---------- route change ----------
function handleHashChange() {
  if (!currentUser) return;
  const route = location.hash.replace(/^#\/?/, '').trim();
  if (route === 'dashboard' || route === '') {
    loadAllData().then(render);
  }
}

// ---------- public ----------
export async function initDashboard(user) {
  if (currentUser?.id === user?.id && user && initialized) return;

  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }

  currentUser = user;
  tasks = [];
  loans = [];
  payments = [];

  if (!user) {
    initialized = false;
    return;
  }

  if (!initialized) {
    window.addEventListener('hashchange', handleHashChange);
    initialized = true;
  }

  await loadAllData();
  render();
  subscribeRealtime();
}