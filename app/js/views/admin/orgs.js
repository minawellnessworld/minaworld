/* 관리자 → 제휴 기관 통합 관리: 8종 유형 · 계약 · 수수료 · 정산계좌 · 승인 · 기관 관리자 계정 즉시 발급 */
import { ORG_TYPES, ORG_STATUS, WEEKDAYS, ROLES } from '../../config.js?v=2.0.37';
import { state, listProfiles, friendlyError } from '../../store.js?v=2.0.37';
import {
  listOrganizationsFiltered, saveOrganization, getOrganization, listBranchesForOrg, saveBranch,
  listOrgSchedules, saveSchedule, deleteSchedule, issueAccount, listOrgMemberships
} from '../../store-org.js?v=2.0.37';
import { logAudit } from '../../store-security.js?v=2.0.37';
import {
  icon, esc, fmtDate, toast, badge, openSheet, closeSheet, setBusy, noticeBox, confirmDialog
} from '../../ui.js?v=2.0.37';

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

var TYPE_OPTIONS = Object.keys(ORG_TYPES).map(function (key) { return opt(key, ORG_TYPES[key]); }).join('');
var STATUS_OPTIONS = Object.keys(ORG_STATUS).map(function (key) { return opt(key, ORG_STATUS[key]); }).join('');

function orgFormHtml(org) {
  return '<div class="form-grid">' +
      '<label class="field"><span class="field-label">기관명 *</span><input type="text" id="of-name" value="' + esc(org ? org.name : '') + '" placeholder="예: OO기업 복지팀"></label>' +
      '<label class="field"><span class="field-label">기관 유형</span><select id="of-type">' +
        Object.keys(ORG_TYPES).map(function (key) { return opt(key, ORG_TYPES[key], org ? org.org_type : 'corporate'); }).join('') + '</select></label>' +
    '</div>' +
    '<div class="form-grid">' +
      '<label class="field"><span class="field-label">사업자번호</span><input type="text" id="of-business" value="' + esc(org ? org.business_no || '' : '') + '" placeholder="000-00-00000"></label>' +
      '<label class="field"><span class="field-label">대표자명</span><input type="text" id="of-ceo" value="' + esc(org ? org.ceo_name || '' : '') + '"></label>' +
    '</div>' +
    '<div class="form-grid form-grid-3">' +
      '<label class="field"><span class="field-label">담당자</span><input type="text" id="of-contact" value="' + esc(org ? org.contact_name || '' : '') + '"></label>' +
      '<label class="field"><span class="field-label">연락처</span><input type="tel" id="of-phone" value="' + esc(org ? org.contact_phone || '' : '') + '"></label>' +
      '<label class="field"><span class="field-label">이메일</span><input type="email" id="of-email" value="' + esc(org ? org.contact_email || '' : '') + '"></label>' +
    '</div>' +
    '<label class="field"><span class="field-label">주소</span><input type="text" id="of-address" value="' + esc(org ? org.address || '' : '') + '"></label>' +
    '<div class="form-grid">' +
      '<label class="field"><span class="field-label">계약 시작일</span><input type="date" id="of-start" value="' + esc(org && org.contract_start ? org.contract_start : '') + '"></label>' +
      '<label class="field"><span class="field-label">계약 종료일</span><input type="date" id="of-end" value="' + esc(org && org.contract_end ? org.contract_end : '') + '"></label>' +
    '</div>' +
    '<div class="form-grid">' +
      '<label class="field"><span class="field-label">운영 상태</span><select id="of-status">' +
        Object.keys(ORG_STATUS).map(function (key) { return opt(key, ORG_STATUS[key], org ? org.status : 'pending'); }).join('') + '</select></label>' +
      '<label class="field"><span class="field-label">수수료율 (%)</span><input type="number" step="0.01" min="0" max="100" id="of-commission" value="' + (org ? Number(org.commission_rate === undefined || org.commission_rate === null ? 15 : org.commission_rate) : 15) + '"></label>' +
    '</div>' +
    '<div class="form-grid">' +
      '<label class="field"><span class="field-label">정산 은행</span><input type="text" id="of-bank" value="' + esc(org ? org.settlement_bank || '' : '') + '" placeholder="예: 국민은행"></label>' +
      '<label class="field"><span class="field-label">정산 계좌</span><input type="text" id="of-account" value="' + esc(org ? org.settlement_account || '' : '') + '" placeholder="000-0000-0000"></label>' +
    '</div>' +
    '<label class="field"><span class="field-label">메모</span><input type="text" id="of-notes" value="' + esc(org ? org.notes || '' : '') + '" placeholder="제휴 조건 · 예상 인원"></label>';
}

