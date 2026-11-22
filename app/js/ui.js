/* =====================================================================
   MINA WORLD App — UI helpers (icons, sheet, toast, formatting)
   ===================================================================== */

var ICONS = {
  home: '<path d="M3 10.8 12 3.2l9 7.6"/><path d="M5.6 9.4V21h12.8V9.4"/><path d="M9.8 21v-6h4.4v6"/>',
  pulse: '<path d="M2.2 12h3.6l2.1-6 3 12 2.5-8.2 1.7 4.2h6.7"/>',
  brain: '<path d="M9.4 3.7a3.1 3.1 0 0 0-3.1 3.1 2.9 2.9 0 0 0-1.5 5.3 2.9 2.9 0 0 0 1.8 5 3.1 3.1 0 0 0 5.9 1.3V4.9a3 3 0 0 0-3.1-1.2Z"/><path d="M14.6 3.7a3.1 3.1 0 0 1 3.1 3.1 2.9 2.9 0 0 1 1.5 5.3 2.9 2.9 0 0 1-1.8 5 3.1 3.1 0 0 1-5.9 1.3"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2.2"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  bell: '<path d="M18 8.6a6 6 0 1 0-12 0c0 4.9-2 6.4-2 6.4h16s-2-1.5-2-6.4Z"/><path d="M10.3 19a2 2 0 0 0 3.4 0"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20.4a7.4 7.4 0 0 1 14.4 0"/>',
  chevronRight: '<path d="m9 5 7 7-7 7"/>',
  chevronLeft: '<path d="m15 5-7 7 7 7"/>',
  chevronDown: '<path d="m5 9 7 7 7-7"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="16" rx="3.2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.6V12l3 2"/>',
  download: '<path d="M12 3.6v11"/><path d="m7.6 10 4.4 4.4 4.4-4.4"/><path d="M4.6 19.6h14.8"/>',
  check: '<path d="m4.6 12.6 5 5 10-11"/>',
  plus: '<path d="M12 5.2v13.6M5.2 12h13.6"/>',
  minus: '<path d="M5.2 12h13.6"/>',
  close: '<path d="m6.2 6.2 11.6 11.6M17.8 6.2 6.2 17.8"/>',
  search: '<circle cx="11" cy="11" r="6.9"/><path d="m16.2 16.2 4.2 4.2"/>',
  lock: '<rect x="4.6" y="10.4" width="14.8" height="10.2" rx="2.6"/><path d="M8 10.4V8a4 4 0 0 1 8 0v2.4"/>',
  chat: '<path d="M20.4 11.5c0 4.1-3.8 7.4-8.4 7.4-1 0-2-.15-2.9-.42L4.6 20l1.2-3.5A7 7 0 0 1 3.6 11.5C3.6 7.4 7.4 4.2 12 4.2s8.4 3.2 8.4 7.3Z"/>',
  shield: '<path d="M12 3.1 5.2 6v6c0 4.3 2.9 7.5 6.8 9 3.9-1.5 6.8-4.7 6.8-9V6L12 3.1Z"/><path d="m9.2 12 2 2 3.7-3.8"/>',
  chart: '<path d="M4.5 4.2v15.6h15"/><path d="M8.4 16.2v-4.4M12.6 16.2V8.4M16.8 16.2v-6.2"/>',
  target: '<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="4.4"/><circle cx="12" cy="12" r="1"/>',
  sparkle: '<path d="m12 3.6 1.8 5.4 5.4 1.8-5.4 1.8L12 18l-1.8-5.4L4.8 10.8l5.4-1.8L12 3.6Z"/>',
  info: '<circle cx="12" cy="12" r="8.4"/><path d="M12 11.2v5.4M12 7.9v.4"/>',
  alert: '<path d="M12 4.6 21 19.4H3L12 4.6Z"/><path d="M12 10v4.2M12 16.7v.3"/>',
  logout: '<path d="M14.4 4.6H6.6a2 2 0 0 0-2 2v10.8a2 2 0 0 0 2 2h7.8"/><path d="m16.8 8.6 3.4 3.4-3.4 3.4M20.2 12H9.8"/>',
  file: '<path d="M13.4 3.6H7a2 2 0 0 0-2 2v12.8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9.2l-5.6-5.6Z"/><path d="M13.4 3.6V9.2h5.6"/>',
  pin: '<path d="M12 21.2v-6.1"/><path d="M8.2 3.8h7.6l-1.1 5 3.1 3.2H6.2L9.3 8.8l-1.1-5Z"/>',
  trash: '<path d="M4.6 7h14.8"/><path d="M9.6 7V4.9h4.8V7"/><path d="m6.6 7 1 12.1a1.8 1.8 0 0 0 1.8 1.7h5.2a1.8 1.8 0 0 0 1.8-1.7L17.4 7"/>',
  edit: '<path d="M4.6 19.4h3.9L18.4 9.5a2.05 2.05 0 0 0-2.9-2.9L5.6 16.5l-1 2.9Z"/><path d="m14.7 7.5 2.8 2.8"/>',
  arrowUp: '<path d="M12 20V4"/><path d="m5.5 10.5 6.5-6.5 6.5 6.5"/>',
  users: '<circle cx="9" cy="8.4" r="3.2"/><path d="M3.2 20a6 6 0 0 1 11.6 0"/><path d="M16 5.6a3 3 0 0 1 0 5.8"/><path d="M17.6 14.4a5.6 5.6 0 0 1 3.2 5"/>',
  wallet: '<rect x="3.4" y="6" width="17.2" height="13" rx="3.2"/><path d="M3.4 10h17.2"/><path d="M16.4 14.6h1.6"/>',
  coin: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4v9.2M9.2 9.8h4.1a2.2 2.2 0 0 1 0 4.4H9.2"/>',
  heart: '<path d="M12 20s-7.4-4.5-7.4-9.3A4.1 4.1 0 0 1 12 8a4.1 4.1 0 0 1 7.4 2.7C19.4 15.5 12 20 12 20Z"/>'
};

