import { supabase } from './supabase.js';
import { showToast } from './ui.js';
import { confirmDialog } from './modal.js';

let currentUser = null;
let loans = [];
let payments = [];
let listenersAttached = false;
let loansSubscription = null;
let paymentsSubscription = null;
let activePaymentLoanId = null;

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
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  return d;
}

function formatPersianDate(date) {
  try {
    return new Intl.DateTimeFormat('fa-IR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
}

function daysUntil(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(date.getTime());
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

// ---------- compute ----------
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
    daysLeft = daysUntil(nextDate);
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
    payments: loanPayments,
  };
}

function dueText(data) {
  if (data.is_complete) return '';
  if (data.daysLeft === null) return '';
  if (data.daysLeft < 0) return `${toPersianNum(Math.abs(data.daysLeft))} روز گذشته`;
  if (data.daysLeft === 0) return 'سررسید امروز';
  if (data.daysLeft === 1) return 'سررسید فردا';
  if (data.daysLeft <= 7) return `${toPersianNum(data.daysLeft)} روز آینده`;
  return formatPersianDate(data.nextDate);
}

// ---------- render ----------
function renderLoanCard(loan, index) {
  const d = computeLoanData(loan);
  let badgeClass = 'loan-badge';
  let badgeText = 'فعال';
  if (d.is_overdue) {
    badgeClass += ' loan-badge-overdue';
    badgeText = 'عقب‌افتاده';
  } else if (d.is_complete) {
    badgeClass += ' loan-badge-complete';
    badgeText = 'تکمیل شده';
  }

  const cardClass = `loan-card${d.is_overdue ? ' loan-overdue' : ''}${d.is_complete ? ' loan-complete' : ''}`;

  const footerAction = d.is_complete
    ? `<div class="loan-complete-msg">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
           <polyline points="20 6 9 17 4 12"/>
         </svg>
         <span>تکمیل شده 🎉</span>
       </div>`
    : `<div class="loan-due-info ${d.is_overdue ? 'loan-due-overdue' : ''}">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <rect x="3" y="4" width="18" height="18" rx="2"/>
           <line x1="16" y1="2" x2="16" y2="6"/>
           <line x1="8" y1="2" x2="8" y2="6"/>
           <line x1="3" y1="10" x2="21" y2="10"/>
         </svg>
         <span>${dueText(d)}</span>
       </div>
       <button type="button" class="loan-pay-btn" data-action="pay" data-loan-id="${loan.id}">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
           <line x1="12" y1="1" x2="12" y2="23"/>
           <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
         </svg>
         <span>پرداخت قسط (${formatMoney(d.installment_amount)})</span>
       </button>`;

  return `
    <div class="${cardClass}" data-loan-id="${loan.id}" style="animation-delay:${index * 60}ms">
      <div class="loan-card-header">
        <div class="loan-card-title-wrap">
          <div class="loan-card-title">${escapeHtml(loan.title)}</div>
          <span class="${badgeClass}">${badgeText}</span>
        </div>
        <div class="loan-card-actions">
          <button type="button" class="loan-action-btn" data-action="history" data-loan-id="${loan.id}" aria-label="تاریخچه">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v5h5"/>
              <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/>
              <path d="M12 7v5l4 2"/>
            </svg>
          </button>
          <button type="button" class="loan-action-btn" data-action="edit" data-loan-id="${loan.id}" aria-label="ویرایش">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button type="button" class="loan-action-btn loan-action-delete" data-action="delete" data-loan-id="${loan.id}" aria-label="حذف">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
      </div>

      <div class="loan-progress">
        <div class="loan-progress-bar">
          <div class="loan-progress-fill" style="width:${d.percent}%"></div>
        </div>
        <div class="loan-progress-text">
          <span>${toPersianNum(d.paid_count)} از ${toPersianNum(d.remaining_installments + d.paid_count)} قسط</span>
          <span class="loan-progress-percent">${toPersianNum(Math.round(d.percent))}٪</span>
        </div>
      </div>

      <div class="loan-amounts">
        <div class="loan-amount-item">
          <span class="loan-amount-label">کل</span>
          <span class="loan-amount-value">${formatMoney(d.total_amount)}</span>
        </div>
        <div class="loan-amount-item">
          <span class="loan-amount-label">پرداخت</span>
          <span class="loan-amount-value loan-amount-paid">${formatMoney(d.paid_amount)}</span>
        </div>
        <div class="loan-amount-item">
          <span class="loan-amount-label">باقی</span>
          <span class="loan-amount-value loan-amount-remaining">${formatMoney(d.remaining_amount)}</span>
        </div>
      </div>

      <div class="loan-card-footer">${footerAction}</div>
    </div>
  `;
}

function render() {
  const listEl = document.getElementById('loans-list');
  const emptyEl = document.getElementById('loans-empty');
  const summaryEl = document.getElementById('loans-summary');

  if (!listEl || !emptyEl) return;

  if (!loans.length) {
    listEl.innerHTML = '';
    emptyEl.classList.remove('hidden');
    if (summaryEl) summaryEl.classList.add('hidden');
  } else {
    emptyEl.classList.add('hidden');
    if (summaryEl) summaryEl.classList.remove('hidden');
    listEl.innerHTML = loans.map((l, i) => renderLoanCard(l, i)).join('');
  }

  // summary
  if (summaryEl && loans.length) {
    let totalAll = 0;
    let paidAll = 0;
    loans.forEach((l) => {
      const d = computeLoanData(l);
      totalAll += Number(l.total_amount) || 0;
      paidAll += d.paid_amount;
    });
    const remainingAll = Math.max(0, totalAll - paidAll);
    const totalEl = document.getElementById('summary-total');
    const paidEl = document.getElementById('summary-paid');
    const remEl = document.getElementById('summary-remaining');
    if (totalEl) totalEl.textContent = formatMoney(totalAll);
    if (paidEl) paidEl.textContent = formatMoney(paidAll);
    if (remEl) remEl.textContent = formatMoney(remainingAll);
  }

  updateDashboard();
  updateStatsCards();
}

// ---------- dashboard ----------
function updateDashboard() {
  const dashList = document.getElementById('dashboard-loans-list');
  const dashEmpty = document.getElementById('dashboard-loans-empty');
  if (!dashList || !dashEmpty) return;

  if (!loans.length) {
    dashList.innerHTML = '';
    dashEmpty.classList.remove('hidden');
    return;
  }
  dashEmpty.classList.add('hidden');

  const top = loans.slice(0, 3);
  dashList.innerHTML = top
    .map((loan) => {
      const d = computeLoanData(loan);
      const badge = d.is_complete
        ? `${toPersianNum(d.paid_count)} قسط (تکمیل)`
        : `${toPersianNum(d.paid_count)} از ${toPersianNum(d.paid_count + d.remaining_installments)}`;
      return `
        <a href="#/loans" class="dashboard-loan-item">
          <div class="dashboard-loan-header">
            <span class="dashboard-loan-title">${escapeHtml(loan.title)}</span>
            <span class="dashboard-loan-badge">${badge}</span>
          </div>
          <div class="dashboard-loan-bar">
            <div class="dashboard-loan-fill" style="width:${d.percent}%"></div>
          </div>
          <div class="dashboard-loan-footer">
            <span>${formatMoney(d.remaining_amount)} باقی‌مانده</span>
            <span class="dashboard-loan-percent">${toPersianNum(Math.round(d.percent))}٪</span>
          </div>
        </a>
      `;
    })
    .join('');
}

function updateStatsCards() {
  const activeLoans = loans.filter((l) => !computeLoanData(l).is_complete).length;
  const remainingInstallments = loans.reduce(
    (s, l) => s + computeLoanData(l).remaining_installments,
    0
  );

  const activeEl = document.querySelector('[data-stat="active-loans"]');
  const remEl = document.querySelector('[data-stat="remaining-installments"]');

  if (activeEl) activeEl.textContent = toPersianNum(activeLoans);
  if (remEl) remEl.textContent = toPersianNum(remainingInstallments);
}

// ---------- data ----------
async function loadLoans() {
  if (!currentUser) return;

  const [loansRes, paymentsRes] = await Promise.all([
    supabase.from('loans').select('*').order('created_at', { ascending: false }),
    supabase.from('loan_payments').select('*').order('paid_at', { ascending: false }),
  ]);

  if (loansRes.error) {
    console.error('Load loans failed:', loansRes.error);
    showToast('خطا در بارگذاری وام‌ها', 'error');
    return;
  }
  if (paymentsRes.error) {
    console.error('Load payments failed:', paymentsRes.error);
    showToast('خطا در بارگذاری پرداخت‌ها', 'error');
    return;
  }

  loans = loansRes.data || [];
  payments = paymentsRes.data || [];
  render();
}

// ---------- loan modal ----------
function openLoanModal(loan = null) {
  const modal = document.getElementById('loan-modal');
  const backdrop = document.getElementById('loan-modal-backdrop');
  const titleEl = document.getElementById('loan-modal-title');
  const idInput = document.getElementById('loan-id');
  const titleInput = document.getElementById('loan-title');
  const totalInput = document.getElementById('loan-total-amount');
  const instInput = document.getElementById('loan-total-installments');
  const amountInput = document.getElementById('loan-installment-amount');
  const dateInput = document.getElementById('loan-start-date');
  const noteInput = document.getElementById('loan-note');
  const errorEl = document.getElementById('loan-modal-error');

  if (!modal) return;
  errorEl.textContent = '';
  errorEl.classList.add('hidden');

  if (loan) {
    titleEl.textContent = 'ویرایش وام';
    idInput.value = loan.id;
    titleInput.value = loan.title || '';
    totalInput.value = loan.total_amount || '';
    instInput.value = loan.total_installments || '';
    amountInput.value = loan.installment_amount || '';
    dateInput.value = loan.start_date || '';
    noteInput.value = loan.note || '';
  } else {
    titleEl.textContent = 'وام جدید';
    idInput.value = '';
    titleInput.value = '';
    totalInput.value = '';
    instInput.value = '';
    amountInput.value = '';
    dateInput.value = todayStr();
    noteInput.value = '';
  }

  modal.classList.add('open');
  backdrop.classList.add('open');
  setTimeout(() => titleInput.focus(), 120);
}

function closeLoanModal() {
  document.getElementById('loan-modal')?.classList.remove('open');
  document.getElementById('loan-modal-backdrop')?.classList.remove('open');
}

async function handleLoanSubmit(e) {
  e.preventDefault();

  const idInput = document.getElementById('loan-id');
  const titleInput = document.getElementById('loan-title');
  const totalInput = document.getElementById('loan-total-amount');
  const instInput = document.getElementById('loan-total-installments');
  const amountInput = document.getElementById('loan-installment-amount');
  const dateInput = document.getElementById('loan-start-date');
  const noteInput = document.getElementById('loan-note');
  const errorEl = document.getElementById('loan-modal-error');
  const submitBtn = document.getElementById('loan-submit-btn');
  const loader = submitBtn.querySelector('.btn-loader');
  const btnText = submitBtn.querySelector('.btn-text');

  const title = titleInput.value.trim();
  const total_amount = Number(totalInput.value);
  const total_installments = Number(instInput.value);
  const installment_amount = amountInput.value ? Number(amountInput.value) : 0;
  const start_date = dateInput.value;
  const note = noteInput.value.trim();

  errorEl.classList.add('hidden');

  if (!title) {
    errorEl.textContent = 'عنوان وام الزامی است';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!total_amount || total_amount <= 0) {
    errorEl.textContent = 'مبلغ کل را وارد کن';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!total_installments || total_installments <= 0) {
    errorEl.textContent = 'تعداد اقساط را وارد کن';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!start_date) {
    errorEl.textContent = 'تاریخ اولین قسط را وارد کن';
    errorEl.classList.remove('hidden');
    return;
  }

  submitBtn.disabled = true;
  btnText.classList.add('hidden');
  loader.classList.remove('hidden');

  const isEdit = !!idInput.value;
  const payload = {
    title,
    total_amount,
    total_installments,
    installment_amount,
    start_date,
    note: note || null,
  };

  try {
    if (isEdit) {
      const { data, error } = await supabase
        .from('loans')
        .update(payload)
        .eq('id', idInput.value)
        .select()
        .single();
      if (error) throw error;
      const idx = loans.findIndex((l) => l.id === idInput.value);
      if (idx >= 0 && data) loans[idx] = data;
    } else {
      const { data, error } = await supabase
        .from('loans')
        .insert({ ...payload, user_id: currentUser.id })
        .select()
        .single();
      if (error) throw error;
      if (data && !loans.find((l) => l.id === data.id)) {
        loans.unshift(data);
      }
    }

    render();
    closeLoanModal();
    showToast(isEdit ? 'وام بروزرسانی شد' : 'وام اضافه شد');
  } catch (err) {
    console.error('Save loan failed:', err);
    errorEl.textContent = 'خطا در ذخیره. دوباره تلاش کن';
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    btnText.classList.remove('hidden');
    loader.classList.add('hidden');
  }
}

async function deleteLoan(id) {
  const loan = loans.find((l) => l.id === id);
  if (!loan) return;

  const confirmed = await confirmDialog({
    title: 'حذف وام',
    message: `آیا از حذف «${loan.title}» و تمام پرداخت‌هایش مطمئنی؟ این عمل قابل بازگشت نیست.`,
    okText: 'حذف',
    danger: true,
  });
  if (!confirmed) return;

  const { error } = await supabase.from('loans').delete().eq('id', id);
  if (error) {
    console.error('Delete loan failed:', error);
    showToast('خطا در حذف وام', 'error');
    return;
  }
  loans = loans.filter((l) => l.id !== id);
  payments = payments.filter((p) => p.loan_id !== id);
  render();
  showToast('وام حذف شد');
}

// ---------- payment modal ----------
function openPaymentModal(loanId) {
  const loan = loans.find((l) => l.id === loanId);
  if (!loan) return;

  const d = computeLoanData(loan);
  if (d.is_complete) {
    showToast('این وام تکمیل شده است');
    return;
  }

  activePaymentLoanId = loanId;

  const modal = document.getElementById('payment-modal');
  const backdrop = document.getElementById('payment-modal-backdrop');
  const titleEl = document.getElementById('payment-loan-title');
  const infoEl = document.getElementById('payment-info');
  const amountInput = document.getElementById('payment-amount');
  const dateInput = document.getElementById('payment-paid-at');
  const noteInput = document.getElementById('payment-note');
  const errorEl = document.getElementById('payment-modal-error');

  if (!modal) return;

  titleEl.textContent = loan.title;
  infoEl.textContent = `قسط ${toPersianNum(d.paid_count + 1)} از ${toPersianNum(d.paid_count + d.remaining_installments)} — باقی‌مانده: ${formatMoney(d.remaining_amount)}`;
  amountInput.value = d.installment_amount;
  dateInput.value = todayStr();
  noteInput.value = '';
  errorEl.textContent = '';
  errorEl.classList.add('hidden');

  modal.classList.add('open');
  backdrop.classList.add('open');
  setTimeout(() => amountInput.focus(), 120);
}

function closePaymentModal() {
  document.getElementById('payment-modal')?.classList.remove('open');
  document.getElementById('payment-modal-backdrop')?.classList.remove('open');
  activePaymentLoanId = null;
}

async function handlePaymentSubmit(e) {
  e.preventDefault();

  const amountInput = document.getElementById('payment-amount');
  const dateInput = document.getElementById('payment-paid-at');
  const noteInput = document.getElementById('payment-note');
  const errorEl = document.getElementById('payment-modal-error');
  const submitBtn = document.getElementById('payment-submit-btn');
  const loader = submitBtn.querySelector('.btn-loader');
  const btnText = submitBtn.querySelector('.btn-text');

  const amount = Number(amountInput.value);
  const paid_at = dateInput.value;
  const note = noteInput.value.trim();

  errorEl.classList.add('hidden');

  if (!amount || amount <= 0) {
    errorEl.textContent = 'مبلغ را وارد کن';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!paid_at) {
    errorEl.textContent = 'تاریخ پرداخت را وارد کن';
    errorEl.classList.remove('hidden');
    return;
  }
  if (!activePaymentLoanId) return;

  submitBtn.disabled = true;
  btnText.classList.add('hidden');
  loader.classList.remove('hidden');

  try {
    const { data, error } = await supabase
      .from('loan_payments')
      .insert({
        loan_id: activePaymentLoanId,
        user_id: currentUser.id,
        amount,
        paid_at,
        note: note || null,
      })
      .select()
      .single();

    if (error) throw error;
    if (data && !payments.find((p) => p.id === data.id)) {
      payments.unshift(data);
    }
    render();
    closePaymentModal();
    showToast('پرداخت ثبت شد');
  } catch (err) {
    console.error('Save payment failed:', err);
    errorEl.textContent = 'خطا در ذخیره. دوباره تلاش کن';
    errorEl.classList.remove('hidden');
  } finally {
    submitBtn.disabled = false;
    btnText.classList.remove('hidden');
    loader.classList.add('hidden');
  }
}

// ---------- payments history ----------
function openHistoryModal(loanId) {
  const loan = loans.find((l) => l.id === loanId);
  if (!loan) return;

  const d = computeLoanData(loan);
  const modal = document.getElementById('payments-history-modal');
  const backdrop = document.getElementById('payments-history-backdrop');
  const titleEl = document.getElementById('payments-history-title');
  const bodyEl = document.getElementById('payments-history-body');

  if (!modal || !bodyEl) return;

  titleEl.textContent = `تاریخچه پرداخت‌های ${loan.title}`;

  if (!d.payments.length) {
    bodyEl.innerHTML = `
      <div class="payments-history-empty">
        <p>هنوز پرداختی برای این وام ثبت نشده</p>
      </div>
    `;
  } else {
    const sorted = [...d.payments].sort(
      (a, b) => new Date(b.paid_at) - new Date(a.paid_at)
    );
    bodyEl.innerHTML = sorted
      .map((p) => {
        const dateStr = p.paid_at ? formatPersianDate(parseDateLocal(p.paid_at)) : '';
        return `
          <div class="payment-history-item">
            <div class="payment-history-info">
              <div class="payment-history-amount">${formatMoney(p.amount)}</div>
              <div class="payment-history-date">${dateStr}</div>
              ${p.note ? `<div class="payment-history-note">${escapeHtml(p.note)}</div>` : ''}
            </div>
            <button type="button" class="payment-history-delete" data-payment-delete="${p.id}" aria-label="حذف پرداخت">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        `;
      })
      .join('');
  }

  modal.classList.add('open');
  backdrop.classList.add('open');
}

function closeHistoryModal() {
  document.getElementById('payments-history-modal')?.classList.remove('open');
  document.getElementById('payments-history-backdrop')?.classList.remove('open');
}

async function deletePayment(paymentId) {
  const confirmed = await confirmDialog({
    title: 'حذف پرداخت',
    message: 'آیا از حذف این پرداخت مطمئنی؟',
    okText: 'حذف',
    danger: true,
  });
  if (!confirmed) return;

  const { error } = await supabase.from('loan_payments').delete().eq('id', paymentId);
  if (error) {
    console.error('Delete payment failed:', error);
    showToast('خطا در حذف پرداخت', 'error');
    return;
  }
  payments = payments.filter((p) => p.id !== paymentId);
  render();
  closeHistoryModal();
  showToast('پرداخت حذف شد');
}

// ---------- real-time ----------
function subscribeToChanges() {
  if (!currentUser) return;

  loansSubscription = supabase
    .channel(`loans-${currentUser.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'loans', filter: `user_id=eq.${currentUser.id}` },
      handleLoanRealtime
    )
    .subscribe();

  paymentsSubscription = supabase
    .channel(`loan-payments-${currentUser.id}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'loan_payments', filter: `user_id=eq.${currentUser.id}` },
      handlePaymentRealtime
    )
    .subscribe();
}