function collectOrgForm(el) {
  return {
    name: el.querySelector('#of-name').value.trim(),
    org_type: el.querySelector('#of-type').value,
    business_no: el.querySelector('#of-business').value.trim(),
    ceo_name: el.querySelector('#of-ceo').value.trim(),
    contact_name: el.querySelector('#of-contact').value.trim(),
    contact_phone: el.querySelector('#of-phone').value.trim(),
    contact_email: el.querySelector('#of-email').value.trim(),
    address: el.querySelector('#of-address').value.trim(),
    contract_start: el.querySelector('#of-start').value || null,
    contract_end: el.querySelector('#of-end').value || null,
    status: el.querySelector('#of-status').value,
    commission_rate: el.querySelector('#of-commission').value,
    settlement_bank: el.querySelector('#of-bank').value.trim(),
    settlement_account: el.querySelector('#of-account').value.trim(),
    notes: el.querySelector('#of-notes').value.trim()
  };
}

export async function build(ctx) {
  var orgs = [];
  var profiles = [];
  var memberships = [];
  try {
    var loaded = await Promise.all([listOrganizationsFiltered(), listProfiles()]);
    orgs = loaded[0] || [];
    profiles = loaded[1] || [];
  } catch (err) {
    console.warn(err);
  }
  try { memberships = await listOrgMemberships(); } catch (err) { memberships = []; }

  var branchMap = {};
  await Promise.all(orgs.map(async function (o) {
    try {
      var rows = await listBranchesForOrg(o.id);
      branchMap[o.id] = rows || [];
    } catch (err) {
      branchMap[o.id] = [];
    }
  }));

  var rows = orgs.map(function (o) {
    var memberCount = profiles.filter(function (p) { return String(p.org_id) === String(o.id); }).length;
    var branchCount = (branchMap[o.id] || []).length;
    return '<tr data-org-row="' + esc(o.id) + '">' +
      '<td><strong>' + esc(o.name) + '</strong><br><span class="muted small">' + esc(ORG_TYPES[o.org_type] || o.org_type) + '</span></td>' +
      '<td class="muted small">' + esc(o.business_no || '-') + '<br>' + esc(o.ceo_name || '-') + '</td>' +
      '<td class="muted small">' + esc(o.contact_name || '-') + '<br>' + esc(o.contact_phone || '') + '<br>' + esc(o.contact_email || '') + '</td>' +
      '<td class="muted small">' + (o.contract_start ? fmtDate(o.contract_start) : '-') + ' ~ ' + (o.contract_end ? fmtDate(o.contract_end) : '-') + '</td>' +
      '<td>' + Number(o.commission_rate || 0) + '%<br><span class="muted small">' + esc(o.settlement_bank || '-') + ' ' + esc(o.settlement_account || '') + '</span></td>' +
      '<td>' + (o.status === 'pending'
        ? '<select data-org-status="' + esc(o.id) + '">' + Object.keys(ORG_STATUS).map(function (key) { return opt(key, ORG_STATUS[key], o.status); }).join('') + '</select>' +
          '<br><button type="button" class="btn btn-primary btn-xs" data-approve="' + esc(o.id) + '">승인</button>'
        : '<select data-org-status="' + esc(o.id) + '">' + Object.keys(ORG_STATUS).map(function (key) { return opt(key, ORG_STATUS[key], o.status); }).join('') + '</select>') + '</td>' +
      '<td class="muted small">회원 ' + memberCount + '명<br>지점 ' + branchCount + '곳</td>' +
      '<td>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-edit="' + esc(o.id) + '">수정</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-account="' + esc(o.id) + '">계정 발급</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-sched="' + esc(o.id) + '">운영시간</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-branch="' + esc(o.id) + '">지점</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  var pendingCount = orgs.filter(function (o) { return o.status === 'pending'; }).length;

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">제휴 기관 등록</h2>' +
      '<p class="muted small">기업 · 헬스장 · PT센터 · 필라테스 · 요가 · 병원 · 호텔 · 웰니스센터 · 기타 8종 유형. 등록 후 <strong>승인</strong>하면 기관 관리자 계정 발급과 회원 연결이 가능합니다.</p>' +
      '<div class="admin-form">' + orgFormHtml(null) +
        '<button type="button" class="btn btn-primary" id="org-submit">기관 등록</button>' +
      '</div>' +
      (pendingCount ? noticeBox('승인 대기 기관이 <strong>' + pendingCount + '곳</strong> 있습니다. 승인하면 status가 active로 전환됩니다.', 'warn') : '') +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">제휴 기관 (' + orgs.length + ')</h2>' +
      table(['기관', '사업자 · 대표', '담당자', '계약 기간', '수수료 · 계좌', '상태', '규모', ''], rows || emptyRow(8, '등록된 기관이 없습니다.')) +
      noticeBox('기관 관리자 계정은 <code>account_pre_assignments</code> + 보조 클라이언트로 <strong>현재 관리자 세션을 끊지 않고</strong> 즉시 발급됩니다.', 'neutral') +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var submit = el.querySelector('#org-submit');
      submit.addEventListener('click', async function () {
        var payload = collectOrgForm(el);
        if (!payload.name) { toast('기관명을 입력해 주세요.'); return; }
        setBusy(submit, true, '등록 중');
        try {
          var saved = await saveOrganization(payload);
          await logAudit({ action: 'org_created', target_table: 'organizations', target_id: saved ? saved.id : '', detail: { name: payload.name } });
          toast('제휴 기관이 등록되었습니다.', 'success');
          window.location.hash = '#/admin/orgs?r=' + Date.now();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });

      function find(id) {
        for (var i = 0; i < orgs.length; i++) if (String(orgs[i].id) === String(id)) return orgs[i];
        return null;
      }

      var approveButtons = el.querySelectorAll('[data-approve]');
      for (var a = 0; a < approveButtons.length; a++) {
        approveButtons[a].addEventListener('click', async function () {
          var id = this.getAttribute('data-approve');
          try {
            await saveOrganization(Object.assign({}, find(id), { status: 'active' }), id);
            await logAudit({ action: 'org_approved', target_table: 'organizations', target_id: id, detail: {} });
            toast('기관이 승인되어 운영 중으로 전환되었습니다.', 'success');
            window.location.hash = '#/admin/orgs?r=' + Date.now();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var statusSelects = el.querySelectorAll('[data-org-status]');
      for (var s = 0; s < statusSelects.length; s++) {
        statusSelects[s].addEventListener('change', async function () {
          var id = this.getAttribute('data-org-status');
          try {
            await saveOrganization(Object.assign({}, find(id), { status: this.value }), id);
            await logAudit({ action: 'org_updated', target_table: 'organizations', target_id: id, detail: { status: this.value } });
            toast('기관 상태가 변경되었습니다.', 'success');
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var editButtons = el.querySelectorAll('[data-edit]');
      for (var e = 0; e < editButtons.length; e++) {
        editButtons[e].addEventListener('click', function () {
          var target = find(this.getAttribute('data-edit'));
          if (!target) return;
          openOrgEdit(target);
        });
      }

      var accountButtons = el.querySelectorAll('[data-account]');
      for (var c = 0; c < accountButtons.length; c++) {
        accountButtons[c].addEventListener('click', function () {
          var target = find(this.getAttribute('data-account'));
          if (!target) return;
          openAccountIssue(target);
        });
      }

      var schedButtons = el.querySelectorAll('[data-sched]');
      for (var q = 0; q < schedButtons.length; q++) {
        schedButtons[q].addEventListener('click', function () {
          var target = find(this.getAttribute('data-sched'));
          if (!target) return;
          openScheduleEditor(target);
        });
      }

      var branchButtons = el.querySelectorAll('[data-branch]');
      for (var b = 0; b < branchButtons.length; b++) {
        branchButtons[b].addEventListener('click', function () {
          var target = find(this.getAttribute('data-branch'));
          if (!target) return;
          openBranchEditor(target);
        });
      }
    }
  };
}

function openOrgEdit(org) {
  openSheet({
    title: '기관 정보 수정',
    subtitle: org.name,
    wide: true,
    content: orgFormHtml(org),
    footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
      '<button type="button" class="btn btn-primary" id="eo-save">저장</button>',
    onMount: function (el) {
      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });
      var save = el.querySelector('#eo-save');
      save.addEventListener('click', async function () {
        var payload = collectOrgForm(el);
        if (!payload.name) { toast('기관명을 입력해 주세요.'); return; }
        setBusy(save, true, '저장 중');
        try {
          await saveOrganization(payload, org.id);
          await logAudit({ action: 'org_updated', target_table: 'organizations', target_id: org.id, detail: { name: payload.name } });
          toast('저장되었습니다.', 'success');
          closeSheet();
          window.location.hash = '#/admin/orgs?r=' + Date.now();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(save, false);
        }
      });
    }
  });
}

function openAccountIssue(org) {
  openSheet({
    title: '기관 관리자 계정 발급',
    subtitle: org.name + ' · role = partner_admin',
    content:
      noticeBox('기관 관리자는 <strong>자기 기관 데이터만</strong> 볼 수 있습니다(서버 RLS). 계정은 즉시 로그인 가능한 상태로 발급됩니다.', 'neutral') +
      '<div class="form-grid">' +
        '<label class="field"><span class="field-label">담당자 이름</span><input type="text" id="ia-name" value="' + esc(org.contact_name || '') + '"></label>' +
        '<label class="field"><span class="field-label">연락처</span><input type="tel" id="ia-phone" value="' + esc(org.contact_phone || '') + '"></label>' +
      '</div>' +
      '<label class="field"><span class="field-label">로그인 이메일</span><input type="email" id="ia-email" value="' + esc(org.contact_email || '') + '" placeholder="partner@example.com"></label>' +
      '<p class="field-hint">임시 비밀번호는 자동 생성되어 발급 직후 한 번만 표시됩니다.</p>',
    footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
      '<button type="button" class="btn btn-primary" id="ia-submit">계정 발급</button>',
    onMount: function (el) {
      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });
      var submit = el.querySelector('#ia-submit');
      submit.addEventListener('click', async function () {
        var email = el.querySelector('#ia-email').value.trim();
        if (!email) { toast('이메일을 입력해 주세요.'); return; }
        setBusy(submit, true, '발급 중');
        try {
          var result = await issueAccount({
            email: email,
            full_name: el.querySelector('#ia-name').value.trim(),
            phone: el.querySelector('#ia-phone').value.trim(),
            role: 'partner_admin',
            org_id: org.id
          });
          await logAudit({ action: 'org_account_issued', target_table: 'profiles', target_id: email, detail: { org_id: org.id } });
          closeSheet();
          openSheet({
            title: '기관 관리자 계정 발급 완료',
            content: '<div class="summary-list">' +
              '<div class="summary-row"><span>기관</span><strong>' + esc(org.name) + '</strong></div>' +
              '<div class="summary-row"><span>이메일</span><strong>' + esc(result.email) + '</strong></div>' +
              '<div class="summary-row"><span>임시 비밀번호</span><strong class="mono">' + esc(result.tempPassword) + '</strong></div>' +
              '<div class="summary-row"><span>로그인 경로</span><strong>#/admin-login</strong></div>' +
              '</div>' +
              noticeBox('임시 비밀번호는 다시 표시되지 않습니다. 담당자에게 안전한 방법으로 전달하고 첫 로그인 후 변경하도록 안내해 주세요.', 'warn') +
              (result.note ? noticeBox(esc(result.note), 'warn') : ''),
            footer: '<button type="button" class="btn btn-primary" data-ok>확인</button>',
            onMount: function (sheet) {
              var ok = sheet.querySelector('[data-ok]');
              if (ok) ok.addEventListener('click', function () { closeSheet(); window.location.hash = '#/admin/orgs?r=' + Date.now(); });
            }
          });
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });
    }
  });
}

async function openScheduleEditor(org) {
  var branches = [];
  var schedules = [];
  try {
    var loaded = await Promise.all([listBranchesForOrg(org.id), listOrgSchedules(org.id)]);
    branches = loaded[0] || [];
    schedules = loaded[1] || [];
  } catch (err) {
    console.warn(err);
  }

  var content = branches.map(function (b) {
    var dayRows = WEEKDAYS.map(function (label, weekday) {
      var row = null;
      for (var i = 0; i < schedules.length; i++) {
        if (Number(schedules[i].weekday) === weekday && String(schedules[i].branch_id || '') === String(b.id)) row = schedules[i];
      }
      return '<div class="sched-row">' +
        '<span class="sched-day">' + label + '</span>' +
        (row
          ? '<input type="time" class="input-sm" data-open="' + esc(row.id) + '" value="' + esc(String(row.open_time).slice(0, 5)) + '">' +
            '<span class="muted small">~</span>' +
            '<input type="time" class="input-sm" data-close="' + esc(row.id) + '" value="' + esc(String(row.close_time).slice(0, 5)) + '">' +
            '<button type="button" class="btn btn-ghost btn-xs" data-save="' + esc(row.id) + '">저장</button>' +
            '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-del="' + esc(row.id) + '">삭제</button>'
          : '<span class="muted small">휴무</span>' +
            '<button type="button" class="btn btn-ghost btn-xs" data-add="' + esc(b.id) + '" data-weekday="' + weekday + '">운영 추가</button>') +
      '</div>';
    }).join('');
    return '<div class="sched-block"><h4 class="admin-h4">' + esc(b.name) + '</h4>' + dayRows + '</div>';
  }).join('');

  openSheet({
    title: '요일별 운영시간',
    subtitle: org.name,
    wide: true,
    content: (content || noticeBox('등록된 지점이 없습니다. 먼저 지점을 추가해 주세요.', 'warn')) +
      '<p class="field-hint">회원 예약 화면은 이 운영시간으로만 예약 시간대를 생성합니다.</p>',
    footer: '<button type="button" class="btn btn-primary" data-close>닫기</button>',
    onMount: function (el) {
      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });

      var saves = el.querySelectorAll('[data-save]');
      for (var i = 0; i < saves.length; i++) {
        saves[i].addEventListener('click', async function () {
          var id = this.getAttribute('data-save');
          var openEl = el.querySelector('[data-open="' + id + '"]');
          var closeEl = el.querySelector('[data-close="' + id + '"]');
          var base = null;
          for (var k = 0; k < schedules.length; k++) if (String(schedules[k].id) === String(id)) base = schedules[k];
          if (!base) return;
          setBusy(this, true, '저장');
          try {
            await saveSchedule({
              org_id: org.id,
              branch_id: base.branch_id,
              counselor_id: base.counselor_id,
              weekday: base.weekday,
              open_time: openEl.value,
              close_time: closeEl.value,
              slot_minutes: base.slot_minutes || 60,
              is_active: true
            }, id);
            await logAudit({ action: 'schedule_updated', target_table: 'org_schedules', target_id: id, detail: { open: openEl.value, close: closeEl.value } });
            toast('운영시간이 저장되었습니다.', 'success');
            setBusy(this, false);
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
          }
        });
      }

      var dels = el.querySelectorAll('[data-del]');
      for (var d = 0; d < dels.length; d++) {
        dels[d].addEventListener('click', async function () {
          try {
            await deleteSchedule(this.getAttribute('data-del'));
            toast('휴무로 변경했습니다.', 'success');
            closeSheet();
            openScheduleEditor(org);
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var adds = el.querySelectorAll('[data-add]');
      for (var a = 0; a < adds.length; a++) {
        adds[a].addEventListener('click', async function () {
          try {
            await saveSchedule({
              org_id: org.id,
              branch_id: this.getAttribute('data-add'),
              weekday: Number(this.getAttribute('data-weekday')),
              open_time: '10:00',
              close_time: '19:00',
              slot_minutes: 60,
              is_active: true
            });
            toast('운영일이 추가되었습니다.', 'success');
            closeSheet();
            openScheduleEditor(org);
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  });
}

async function openBranchEditor(org) {
  var branches = [];
  try { branches = await listBranchesForOrg(org.id); } catch (err) { console.warn(err); }

  openSheet({
    title: '지점 관리',
    subtitle: org.name,
    content:
      (branches.length
        ? branches.map(function (b) {
            return '<div class="mini-row"><span>' + badge(b.status === 'active' ? '운영' : b.status, 'green') + '</span><strong>' + esc(b.name) + '</strong>' +
              '<em class="muted small">' + esc(b.address || '') + '</em></div>';
          }).join('')
        : '<p class="muted small">등록된 지점이 없습니다.</p>') +
      '<div class="admin-form" style="margin-top:12px">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">지점명</span><input type="text" id="ob-name" placeholder="예: 강남점"></label>' +
          '<label class="field"><span class="field-label">전화</span><input type="tel" id="ob-phone"></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">주소</span><input type="text" id="ob-address"></label>' +
        '<button type="button" class="btn btn-ghost btn-sm" id="ob-submit">지점 추가</button>' +
      '</div>',
    footer: '<button type="button" class="btn btn-primary" data-close>닫기</button>',
    onMount: function (el) {
      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });
      var submit = el.querySelector('#ob-submit');
      submit.addEventListener('click', async function () {
        var name = el.querySelector('#ob-name').value.trim();
        if (!name) { toast('지점명을 입력해 주세요.'); return; }
        setBusy(submit, true, '추가 중');
        try {
          await saveBranch({
            org_id: org.id,
            name: name,
            phone: el.querySelector('#ob-phone').value.trim(),
            address: el.querySelector('#ob-address').value.trim(),
            status: 'active'
          });
          toast('지점이 추가되었습니다.', 'success');
          closeSheet();
          openBranchEditor(org);
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });
    }
  });
}
