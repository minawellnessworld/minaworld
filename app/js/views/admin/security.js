/* 관리자 → 보안: 2단계 인증(TOTP) 등록·검증·해제 + 동의 이력 확인 */
import { state, friendlyError } from '../../store.js?v=2.0.17';
import {
  getMfaStatus, enrollTotp, verifyTotp, unenrollTotp, listConsentLogs, logAudit
} from '../../store-security.js?v=2.0.17';
import { CONSENT_LABELS } from '../../config.js?v=2.0.17';
import {
  icon, esc, fmtDateTime, toast, badge, setBusy, confirmDialog, noticeBox, emptyState
} from '../../ui.js?v=2.0.17';

function table(headers, rows) {
  return '<div class="table-scroll"><table class="data-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function emptyRow(cols, text) {
  return '<tr><td colspan="' + cols + '" class="table-empty">' + esc(text) + '</td></tr>';
}

export async function build(ctx) {
  var status = null;
  var mfaError = '';
  try {
    status = await getMfaStatus();
  } catch (err) {
    mfaError = friendlyError(err);
  }

  var consents = [];
  try {
    consents = await listConsentLogs(60);
  } catch (err) {
    consents = [];
  }

  var consentRows = consents.map(function (c) {
    var name = c.profiles ? (c.profiles.full_name || c.profiles.email) : String(c.user_id || '').slice(0, 8);
    return '<tr><td class="muted small">' + fmtDateTime(c.created_at) + '</td>' +
      '<td class="muted small">' + esc(name || '-') + '</td>' +
      '<td>' + esc(CONSENT_LABELS[c.consent_type] || c.consent_type) + '</td>' +
      '<td>' + badge(c.agreed ? '동의' : '철회', c.agreed ? 'green' : 'neutral') + '</td>' +
      '<td class="muted small">' + esc(c.version || '') + '</td></tr>';
  }).join('');

  var factorRows = status && status.factors && status.factors.length
    ? status.factors.map(function (f) {
        return '<div class="mini-row"><span>' + esc(f.friendly_name || 'TOTP') + '</span>' +
          '<strong>' + esc(f.status || '') + '</strong>' +
          '<span class="muted small">' + esc(f.created_at ? fmtDateTime(f.created_at) : '') + '</span>' +
          '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-unenroll="' + esc(f.id) + '">해제</button></div>';
      }).join('')
    : '<p class="muted small">등록된 2단계 인증 팩터가 없습니다.</p>';

  var html =
    (mfaError ? noticeBox(esc(mfaError), 'warn') : '') +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">2단계 인증 (TOTP)</h2>' +
      (state.mode === 'live'
        ? '<div class="stat-grid">' +
            '<div class="stat-card tone-' + (status && status.enabled ? 'navy' : 'yellow') + '">' +
              '<span class="stat-label">2단계 인증</span>' +
              '<strong class="stat-value">' + (status && status.enabled ? '등록됨' : '미등록') + '</strong>' +
              '<span class="stat-sub">현재 세션 ' + esc(status ? status.currentLevel : 'aal1') + '</span></div>' +
            '<div class="stat-card tone-ivory"><span class="stat-label">다음 단계</span>' +
              '<strong class="stat-value">' + esc(status ? status.nextLevel : 'aal1') + '</strong>' +
              '<span class="stat-sub">팩터 등록 시 aal2 요구</span></div>' +
          '</div>'
        : noticeBox('로컬 체험 모드에서는 2단계 인증을 등록할 수 없습니다. 실서버 연결 후 이용해 주세요.', 'warn')) +
      '<div id="mfa-enroll-area">' +
        (state.mode === 'live' && status && !status.enabled
          ? '<button type="button" class="btn btn-primary" id="mfa-start">2단계 인증 등록 시작</button>'
          : '') +
      '</div>' +
      '<h3 class="admin-h4">등록된 팩터</h3>' + factorRows +
      noticeBox('2단계 인증을 등록하면 다음 로그인부터 #/admin-login 에서 6자리 코드를 요구합니다. 코드를 잃어버린 경우 Supabase 대시보드에서 팩터를 해제해야 합니다.', 'neutral') +
    '</section>' +
    '<section class="admin-section">' +
      '<h2 class="admin-h2">동의 이력 (최근 ' + consents.length + '건)</h2>' +
      table(['시각', '회원', '동의 항목', '상태', '문서 버전'], consentRows || emptyRow(5, '아직 동의 이력이 없습니다.')) +
      noticeBox('회원가입 시 <strong>개인정보 수집·이용(필수)</strong> · <strong>민감정보(뇌파/상담) 처리(필수)</strong> · <strong>마케팅(선택)</strong> 동의가 consent_logs 에 실제로 기록됩니다.', 'neutral') +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var start = el.querySelector('#mfa-start');
      if (start) {
        start.addEventListener('click', async function () {
          setBusy(start, true, '준비 중');
          try {
            var enrollment = await enrollTotp();
            var area = el.querySelector('#mfa-enroll-area');
            area.innerHTML =
              '<div class="mfa-enroll">' +
                '<div class="mfa-qr">' + (enrollment.qrCode
                  ? '<img src="' + esc(enrollment.qrCode) + '" alt="2단계 인증 QR 코드">'
                  : '<p class="muted small">QR 이미지를 불러오지 못했습니다. 아래 키를 직접 입력해 주세요.</p>') + '</div>' +
                '<div class="mfa-info">' +
                  '<p class="muted small">인증 앱(Google Authenticator · 1Password 등)으로 QR을 스캔하거나 아래 키를 입력하세요.</p>' +
                  '<p class="mono secret">' + esc(enrollment.secret || '') + '</p>' +
                  '<label class="field"><span class="field-label">인증 앱에 표시된 6자리 코드</span>' +
                    '<input type="text" id="mfa-code" inputmode="numeric" maxlength="6" placeholder="000000"></label>' +
                  '<button type="button" class="btn btn-primary" id="mfa-verify">검증하고 등록 완료</button>' +
                '</div>' +
              '</div>';
            var verify = area.querySelector('#mfa-verify');
            verify.addEventListener('click', async function () {
              var code = area.querySelector('#mfa-code').value.replace(/\s/g, '');
              if (code.length !== 6) { toast('6자리 코드를 입력해 주세요.'); return; }
              setBusy(verify, true, '검증 중');
              try {
                await verifyTotp(enrollment.factorId, code);
                await logAudit({ action: 'mfa_enrolled', target_table: 'auth.mfa_factors', target_id: enrollment.factorId, detail: {} });
                toast('2단계 인증이 등록되었습니다.', 'success');
                window.location.hash = '#/admin/security?r=' + Date.now();
              } catch (err) {
                toast(friendlyError(err), 'error');
                setBusy(verify, false);
              }
            });
            var input = area.querySelector('#mfa-code');
            if (input) input.focus();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(start, false);
          }
        });
      }

      var unenrollButtons = el.querySelectorAll('[data-unenroll]');
      for (var i = 0; i < unenrollButtons.length; i++) {
        unenrollButtons[i].addEventListener('click', async function () {
          var ok = await confirmDialog({
            title: '2단계 인증 해제',
            message: '이 팩터를 해제하면 다음 로그인부터 코드를 요구하지 않습니다. 계속할까요?',
            confirmLabel: '해제'
          });
          if (!ok) return;
          try {
            await unenrollTotp(this.getAttribute('data-unenroll'));
            toast('2단계 인증을 해제했습니다.', 'success');
            window.location.hash = '#/admin/security?r=' + Date.now();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  };
}