export function icon(name, size, extraClass) {
  var body = ICONS[name] || ICONS.info;
  var s = size || 22;
  return '<svg class="ico ' + (extraClass || '') + '" width="' + s + '" height="' + s +
    '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    body + '</svg>';
}

export function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fmtKRW(amount) {
  if (amount === null || amount === undefined || amount === '') return '상담 확정';
  var n = Number(amount);
  if (!isFinite(n)) return '상담 확정';
  return n.toLocaleString('ko-KR') + '원';
}

export function fmtDate(value) {
  if (!value) return '';
  var text = String(value);
  var match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[1] + '.' + match[2] + '.' + match[3];
  return text;
}

export function fmtDateTime(value) {
  if (!value) return '';
  var d = new Date(value);
  if (isNaN(d.getTime())) return fmtDate(value);
  var hh = ('0' + d.getHours()).slice(-2);
  var mm = ('0' + d.getMinutes()).slice(-2);
  return fmtDate(value) + ' ' + hh + ':' + mm;
}

export function timeAgo(value) {
  if (!value) return '';
  var d = new Date(value);
  if (isNaN(d.getTime())) return fmtDate(value);
  var diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return '방금 전';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + '일 전';
  return fmtDate(value);
}

export function todayLabel() {
  var d = new Date();
  var days = ['일', '월', '화', '수', '목', '금', '토'];
  return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + days[d.getDay()] + '요일';
}

export function go(path) {
  var target = String(path || '').replace(/^#/, '');
  if (!target) target = '/home';
  if (!target.startsWith('/')) target = '/' + target;
  if (location.hash === '#' + target) {
    try {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } catch (err) {
      window.dispatchEvent(new Event('hashchange'));
    }
    return;
  }
  location.hash = target;
}

export function track(eventName, params) {
  try {
    if (typeof window.gtagMicro === 'function') window.gtagMicro(eventName, params || {});
    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, params || {});
    }
  } catch (err) { /* analytics must never break the app */ }
}

/* ------------------------------------------------------------- toast */
export function toast(message, tone) {
  var root = document.getElementById('toast-root');
  if (!root) return;
  var el = document.createElement('div');
  el.className = 'toast toast-' + (tone || 'default');
  el.innerHTML = '<span class="toast-dot"></span><span>' + esc(message) + '</span>';
  root.appendChild(el);
  requestAnimationFrame(function () { el.classList.add('is-in'); });
  setTimeout(function () {
    el.classList.remove('is-in');
    setTimeout(function () { el.remove(); }, 260);
  }, 3200);
}