function handleLoanRealtime(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT' && newRow) {
    if (!loans.find((l) => l.id === newRow.id)) loans.unshift(newRow);
  } else if (eventType === 'UPDATE' && newRow) {
    const idx = loans.findIndex((l) => l.id === newRow.id);
    if (idx >= 0) loans[idx] = newRow;
  } else if (eventType === 'DELETE') {
    const id = oldRow?.id;
    if (id) {
      loans = loans.filter((l) => l.id !== id);
      payments = payments.filter((p) => p.loan_id !== id);
    }
  }
  render();
}

function handlePaymentRealtime(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT' && newRow) {
    if (!payments.find((p) => p.id === newRow.id)) payments.unshift(newRow);
  } else if (eventType === 'UPDATE' && newRow) {
    const idx = payments.findIndex((p) => p.id === newRow.id);
    if (idx >= 0) payments[idx] = newRow;
  } else if (eventType === 'DELETE') {
    const id = oldRow?.id;
    if (id) payments = payments.filter((p) => p.id !== id);
  }
  render();
}

// ---------- listeners ----------
function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;

  document.querySelectorAll('[data-open-loan-modal]').forEach((el) => {
    el.addEventListener('click', () => openLoanModal());
  });

  document.getElementById('loan-form')?.addEventListener('submit', handleLoanSubmit);
  document.querySelectorAll('[data-loan-modal-close]').forEach((el) => {
    el.addEventListener('click', closeLoanModal);
  });

  document.getElementById('payment-form')?.addEventListener('submit', handlePaymentSubmit);
  document.querySelectorAll('[data-payment-modal-close]').forEach((el) => {
    el.addEventListener('click', closePaymentModal);
  });

  document.querySelectorAll('[data-payments-history-close]').forEach((el) => {
    el.addEventListener('click', closeHistoryModal);
  });

  // clicks on loans list
  document.getElementById('loans-list')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const loanId = btn.dataset.loanId;
    const action = btn.dataset.action;

    if (action === 'pay') openPaymentModal(loanId);
    else if (action === 'edit') {
      const loan = loans.find((l) => l.id === loanId);
      if (loan) openLoanModal(loan);
    } else if (action === 'delete') deleteLoan(loanId);
    else if (action === 'history') openHistoryModal(loanId);
  });

  // delete payment from history
  document.getElementById('payments-history-body')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-payment-delete]');
    if (btn) deletePayment(btn.dataset.paymentDelete);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLoanModal();
      closePaymentModal();
      closeHistoryModal();
    }
  });
}

// ---------- public ----------
export function initLoans(user) {
  if (currentUser?.id === user?.id && user) return;

  if (loansSubscription) {
    supabase.removeChannel(loansSubscription);
    loansSubscription = null;
  }
  if (paymentsSubscription) {
    supabase.removeChannel(paymentsSubscription);
    paymentsSubscription = null;
  }

  currentUser = user;
  loans = [];
  payments = [];

  if (!user) {
    render();
    return;
  }

  attachListeners();
  loadLoans();
  subscribeToChanges();
}