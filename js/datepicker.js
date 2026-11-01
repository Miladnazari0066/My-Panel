function toJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + parseInt((gy2 + 3) / 4) - parseInt((gy2 + 99) / 100) + parseInt((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * parseInt(days / 12053);
  days %= 12053;
  jy += 4 * parseInt(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += parseInt((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + parseInt(days / 31) : 7 + parseInt((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return [jy, jm, jd];
}

function toGregorian(jy, jm, jd) {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days = 365 * jy + parseInt(jy / 33) * 8 + parseInt(((jy % 33) + 3) / 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * parseInt(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * parseInt(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * parseInt(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += parseInt((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 0; gm < 13; gm++) {
    if (gd <= sal_a[gm]) break;
    gd -= sal_a[gm];
  }
  return [gy, gm, gd];
}

const jMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const weekDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

function getDaysInMonth(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  const isLeap = ((jy - 979) % 33) % 4 === 1;
  return isLeap ? 30 : 29;
}

let activeInput = null;
let currentView = { year: 1403, month: 1, day: 1 };

export function initDatePicker(inputElement) {
  if (!inputElement) return;
  inputElement.readOnly = true;
  inputElement.style.cursor = 'pointer';
  inputElement.addEventListener('click', () => openPicker(inputElement));
  inputElement.addEventListener('focus', () => inputElement.blur());
}

function openPicker(input) {
  activeInput = input;
  
  let val = input.value;
  let jy, jm, jd;
  
  if (val && val.includes('-')) {
    const [gy, gm, gd] = val.split('-').map(Number);
    [jy, jm, jd] = toJalali(gy, gm, gd);
  } else {
    const today = new Date();
    [jy, jm, jd] = toJalali(today.getFullYear(), today.getMonth() + 1, today.getDate());
  }

  currentView = { year: jy, month: jm, day: jd };
  renderCalendar();
  document.getElementById('dp-overlay').classList.add('open');
  document.getElementById('dp-container').classList.add('open');
}

function renderCalendar() {
  const { year, month, day } = currentView;
  document.getElementById('dp-title').textContent = `${jMonths[month - 1]} ${year}`;

  const [gy, gm, gd] = toGregorian(year, month, 1);
  const date = new Date(gy, gm - 1, gd);
  const startDay = date.getDay();
  const offset = (startDay + 1) % 7;

  const daysInMonth = getDaysInMonth(year, month);
  const daysContainer = document.getElementById('dp-days');
  daysContainer.innerHTML = '';

  for (let i = 0; i < offset; i++) {
    daysContainer.innerHTML += `<button class="dp-day dp-day-empty"></button>`;
  }

  const todayG = new Date();
  const [tjy, tjm, tjd] = toJalali(todayG.getFullYear(), todayG.getMonth() + 1, todayG.getDate());

  for (let i = 1; i <= daysInMonth; i++) {
    const isToday = year === tjy && month === tjm && i === tjd;
    const isSelected = year === year && month === month && i === day;
    
    let classes = 'dp-day';
    if (isToday) classes += ' today';
    if (isSelected) classes += ' selected';

    daysContainer.innerHTML += `<button class="${classes}" data-day="${i}">${i.toLocaleString('fa-IR')}</button>`;
  }

  daysContainer.querySelectorAll('.dp-day:not(.dp-day-empty)').forEach(btn => {
    btn.onclick = () => {
      currentView.day = parseInt(btn.dataset.day);
      renderCalendar();
    };
  });

  document.getElementById('dp-prev').onclick = () => {
    currentView.month--;
    if (currentView.month < 1) { currentView.month = 12; currentView.year--; }
    renderCalendar();
  };
  document.getElementById('dp-next').onclick = () => {
    currentView.month++;
    if (currentView.month > 12) { currentView.month = 1; currentView.year++; }
    renderCalendar();
  };
}

export function setupDatePickerDOM() {
  if (document.getElementById('dp-container')) return;

  const html = `
    <div class="dp-overlay" id="dp-overlay"></div>
    <div class="dp-container" id="dp-container">
      <div class="dp-header">
        <button type="button" class="dp-nav-btn" id="dp-next">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <div class="dp-title" id="dp-title">ماه</div>
        <button type="button" class="dp-nav-btn" id="dp-prev">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
      </div>
      <div class="dp-weekdays">
        ${weekDays.map(d => `<span>${d}</span>`).join('')}
      </div>
      <div class="dp-days" id="dp-days"></div>
      <div class="dp-footer">
        <button type="button" class="btn btn-secondary" id="dp-cancel">انصراف</button>
        <button type="button" class="btn btn-primary" id="dp-confirm">تایید</button>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);

  const close = () => {
    document.getElementById('dp-overlay').classList.remove('open');
    document.getElementById('dp-container').classList.remove('open');
  };

  document.getElementById('dp-overlay').onclick = close;
  document.getElementById('dp-cancel').onclick = close;

  document.getElementById('dp-confirm').onclick = () => {
    if (!activeInput) return;
    const { year, month, day } = currentView;
    const [gy, gm, gd] = toGregorian(year, month, day);
    
    activeInput.value = `${gy}-${String(gm).padStart(2, '0')}-${String(gd).padStart(2, '0')}`;
    activeInput.dataset.jalali = `${year}/${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
    
    activeInput.dispatchEvent(new Event('input', { bubbles: true }));
    activeInput.dispatchEvent(new Event('change', { bubbles: true }));
    
    close();
  };
}