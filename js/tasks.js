import { supabase } from './supabase.js';
import { showToast } from './ui.js';
import { confirmDialog } from './modal.js';

let currentUser = null;
let tasks = [];
let filter = 'all';
let priorityFilter = 'all';
let subscription = null;
let listenersAttached = false;

const PRIORITY_LABELS = { low: 'کم', medium: 'متوسط', high: 'زیاد' };

// ---------- utils ----------
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toPersianNum(n) {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
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

function isToday(str) {
  return str === todayStr();
}

function isWithinWeek(str) {
  if (!str) return false;
  const d = parseDateLocal(str);
  const today = parseDateLocal(todayStr());
  const diff = Math.round((d - today) / 86400000);
  return diff >= 0 && diff <= 7;
}

function formatDueDate(str) {
  if (!str) return '';
  const d = parseDateLocal(str);
  const today = parseDateLocal(todayStr());
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'امروز';
  if (diff === 1) return 'فردا';
  if (diff === -1) return 'دیروز';
  if (diff < -1 && diff >= -30) return `${toPersianNum(Math.abs(diff))} روز پیش`;
  if (diff > 1 && diff <= 7) return `${toPersianNum(diff)} روز آینده`;
  if (diff < -30) return 'گذشته';
  try {
    return new Intl.DateTimeFormat('fa-IR', { month: 'short', day: 'numeric' }).format(d);
  } catch {
    return str;
  }
}

// ---------- render ----------
function getFilteredTasks() {
  return tasks.filter((t) => {
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (filter === 'today') return isToday(t.due_date) && !t.completed;
    if (filter === 'week') return isWithinWeek(t.due_date) && !t.completed;
    if (filter === 'completed') return t.completed;
    return !t.completed;
  });
}

function render() {
  const listEl = document.getElementById('tasks-list');
  const emptyEl = document.getElementById('tasks-empty');
  if (!listEl || !emptyEl) return;

  const filtered = getFilteredTasks();

  if (!filtered.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    return;
  }
  emptyEl.classList.add('hidden');

  listEl.innerHTML = filtered.map((task, i) => {
    const due = task.due_date
      ? `<span class="task-due">${escapeHtml(formatDueDate(task.due_date))}</span>`
      : '';
    const pri = PRIORITY_LABELS[task.priority] || '';
    return `
      <div class="task-item ${task.completed ? 'completed' : ''}" data-task-id="${task.id}" style="animation-delay:${i * 40}ms">
        <button type="button" class="task-check" data-action="toggle" aria-label="تغییر وضعیت">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
        <div class="task-content" data-action="edit">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.description ? `<div class="task-desc">${escapeHtml(task.description)}</div>` : ''}
          <div class="task-meta">
            <span class="task-priority priority-${task.priority}">${pri}</span>
            ${due}
          </div>
        </div>
        <button type="button" class="task-delete" data-action="delete" aria-label="حذف">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </div>
    `;
  }).join('');
}

function updateStats() {
  const today = todayStr();
  const count = tasks.filter((t) => !t.completed && t.due_date === today).length;

  let el = document.querySelector('[data-stat="today-tasks"]');
  if (!el) {
    const labels = document.querySelectorAll('[data-page="dashboard"] .stat-label');
    for (const label of labels) {
      if (label.textContent.trim() === 'تسک‌های امروز') {
        el = label.parentElement.querySelector('.stat-value');
        break;
      }
    }
  }
  if (el) el.textContent = toPersianNum(count);
}

// ---------- data ----------
async function loadTasks() {
  if (!currentUser) return;
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Load tasks failed:', error);
    showToast('خطا در بارگذاری تسک‌ها', 'error');
    return;
  }
  tasks = data || [];
  render();
  updateStats();
}

async function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const oldCompleted = task.completed;
  const oldCompletedAt = task.completed_at;
  const newCompleted = !oldCompleted;

  task.completed = newCompleted;
  task.completed_at = newCompleted ? new Date().toISOString() : null;
  render();
  updateStats();

  const { error } = await supabase
    .from('tasks')
    .update({
      completed: newCompleted,
      completed_at: newCompleted ? new Date().toISOString() : null,
    })
    .eq('id', id);

  if (error) {
    console.error('Toggle failed:', error);
    task.completed = oldCompleted;
    task.completed_at = oldCompletedAt;
    render();
    updateStats();
    showToast('خطا در بروزرسانی', 'error');
  }
}

async function deleteTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const confirmed = await confirmDialog({
    title: 'حذف تسک',
    message: `آیا از حذف «${task.title}» مطمئنی؟ این عمل قابل بازگشت نیست.`,
    okText: 'حذف',
    danger: true,
  });

  if (!confirmed) return;

  const { error } = await supabase.from('tasks').delete().eq('id', id);

  if (error) {
    console.error('Delete failed:', error);
    showToast('خطا در حذف تسک', 'error');
    return;
  }

  tasks = tasks.filter((t) => t.id !== id);
  render();
  updateStats();
  showToast('تسک حذف شد');
}

