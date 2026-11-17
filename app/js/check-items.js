/* =====================================================================
   MINA WORLD App — 검사 항목 기본 템플릿 (간편 8항목 · 종합 10항목)
   ---------------------------------------------------------------------
   - config.js 의 CHECK_ITEM_TEMPLATES 가 기본값입니다.
   - "현재 항목을 기본값으로 저장" 으로 저장한 값은 이 브라우저의
     localStorage(유형별)에 보관되어 다음 등록 화면부터 기본값이 됩니다.
   - "초기 기본값 복원" 은 저장값을 지우고 코드 기본값으로 되돌립니다.
   ===================================================================== */
import { CHECK_ITEM_TEMPLATES } from './config.js?v=2.0.7';
import { esc } from './ui.js?v=2.0.7';

var STORAGE_PREFIX = 'mina.check-items.v1.';

function normalize(items) {
  var out = [];
  (items || []).forEach(function (item) {
    var name = String(item && item.name !== undefined ? item.name : item || '').trim();
    var hint = String(item && item.hint ? item.hint : '').trim();
    if (!name) return;
    for (var i = 0; i < out.length; i++) if (out[i].name === name) return;
    out.push({ name: name, hint: hint });
  });
  return out;
}

export function defaultItems(type) {
  var base = CHECK_ITEM_TEMPLATES[type] || CHECK_ITEM_TEMPLATES.simple;
  return normalize(base);
}

export function hasCustomItems(type) {
  try {
    return Boolean(localStorage.getItem(STORAGE_PREFIX + type));
  } catch (err) {
    return false;
  }
}

export function getItemTemplate(type) {
  try {
    var raw = localStorage.getItem(STORAGE_PREFIX + type);
    if (raw) {
      var saved = normalize(JSON.parse(raw));
      if (saved.length) return saved;
    }
  } catch (err) {
    console.warn('[check-items] 저장된 기본 항목을 읽지 못했습니다.', err);
  }
  return defaultItems(type);
}

export function saveItemTemplate(type, items) {
  var list = normalize(items);
  if (!list.length) return null;
  try {
    localStorage.setItem(STORAGE_PREFIX + type, JSON.stringify(list));
  } catch (err) {
    console.warn('[check-items] 기본 항목을 저장하지 못했습니다.', err);
    return null;
  }
  return list;
}

export function resetItemTemplate(type) {
  try {
    localStorage.removeItem(STORAGE_PREFIX + type);
  } catch (err) {
    console.warn('[check-items] 저장된 기본 항목을 지우지 못했습니다.', err);
  }
  return defaultItems(type);
}

export function templateNames(type) {
  return getItemTemplate(type).map(function (item) { return item.name; });
}

export function templateSummary(type) {
  var names = templateNames(type);
  return (hasCustomItems(type) ? '기본 항목(직접 저장) · ' : '기본 항목 · ') + names.join(' · ');
}

export function rowsHtml(items) {
  var list = items && items.length ? items : [{ name: '', hint: '' }];
  return list.map(function (item) {
    return '<div class="kv-row">' +
      '<input type="text" class="kv-key" placeholder="항목 (예: 집중 지수)" value="' + esc(item.name || '') + '">' +
      '<input type="text" class="kv-value" placeholder="' + esc(item.hint || '설명') + '" value="">' +
      '<button type="button" class="btn btn-ghost btn-xs" data-kv-remove>−</button>' +
    '</div>';
  }).join('');
}

export function templateRowsHtml(type) {
  return rowsHtml(getItemTemplate(type));
}

export function collectItems(scope) {
  var out = {};
  if (!scope) return out;
  var rows = scope.querySelectorAll('.kv-row');
  for (var i = 0; i < rows.length; i++) {
    var keyEl = rows[i].querySelector('.kv-key');
    var valEl = rows[i].querySelector('.kv-value');
    var key = keyEl ? keyEl.value.trim() : '';
    var value = valEl ? valEl.value.trim() : '';
    if (key && value) out[key] = value;
  }
  return out;
}

export function editorHtml(prefix, type, options) {
  var opts = options || {};
  return '<div class="field">' +
    '<span class="field-label">' + esc(opts.label || '항목별 설명') + '</span>' +
    '<div id="' + prefix + '-items" class="kv-list">' + templateRowsHtml(type) + '</div>' +
    '<div class="kv-actions">' +
      '<button type="button" class="btn btn-ghost btn-xs" data-kv-add>+ 항목 추가</button>' +
      '<button type="button" class="btn btn-ghost btn-xs" data-kv-apply>기본 항목 불러오기</button>' +
      '<button type="button" class="btn btn-ghost btn-xs" data-kv-save>현재 항목을 기본값으로 저장</button>' +
      '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-kv-reset>초기 기본값 복원</button>' +
    '</div>' +
    '<p class="field-hint" id="' + prefix + '-items-hint">' + esc(templateSummary(type)) + '</p>' +
  '</div>';
}

