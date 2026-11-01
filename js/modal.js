export function confirmDialog({
  title = 'تایید',
  message = 'آیا مطمئنی؟',
  okText = 'تایید',
  danger = true,
} = {}) {
  return new Promise((resolve) => {
    const backdrop = document.getElementById('confirm-backdrop');
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');

    if (!modal || !backdrop) {
      resolve(window.confirm(message));
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    okBtn.textContent = okText;
    okBtn.classList.remove('btn-danger', 'btn-primary');
    okBtn.classList.add(danger ? 'btn-danger' : 'btn-primary');

    function cleanup() {
      backdrop.classList.remove('open');
      modal.classList.remove('open');
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
      backdrop.removeEventListener('click', handleBackdrop);
      document.removeEventListener('keydown', handleKey);
    }

    function handleOk() { cleanup(); resolve(true); }
    function handleCancel() { cleanup(); resolve(false); }
    function handleBackdrop(e) { if (e.target === backdrop) handleCancel(); }
    function handleKey(e) { if (e.key === 'Escape') handleCancel(); }

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
    backdrop.addEventListener('click', handleBackdrop);
    document.addEventListener('keydown', handleKey);

    backdrop.classList.add('open');
    modal.classList.add('open');
  });
}