// ---------- modal ----------
function openTaskModal(task = null) {
  const modal = document.getElementById('task-modal');
  const backdrop = document.getElementById('task-modal-backdrop');
  const titleEl = document.getElementById('task-modal-title');
  const idInput = document.getElementById('task-id');
  const titleInput = document.getElementById('task-title');
  const descInput = document.getElementById('task-description');
  const priorityInput = document.getElementById('task-priority');
  const dueInput = document.getElementById('task-due-date');
  const errorEl = document.getElementById('task-modal-error');

  if (!modal) return;

  errorEl.textContent = '';
  errorEl.classList.add('hidden');

  if (task) {
    titleEl.textContent = 'ویرایش تسک';
    idInput.value = task.id;
    titleInput.value = task.title || '';
    descInput.value = task.description || '';
    priorityInput.value = task.priority || 'medium';
    dueInput.value = task.due_date || '';
  } else {
    titleEl.textContent = 'تسک جدید';
    idInput.value = '';
    titleInput.value = '';
    descInput.value = '';
    priorityInput.value = 'medium';
    dueInput.value = todayStr();
  }

  modal.classList.add('open');
  backdrop.classList.add('open');
  setTimeout(() => titleInput.focus(), 120);
}

function closeTaskModal() {
  document.getElementById('task-modal')?.classList.remove('open');
  document.getElementById('task-modal-backdrop')?.classList.remove('open');
}

async function handleTaskSubmit(e) {
  e.preventDefault();

  const idInput = document.getElementById('task-id');
  const titleInput = document.getElementById('task-title');
  const descInput = document.getElementById('task-description');
  const priorityInput = document.getElementById('task-priority');
  const dueInput = document.getElementById('task-due-date');
  const errorEl = document.getElementById('task-modal-error');
  const submitBtn = document.getElementById('task-submit-btn');
  const loader = submitBtn.querySelector('.btn-loader');
  const btnText = submitBtn.querySelector('.btn-text');

  const title = titleInput.value.trim();
  const description = descInput.value.trim();
  const priority = priorityInput.value;
  const due_date = dueInput.value || null;

  errorEl.classList.add('hidden');

  if (!title) {
    errorEl.textContent = 'عنوان تسک الزامی است';
    errorEl.classList.remove('hidden');
    titleInput.focus();
    return;
  }

  if (title.length > 200) {
    errorEl.textContent = 'عنوان نباید بیشتر از ۲۰۰ کاراکتر باشد';
    errorEl.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  btnText.classList.add('hidden');
  loader.classList.remove('hidden');

  const isEdit = !!idInput.value;

  try {
    if (isEdit) {
      const { data, error } = await supabase
        .from('tasks')
        .update({ title, description: description || null, priority, due_date })
        .eq('id', idInput.value)
        .select()
        .single();

      if (error) throw error;
      const idx = tasks.findIndex((t) => t.id === idInput.value);
      if (idx >= 0 && data) tasks[idx] = data;
    } else {
      const { data, error } = await supabase
        .from('tasks')
        .insert({
          user_id: currentUser.id,
          title,
          description: description || null,
          priority,
          due_date,
        })
        .select()
        .single();

      if (error) throw error;
      if (data && !tasks.find((t) => t.id === data.id)) {
        tasks.unshift(data);
      }
    }

    render();
    updateStats();
    closeTaskModal();
    showToast(isEdit ? 'تسک بروزرسانی شد' : 'تسک اضافه شد');
  } catch (err) {
    console.error('Save task failed:', err);
    errorEl.textContent = 'خطا در ذخیره. دوباره تلاش کن';
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    btnText.classList.remove('hidden');
    loader.classList.add('hidden');
  }
}

// ---------- real-time ----------
function subscribeToChanges() {
  if (!currentUser) return;

  subscription = supabase
    .channel(`tasks-${currentUser.id}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tasks',
        filter: `user_id=eq.${currentUser.id}`,
      },
      handleRealtime
    )
    .subscribe();
}

function handleRealtime(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  if (eventType === 'INSERT' && newRow) {
    if (!tasks.find((t) => t.id === newRow.id)) tasks.unshift(newRow);
  } else if (eventType === 'UPDATE' && newRow) {
    const idx = tasks.findIndex((t) => t.id === newRow.id);
    if (idx >= 0) tasks[idx] = newRow;
  } else if (eventType === 'DELETE') {
    const id = oldRow?.id;
    if (id) tasks = tasks.filter((t) => t.id !== id);
  }

  render();
  updateStats();
}

// ---------- listeners ----------
function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  document.querySelectorAll('[data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filter = btn.dataset.filter;
      document
        .querySelectorAll('[data-filter]')
        .forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  });

  document.querySelectorAll('[data-priority]').forEach((btn) => {
    btn.addEventListener('click', () => {
      priorityFilter = btn.dataset.priority;
      document
        .querySelectorAll('[data-priority]')
        .forEach((b) => b.classList.toggle('active', b === btn));
      render();
    });
  });

  document.getElementById('add-task-btn')?.addEventListener('click', () => openTaskModal());
  document.getElementById('tasks-fab')?.addEventListener('click', () => openTaskModal());

  document.getElementById('tasks-list')?.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const taskEl = actionEl.closest('[data-task-id]');
    if (!taskEl) return;
    const id = taskEl.dataset.taskId;
    const action = actionEl.dataset.action;

    if (action === 'toggle') toggleTask(id);
    else if (action === 'delete') deleteTask(id);
    else if (action === 'edit') {
      const task = tasks.find((t) => t.id === id);
      if (task) openTaskModal(task);
    }
  });

  document.getElementById('task-form')?.addEventListener('submit', handleTaskSubmit);

  document.querySelectorAll('[data-task-modal-close]').forEach((el) => {
    el.addEventListener('click', closeTaskModal);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeTaskModal();
  });
}

// ---------- public ----------
export function initTasks(user) {
  if (currentUser?.id === user?.id && user) return;

  if (subscription) {
    supabase.removeChannel(subscription);
    subscription = null;
  }

  currentUser = user;
  tasks = [];

  if (!user) {
    render();
    updateStats();
    return;
  }

  attachListeners();
  loadTasks();
  subscribeToChanges();
}