export function bindEditor(root, prefix, typeSelector, onNotice) {
  var itemsEl = root.querySelector('#' + prefix + '-items');
  var hintEl = root.querySelector('#' + prefix + '-items-hint');
  var typeEl = typeSelector ? root.querySelector(typeSelector) : null;
  if (!itemsEl || !hintEl) return null;

  function note(message) {
    if (typeof onNotice === 'function') onNotice(message);
  }

  function currentType() {
    return typeEl && typeEl.value ? typeEl.value : 'simple';
  }

  function refreshHint() {
    hintEl.textContent = templateSummary(currentType());
  }

  function bindRemove() {
    var removes = itemsEl.querySelectorAll('[data-kv-remove]');
    for (var i = 0; i < removes.length; i++) {
      removes[i].onclick = function () {
        var row = this.closest('.kv-row');
        if (row && itemsEl.querySelectorAll('.kv-row').length > 1) row.remove();
      };
    }
  }

  function addRow() {
    var wrap = document.createElement('div');
    wrap.innerHTML = rowsHtml([{ name: '', hint: '' }]);
    while (wrap.firstChild) itemsEl.appendChild(wrap.firstChild);
    bindRemove();
  }

  function applyTemplate(list) {
    itemsEl.innerHTML = rowsHtml(list);
    bindRemove();
    refreshHint();
  }

  function isBlank() {
    var rows = itemsEl.querySelectorAll('.kv-row');
    for (var i = 0; i < rows.length; i++) {
      var keyEl = rows[i].querySelector('.kv-key');
      var valEl = rows[i].querySelector('.kv-value');
      if ((keyEl && keyEl.value.trim()) || (valEl && valEl.value.trim())) return false;
    }
    return true;
  }

  function currentRows() {
    var rows = itemsEl.querySelectorAll('.kv-row');
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var keyEl = rows[i].querySelector('.kv-key');
      var name = keyEl ? keyEl.value.trim() : '';
      if (name) out.push({ name: name, hint: '' });
    }
    return out;
  }

  function templateForCurrentRows() {
    var previous = getItemTemplate(currentType());
    var hintOf = {};
    previous.forEach(function (item) { hintOf[item.name] = item.hint; });
    return currentRows().map(function (row) {
      return { name: row.name, hint: hintOf[row.name] || '' };
    });
  }

  bindRemove();

  var addBtn = root.querySelector('[data-kv-add]');
  if (addBtn) addBtn.addEventListener('click', addRow);

  var applyBtn = root.querySelector('[data-kv-apply]');
  if (applyBtn) {
    applyBtn.addEventListener('click', function () {
      applyTemplate(getItemTemplate(currentType()));
      note('기본 항목을 불러왔습니다.');
    });
  }

  var saveBtn = root.querySelector('[data-kv-save]');
  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      var list = templateForCurrentRows();
      if (!list.length) {
        note('저장할 항목 이름을 먼저 입력해 주세요.');
        return;
      }
      var saved = saveItemTemplate(currentType(), list);
      if (!saved) {
        note('기본값을 저장하지 못했습니다. 입력 내용을 확인해 주세요.');
        return;
      }
      refreshHint();
      note('현재 ' + saved.length + '개 항목을 ' + currentType() + ' 기본값으로 저장했습니다.');
    });
  }

  var resetBtn = root.querySelector('[data-kv-reset]');
  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      resetItemTemplate(currentType());
      applyTemplate(getItemTemplate(currentType()));
      note('초기 기본값으로 복원했습니다.');
    });
  }

  if (typeEl) {
    typeEl.addEventListener('change', function () {
      if (isBlank()) {
        applyTemplate(getItemTemplate(currentType()));
        return;
      }
      refreshHint();
      note('검사 유형이 바뀌었습니다. 기본 항목으로 바꾸려면 “기본 항목 불러오기”를 눌러 주세요.');
    });
  }

  refreshHint();

  return {
    itemsEl: itemsEl,
    type: currentType,
    items: function () { return collectItems(itemsEl); },
    apply: function () { applyTemplate(getItemTemplate(currentType())); },
    refresh: refreshHint
  };
}
