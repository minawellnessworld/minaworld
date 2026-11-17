/* 관리자 → 검사 결과: 등록 · 수정 · is_public 공개 토글 · 항목별 설명(item_details) · 결과지 업로드 */
import { CHECK_TYPES, CHECK_ITEM_LABELS } from '../../config.js?v=2.0.4';
import {
  state, listProfiles, listResults, adminSaveResult, adminUpdateResult, adminDeleteResult,
  uploadResultFile, listOrganizations, friendlyError, todayStr
} from '../../store.js?v=2.0.4';
import { logAudit } from '../../store-security.js?v=2.0.4';
import {
  icon, esc, fmtDate, toast, badge, openSheet, closeSheet, confirmDialog, setBusy,
  noticeBox, emptyState
} from '../../ui.js?v=2.0.4';

function opt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function table(headers, rows) {
  return '<div class="table-scroll"><table class="data-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function emptyRow(cols, text) {
  return '<tr><td colspan="' + cols + '" class="table-empty">' + esc(text) + '</td></tr>';
}

function memberName(profiles, id) {
  for (var i = 0; i < (profiles || []).length; i++) {
    if (String(profiles[i].id) === String(id)) return (profiles[i].full_name || '') + ' (' + (profiles[i].email || '') + ')';
  }
  return '회원 ' + String(id || '').slice(0, 8);
}

function itemRowsHtml(items) {
  var entries = [];
  if (items && typeof items === 'object') {
    Object.keys(items).forEach(function (key) { entries.push([key, items[key]]); });
  }
  if (!entries.length) entries.push(['', '']);
  return entries.map(function (pair) {
    return '<div class="kv-row">' +
      '<input type="text" class="kv-key" placeholder="항목 (예: 집중 지수)" value="' + esc(pair[0]) + '">' +
      '<input type="text" class="kv-value" placeholder="설명" value="' + esc(pair[1]) + '">' +
      '<button type="button" class="btn btn-ghost btn-xs" data-kv-remove>−</button>' +
    '</div>';
  }).join('');
}

function collectItems(scope) {
  var out = {};
  var rows = scope.querySelectorAll('.kv-row');
  for (var i = 0; i < rows.length; i++) {
    var key = rows[i].querySelector('.kv-key').value.trim();
    var value = rows[i].querySelector('.kv-value').value.trim();
    if (key) out[key] = value;
  }
  return out;
}