/* ------------------------------------------------------------- sheet */
var ACTIVE_SHEET = null;

export function openSheet(options) {
  closeSheet(true);
  var root = document.getElementById('overlay-root');
  if (!root) return null;

  var overlay = document.createElement('div');
  overlay.className = 'sheet-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');

  var sheet = document.createElement('div');
  sheet.className = 'sheet' + (options && options.wide ? ' sheet-wide' : '');
  sheet.innerHTML =
    '<div class="sheet-grip" aria-hidden="true"></div>' +
    '<div class="sheet-head">' +
    '<div><h2 class="sheet-title">' + esc(options.title || '') + '</h2>' +
    (options.subtitle ? '<p class="sheet-sub">' + esc(options.subtitle) + '</p>' : '') + '</div>' +
    '<button type="button" class="icon-btn sheet-close" aria-label="닫기">' + icon('close', 20) + '</button>' +
    '</div>' +
    '<div class="sheet-body">' + (options.content || '') + '</div>' +
    (options.footer ? '<div class="sheet-foot">' + options.footer + '</div>' : '');

  overlay.appendChild(sheet);
  root.innerHTML = '';
  root.appendChild(overlay);
  document.body.classList.add('no-scroll');

  function requestClose() {
    closeSheet();
  }

  overlay.addEventListener('click', function (event) {
    if (event.target === overlay) requestClose();
  });
  var closeBtn = sheet.querySelector('.sheet-close');
  if (closeBtn) closeBtn.addEventListener('click', requestClose);

  var previouslyFocused = document.activeElement;
  ACTIVE_SHEET = {
    overlay: overlay,
    sheet: sheet,
    previouslyFocused: previouslyFocused,
    onClose: typeof options.onClose === 'function' ? options.onClose : null
  };
  requestAnimationFrame(function () { overlay.classList.add('is-in'); });

  setTimeout(function () {
    var focusable = sheet.querySelector('input:not([type="hidden"]), select, textarea, button.btn');
    if (focusable) focusable.focus({ preventScroll: true });
  }, 220);

  if (typeof options.onMount === 'function') options.onMount(sheet);
  return { el: sheet, close: requestClose };
}

export function closeSheet(immediate) {
  if (!ACTIVE_SHEET) {
    var root = document.getElementById('overlay-root');
    if (root) root.innerHTML = '';
    document.body.classList.remove('no-scroll');
    return;
  }
  var current = ACTIVE_SHEET;
  ACTIVE_SHEET = null;
  if (current.onClose) {
    try { current.onClose(); } catch (err) { console.warn(err); }
  }
  if (immediate) {
    if (current.overlay.parentNode) current.overlay.parentNode.removeChild(current.overlay);
    document.body.classList.remove('no-scroll');
  } else {
    current.overlay.classList.remove('is-in');
    setTimeout(function () {
      if (current.overlay.parentNode) current.overlay.parentNode.removeChild(current.overlay);
      document.body.classList.remove('no-scroll');
    }, 220);
  }
  if (current.previouslyFocused && current.previouslyFocused.focus) {
    try { current.previouslyFocused.focus({ preventScroll: true }); } catch (err) { /* ignore */ }
  }
}

export function confirmDialog(options) {
  return new Promise(function (resolve) {
    var settled = false;
    function finish(value) {
      if (settled) return;
      settled = true;
      resolve(value);
    }
    var content = '<p class="confirm-text">' + esc(options.message || '') + '</p>';
    var footer = '<button type="button" class="btn btn-ghost" data-confirm="no">' + esc(options.cancelLabel || '취소') + '</button>' +
      '<button type="button" class="btn ' + (options.danger === false ? 'btn-primary' : 'btn-danger') + '" data-confirm="yes">' + esc(options.confirmLabel || '확인') + '</button>';
    var sheet = openSheet({
      title: options.title || '확인',
      content: content,
      footer: footer,
      onClose: function () { finish(false); },
      onMount: function (el) {
        var yes = el.querySelector('[data-confirm="yes"]');
        var no = el.querySelector('[data-confirm="no"]');
        if (yes) yes.addEventListener('click', function () { finish(true); closeSheet(); });
        if (no) no.addEventListener('click', function () { finish(false); closeSheet(); });
      }
    });
    if (!sheet) finish(false);
  });
}

