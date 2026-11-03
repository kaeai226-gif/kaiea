'use strict';

const api = window.stickyAPI;
const titleEl = document.getElementById('titleInput');
const bodyEl = document.getElementById('bodyInput');
const pinBtn = document.getElementById('pinBtn');
const savedEl = document.getElementById('savedText');
const palette = document.getElementById('palette');

function setSaved(message, status = '') {
  savedEl.className = `saved ${status}`.trim();
  savedEl.innerHTML = '<span class="saved-dot"></span>';
  savedEl.appendChild(document.createTextNode(message));
}

function renderColor(color) {
  document.body.dataset.color = color;
  palette.querySelectorAll('.swatch').forEach((swatch) => {
    const selected = swatch.dataset.theme === color;
    swatch.classList.toggle('is-current', selected);
    swatch.setAttribute('aria-pressed', String(selected));
  });
}

function renderPin(pinned) {
  pinBtn.classList.toggle('is-pinned', pinned);
  pinBtn.setAttribute('aria-pressed', String(pinned));
  pinBtn.title = pinned ? '取消置顶' : '置顶便签';
}

function renderDate() {
  const now = new Date();
  const weekday = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][now.getDay()];
  const month = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][now.getMonth()];
  document.getElementById('dateText').textContent = `${weekday} / ${String(now.getDate()).padStart(2, '0')} ${month}`;
}

async function initialize() {
  renderDate();
  const demo = new URLSearchParams(window.location.search).get('demo');
  const samples = {
    lilac: { title: '灵感收集站 ✳', content: '♡ 把喜欢的小设计记下来\n\n— 有趣的交互细节\n— 一闪而过的产品灵感\n— 周末想去的地方\n\n让好奇心继续发光。', number: 2 },
    mint: { title: '本周 To-do', content: '□ 整理桌面和文件夹\n□ 完成正在做的小项目\n□ 看一篇有趣的论文\n□ 给自己一点休息时间\n\n每一个小进步都值得记录 🌱', number: 3 },
    butter: { title: '今天的小计划 ✨', content: '☀ 早上喝一杯喜欢的咖啡\n\n□ 把重要的灵感记下来\n□ 完成今天的小目标\n□ 记得休息一下\n\n慢慢来，比较快。', number: 1 }
  };
  const selected = Object.hasOwn(samples, demo) ? demo : 'butter';
  const note = api ? await api.getNote() : { ...samples[selected], color: selected, pinned: true };
  if (!note) return;
  titleEl.value = note.title;
  bodyEl.value = note.content;
  renderColor(note.color);
  renderPin(note.pinned);
  document.getElementById('noteNumber').textContent = `NO. ${String(note.number).padStart(2, '0')}`;

  // A browser-opened index.html shows a preview; the desktop app saves locally.
  if (!api) setSaved('预览模式');
  else {
    api.onSaved(() => setSaved('已保存'));
    api.onSaveError(() => setSaved('保存失败', 'is-error'));
    api.onPinned(renderPin);
  }
}

function patch(patchData) {
  if (!api) return;
  api.patch(patchData);
  setSaved('保存中', 'is-saving');
}

titleEl.addEventListener('input', () => patch({ title: titleEl.value }));
bodyEl.addEventListener('input', () => patch({ content: bodyEl.value }));
palette.addEventListener('click', (event) => {
  const button = event.target.closest('.swatch');
  if (!button) return;
  renderColor(button.dataset.theme);
  patch({ color: button.dataset.theme });
});
pinBtn.addEventListener('click', async () => {
  if (!api) { renderPin(!pinBtn.classList.contains('is-pinned')); return; }
  renderPin(await api.togglePin());
});
document.getElementById('newBtn').addEventListener('click', () => api?.createNote());
document.getElementById('hideBtn').addEventListener('click', () => api?.hideNote());
document.getElementById('moreBtn').addEventListener('click', () => api?.openMenu());
window.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'n') {
    event.preventDefault();
    api?.createNote();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'w') {
    event.preventDefault();
    api?.hideNote();
  }
});
initialize();