export async function build(ctx) {
  var profiles = [];
  var results = [];
  var orgs = [];
  try {
    var loaded = await Promise.all([listProfiles(), listResults(), listOrganizations()]);
    profiles = loaded[0] || [];
    results = loaded[1] || [];
    orgs = loaded[2] || [];
  } catch (err) {
    console.warn(err);
  }
  var sorted = results.slice().sort(function (a, b) { return String(b.measured_at).localeCompare(String(a.measured_at)); });

  var memberOptions = profiles.filter(function (p) { return p.status !== 'withdrawn'; }).map(function (p) {
    return opt(p.id, (p.full_name || '(이름 없음)') + ' · ' + (p.email || ''));
  }).join('');

  var orgOptions = '<option value="">본점 · 기관 미지정</option>' + orgs.map(function (o) {
    return opt(o.id, o.name);
  }).join('');

  var rows = sorted.map(function (r) {
    return '<tr data-result-row="' + esc(r.id) + '">' +
      '<td>' + fmtDate(r.measured_at) + '</td>' +
      '<td class="muted small">' + esc(memberName(profiles, r.user_id)) + '</td>' +
      '<td>' + esc(CHECK_TYPES[r.check_type] || r.check_type) + '</td>' +
      '<td class="muted small">' + [r.focus_score, r.stress_index, r.balance_index, r.feedback_score].map(function (v) {
        return v === null || v === undefined ? '-' : Number(v).toFixed(1);
      }).join(' / ') + '</td>' +
      '<td>' + (r.file_path ? badge('업로드됨', 'green') : badge('미등록', 'neutral')) + '</td>' +
      '<td>' + (r.item_details && Object.keys(r.item_details).length ? badge(Object.keys(r.item_details).length + '항목', 'navy') : '-') + '</td>' +
      '<td><label class="switch"><input type="checkbox" data-public="' + esc(r.id) + '"' + (r.is_public === false ? '' : ' checked') + '><span></span></label></td>' +
      '<td class="muted small">' + (r.next_recheck_date ? fmtDate(r.next_recheck_date) : '-') + '</td>' +
      '<td><button type="button" class="btn btn-ghost btn-xs" data-edit="' + esc(r.id) + '">수정</button>' +
        '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-del="' + esc(r.id) + '">삭제</button></td>' +
    '</tr>';
  }).join('');

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">검사 결과 등록</h2>' +
      '<div class="admin-form">' +
        '<label class="field"><span class="field-label">회원</span><select id="res-user"><option value="">회원을 선택하세요</option>' + memberOptions + '</select></label>' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">검사 유형</span><select id="res-type">' + opt('simple', CHECK_TYPES.simple) + opt('full', CHECK_TYPES.full) + '</select></label>' +
          '<label class="field"><span class="field-label">측정일</span><input type="date" id="res-date" value="' + todayStr() + '"></label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">소속 기관</span><select id="res-org">' + orgOptions + '</select></label>' +
          '<label class="field field-inline"><span class="field-label">회원에게 공개</span>' +
            '<label class="switch"><input type="checkbox" id="res-public" checked><span></span></label></label>' +
        '</div>' +
        '<div class="form-grid form-grid-4">' +
          '<label class="field"><span class="field-label">집중</span><input type="number" step="0.1" id="res-focus" placeholder="0.0"></label>' +
          '<label class="field"><span class="field-label">스트레스</span><input type="number" step="0.1" id="res-stress" placeholder="0.0"></label>' +
          '<label class="field"><span class="field-label">좌우 균형</span><input type="number" step="0.1" id="res-balance" placeholder="0.0"></label>' +
          '<label class="field"><span class="field-label">자기 피드백</span><input type="number" step="0.1" id="res-feedback" placeholder="0.0"></label>' +
        '</div>' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">감정 성향</span><input type="text" id="res-emotion" placeholder="예: 안정 균형형"></label>' +
          '<label class="field"><span class="field-label">다음 재검사 권장일</span><input type="date" id="res-recheck"></label>' +
        '</div>' +
        '<div class="field"><span class="field-label">항목별 설명 (MY BRAIN에 그대로 표시)</span>' +
          '<div id="res-items">' + itemRowsHtml({}) + '</div>' +
          '<button type="button" class="btn btn-ghost btn-xs" id="res-add-item">+ 항목 추가</button>' +
          '<p class="field-hint">기본 항목: ' + Object.keys(CHECK_ITEM_LABELS).map(function (k) { return CHECK_ITEM_LABELS[k]; }).join(' · ') + '</p>' +
        '</div>' +
        '<label class="field"><span class="field-label">요약 코멘트</span><textarea id="res-summary" rows="2" placeholder="결과 요약 · 웰니스 안내"></textarea></label>' +
        '<label class="field"><span class="field-label">결과지 파일 (PDF · 이미지)</span><input type="file" id="res-file" accept="application/pdf,image/*"></label>' +
        '<p class="field-hint">비공개 Storage 버킷 <code>brain-results/{user_id}/…</code> 에 업로드되며, 회원은 Signed URL로만 열람합니다.</p>' +
        '<button type="button" class="btn btn-primary" id="res-submit">결과 등록</button>' +
      '</div>' +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">등록된 검사 결과 (' + results.length + ')</h2>' +
      table(['측정일', '회원', '유형', '집중/스트레스/균형/피드백', '결과지', '항목 설명', '공개', '재검사', ''], rows || emptyRow(9, '등록된 결과가 없습니다.')) +
      noticeBox('공개를 끄면 회원 MY BRAIN에서 해당 결과가 보이지 않습니다(DB RLS도 <code>is_public = true</code>만 허용).', 'neutral') +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var itemsEl = el.querySelector('#res-items');
      function bindKvButtons(scope) {
        var removes = scope.querySelectorAll('[data-kv-remove]');
        for (var i = 0; i < removes.length; i++) {
          removes[i].addEventListener('click', function () {
            var row = this.closest('.kv-row');
            if (row && scope.querySelectorAll('.kv-row').length > 1) row.remove();
          });
        }
      }
      bindKvButtons(itemsEl);

      var addItem = el.querySelector('#res-add-item');
      addItem.addEventListener('click', function () {
        var wrap = document.createElement('div');
        wrap.innerHTML = itemRowsHtml({});
        while (wrap.firstChild) itemsEl.appendChild(wrap.firstChild);
        bindKvButtons(itemsEl);
      });

      var submit = el.querySelector('#res-submit');
      submit.addEventListener('click', async function () {
        var userId = el.querySelector('#res-user').value;
        if (!userId) { toast('회원을 선택해 주세요.'); return; }
        var date = el.querySelector('#res-date').value;
        if (!date) { toast('측정일을 입력해 주세요.'); return; }
        var num = function (selector) {
          var raw = el.querySelector(selector).value;
          if (raw === '') return null;
          var value = Number(raw);
          return isFinite(value) ? value : null;
        };
        setBusy(submit, true, '등록 중');
        try {
          var fileInput = el.querySelector('#res-file');
          var file = fileInput && fileInput.files ? fileInput.files[0] : null;
          var uploaded = { file_path: '', file_name: '' };
          if (file) uploaded = await uploadResultFile(userId, file);
          var saved = await adminSaveResult({
            user_id: userId,
            booking_id: null,
            check_type: el.querySelector('#res-type').value,
            measured_at: date,
            focus_score: num('#res-focus'),
            stress_index: num('#res-stress'),
            balance_index: num('#res-balance'),
            feedback_score: num('#res-feedback'),
            emotion_type: el.querySelector('#res-emotion').value.trim(),
            summary_note: el.querySelector('#res-summary').value.trim(),
            item_details: collectItems(itemsEl),
            is_public: el.querySelector('#res-public').checked,
            org_id: el.querySelector('#res-org').value || null,
            file_path: uploaded.file_path,
            file_name: uploaded.file_name,
            next_recheck_date: el.querySelector('#res-recheck').value || null
          });
          await logAudit({ action: 'result_created', target_table: 'brain_check_results', target_id: saved ? saved.id : '', detail: { user_id: userId } });
          toast('검사 결과가 등록되었습니다.', 'success');
          window.location.hash = '#/admin/results?r=' + Date.now();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });

      var publicToggles = el.querySelectorAll('[data-public]');
      for (var p = 0; p < publicToggles.length; p++) {
        publicToggles[p].addEventListener('change', async function () {
          var id = this.getAttribute('data-public');
          var value = this.checked;
          try {
            await adminUpdateResult(id, { is_public: value });
            await logAudit({ action: 'result_visibility_changed', target_table: 'brain_check_results', target_id: id, detail: { is_public: value } });
            toast(value ? '회원에게 공개로 변경했습니다.' : '비공개로 변경했습니다.', 'success');
          } catch (err) {
            toast(friendlyError(err), 'error');
            this.checked = !value;
          }
        });
      }

      var editButtons = el.querySelectorAll('[data-edit]');
      for (var e = 0; e < editButtons.length; e++) {
        editButtons[e].addEventListener('click', function () {
          var id = this.getAttribute('data-edit');
          var target = null;
          for (var k = 0; k < results.length; k++) if (String(results[k].id) === String(id)) target = results[k];
          if (!target) return;
          openEditSheet(target, orgs, profiles, function () { window.location.hash = '#/admin/results?r=' + Date.now(); });
        });
      }

      var delButtons = el.querySelectorAll('[data-del]');
      for (var d = 0; d < delButtons.length; d++) {
        delButtons[d].addEventListener('click', async function () {
          var id = this.getAttribute('data-del');
          var ok = await confirmDialog({
            title: '검사 결과 삭제',
            message: '이 검사 결과를 삭제하면 회원 MY BRAIN에서도 사라집니다. 계속할까요?',
            confirmLabel: '삭제'
          });
          if (!ok) return;
          try {
            await adminDeleteResult(id);
            await logAudit({ action: 'result_deleted', target_table: 'brain_check_results', target_id: id, detail: {} });
            toast('삭제되었습니다.', 'success');
            window.location.hash = '#/admin/results?r=' + Date.now();
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
        });
      }
    }
  };
}