/* ------------------------------------------------------------- blocks */
export function emptyState(options) {
  return '<div class="empty">' +
    '<div class="empty-icon">' + icon(options.icon || 'sparkle', 26) + '</div>' +
    '<p class="empty-title">' + esc(options.title || '아직 데이터가 없습니다') + '</p>' +
    (options.desc ? '<p class="empty-desc">' + esc(options.desc) + '</p>' : '') +
    (options.action ? '<div class="empty-action">' + options.action + '</div>' : '') +
    '</div>';
}

export function errorState(message, retryId) {
  return '<div class="empty empty-error">' +
    '<div class="empty-icon">' + icon('alert', 26) + '</div>' +
    '<p class="empty-title">데이터를 불러오지 못했습니다</p>' +
    '<p class="empty-desc">' + esc(message) + '</p>' +
    (retryId ? '<div class="empty-action"><button type="button" class="btn btn-ghost" id="' + retryId + '">다시 시도</button></div>' : '') +
    '</div>';
}

export function loadingBlock(text) {
  return '<div class="loading-block"><span class="spinner"></span><span>' + esc(text || '불러오는 중입니다') + '</span></div>';
}

export function skeletonList(rows) {
  var out = '';
  for (var i = 0; i < (rows || 3); i++) out += '<div class="skeleton-row"></div>';
  return '<div class="skeleton-wrap">' + out + '</div>';
}

export function badge(text, tone) {
  return '<span class="badge badge-' + (tone || 'neutral') + '">' + esc(text) + '</span>';
}

export function sectionHead(title, actionHtml) {
  return '<div class="section-head"><h2 class="section-title">' + esc(title) + '</h2>' +
    (actionHtml ? '<div class="section-action">' + actionHtml + '</div>' : '') + '</div>';
}

export function noticeBox(text, tone) {
  return '<div class="notice notice-' + (tone || 'neutral') + '">' +
    '<span class="notice-ico">' + icon(tone === 'warn' ? 'alert' : 'info', 18) + '</span>' +
    '<p>' + (text) + '</p></div>';
}

export function setBusy(button, busy, busyText) {
  if (!button) return;
  if (busy) {
    if (!button.dataset.original) button.dataset.original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner spinner-sm"></span>' + esc(busyText || '처리 중');
  } else {
    button.disabled = false;
    if (button.dataset.original) button.innerHTML = button.dataset.original;
  }
}

export function bookingStatusTone(status) {
  if (status === 'confirmed') return 'navy';
  if (status === 'completed') return 'green';
  if (status === 'canceled') return 'red';
  return 'yellow';
}

export function paymentStatusTone(status) {
  if (status === 'paid') return 'green';
  if (status === 'refunded') return 'red';
  if (status === 'pending_deposit' || status === 'bank_transfer') return 'yellow';
  return 'neutral';
}

/* CSV 다운로드 (정산·회원 목록 등) — 화면에서 계산한 실제 값만 내보냅니다 */
export function downloadCsv(filename, headers, rows) {
  var escapeCell = function (value) {
    var text = value === null || value === undefined ? '' : String(value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  };
  var lines = [];
  lines.push((headers || []).map(escapeCell).join(','));
  (rows || []).forEach(function (row) {
    lines.push(row.map(escapeCell).join(','));
  });
  /* BOM: Excel(한글)에서 바로 열리도록 */
  var blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  setTimeout(function () {
    URL.revokeObjectURL(url);
    if (link.parentNode) link.parentNode.removeChild(link);
  }, 400);
}

/* 차트 공용 옵션 (Chart.js v4) */
export function chartBaseOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: true,
        position: 'bottom',
        labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle', font: { size: 11 }, color: '#4A5568' }
      },
      tooltip: {
        backgroundColor: '#070D1E',
        padding: 10,
        cornerRadius: 10,
        titleFont: { size: 12 },
        bodyFont: { size: 12 }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#8A93A6', font: { size: 10 } } },
      y: { grid: { color: 'rgba(236,230,218,0.9)' }, ticks: { color: '#8A93A6', font: { size: 10 } }, beginAtZero: true }
    }
  };
}