function openEditSheet(result, orgs, profiles, onSaved) {
  var orgOptions = '<option value="">본점 · 기관 미지정</option>' + orgs.map(function (o) {
    return opt(o.id, o.name, result.org_id);
  }).join('');

  openSheet({
    title: '검사 결과 수정',
    subtitle: memberName(profiles, result.user_id) + ' · ' + fmtDate(result.measured_at),
    wide: true,
    content:
      '<div class="form-grid">' +
        '<label class="field"><span class="field-label">검사 유형</span><select id="er-type">' + opt('simple', CHECK_TYPES.simple, result.check_type) + opt('full', CHECK_TYPES.full, result.check_type) + '</select></label>' +
        '<label class="field"><span class="field-label">측정일</span><input type="date" id="er-date" value="' + esc(result.measured_at) + '"></label>' +
      '</div>' +
      '<div class="form-grid form-grid-4">' +
        '<label class="field"><span class="field-label">집중</span><input type="number" step="0.1" id="er-focus" value="' + (result.focus_score === null || result.focus_score === undefined ? '' : result.focus_score) + '"></label>' +
        '<label class="field"><span class="field-label">스트레스</span><input type="number" step="0.1" id="er-stress" value="' + (result.stress_index === null || result.stress_index === undefined ? '' : result.stress_index) + '"></label>' +
        '<label class="field"><span class="field-label">좌우 균형</span><input type="number" step="0.1" id="er-balance" value="' + (result.balance_index === null || result.balance_index === undefined ? '' : result.balance_index) + '"></label>' +
        '<label class="field"><span class="field-label">자기 피드백</span><input type="number" step="0.1" id="er-feedback" value="' + (result.feedback_score === null || result.feedback_score === undefined ? '' : result.feedback_score) + '"></label>' +
      '</div>' +
      '<div class="form-grid">' +
        '<label class="field"><span class="field-label">소속 기관</span><select id="er-org">' + orgOptions + '</select></label>' +
        '<label class="field field-inline"><span class="field-label">회원에게 공개</span>' +
          '<label class="switch"><input type="checkbox" id="er-public"' + (result.is_public === false ? '' : ' checked') + '><span></span></label></label>' +
      '</div>' +
      '<label class="field"><span class="field-label">감정 성향</span><input type="text" id="er-emotion" value="' + esc(result.emotion_type || '') + '"></label>' +
      '<div class="field"><span class="field-label">항목별 설명</span><div id="er-items">' + itemRowsHtml(result.item_details || {}) + '</div>' +
        '<button type="button" class="btn btn-ghost btn-xs" id="er-add">+ 항목 추가</button></div>' +
      '<label class="field"><span class="field-label">요약 코멘트</span><textarea id="er-summary" rows="3">' + esc(result.summary_note || '') + '</textarea></label>' +
      '<label class="field"><span class="field-label">다음 재검사 권장일</span><input type="date" id="er-recheck" value="' + esc(result.next_recheck_date || '') + '"></label>' +
      noticeBox(result.file_path ? '결과지 파일은 기존 등록본을 그대로 사용합니다.' : '결과지 파일이 아직 등록되지 않았습니다. 새로 등록하려면 결과 등록 화면을 이용해 주세요.', 'neutral'),
    footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
      '<button type="button" class="btn btn-primary" id="er-save">저장</button>',
    onMount: function (el) {
      var itemsEl = el.querySelector('#er-items');
      function bindKv() {
        var removes = itemsEl.querySelectorAll('[data-kv-remove]');
        for (var i = 0; i < removes.length; i++) {
          removes[i].addEventListener('click', function () {
            var row = this.closest('.kv-row');
            if (row && itemsEl.querySelectorAll('.kv-row').length > 1) row.remove();
          });
        }
      }
      bindKv();
      el.querySelector('#er-add').addEventListener('click', function () {
        var wrap = document.createElement('div');
        wrap.innerHTML = itemRowsHtml({});
        while (wrap.firstChild) itemsEl.appendChild(wrap.firstChild);
        bindKv();
      });

      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });

      var save = el.querySelector('#er-save');
      save.addEventListener('click', async function () {
        var num = function (selector) {
          var raw = el.querySelector(selector).value;
          if (raw === '') return null;
          var value = Number(raw);
          return isFinite(value) ? value : null;
        };
        setBusy(save, true, '저장 중');
        try {
          await adminUpdateResult(result.id, {
            check_type: el.querySelector('#er-type').value,
            measured_at: el.querySelector('#er-date').value,
            focus_score: num('#er-focus'),
            stress_index: num('#er-stress'),
            balance_index: num('#er-balance'),
            feedback_score: num('#er-feedback'),
            emotion_type: el.querySelector('#er-emotion').value.trim(),
            summary_note: el.querySelector('#er-summary').value.trim(),
            item_details: collectItems(itemsEl),
            is_public: el.querySelector('#er-public').checked,
            org_id: el.querySelector('#er-org').value || null,
            next_recheck_date: el.querySelector('#er-recheck').value || null
          });
          await logAudit({ action: 'result_updated', target_table: 'brain_check_results', target_id: result.id, detail: {} });
          toast('저장되었습니다.', 'success');
          closeSheet();
          if (typeof onSaved === 'function') onSaved();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(save, false);
        }
      });
    }
  });
}
