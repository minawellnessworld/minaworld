/* 예약 플로우 (BRAIN CHECK · NEURO TRAINING · 프로그램 공용)
   ---------------------------------------------------------------------
   PART 2-4 / PART 5 통합 예약:
    지점 선택 → 담당자(선택) → 날짜 → 기관/지점 운영 요일·시간대만 생성
    → get_booked_slots RPC 로 이미 예약된 시간대 비활성(중복 차단)
    → DB 유니크 인덱스(idx_bookings_no_overlap) 위반 시 한국어 안내
   ===================================================================== */
import { CONFIG, BOOKING_STATUS, BOOKING_PAYMENT_STATUS } from './config.js?v=2.0.13';
import {
  state, createBooking, updateBooking, cancelBooking, listBookings, validateCoupon,
  getBookedSlots, listAllPrograms, listProfiles, friendlyError
} from './store.js?v=2.0.13';
import {
  listOrganizationsFiltered, listBranchesForOrg, listOrgSchedules, buildSlotsFromSchedules
} from './store-org.js?v=2.0.13';
import { logAudit } from './store-security.js?v=2.0.13';
import {
  esc, fmtKRW, fmtDate, icon, toast, openSheet, closeSheet, noticeBox, setBusy, go, track,
  confirmDialog, bookingStatusTone, paymentStatusTone, emptyState, loadingBlock
} from './ui.js?v=2.0.13';

function dateToInput(d) {
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

function minDate() { return dateToInput(new Date()); }

function maxDate() {
  var d = new Date();
  d.setDate(d.getDate() + CONFIG.BOOKING_MAX_DAYS);
  return dateToInput(d);
}

function defaultDate() {
  var d = new Date();
  d.setDate(d.getDate() + 1);
  return dateToInput(d);
}

function weekdayOf(dateStr) {
  var d = new Date(String(dateStr) + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  return d.getDay();
}

var WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

var COUNSEL_NOTE_PLACEHOLDER = '예: 요즘 잠들기가 어렵고 오후에 집중이 안 됩니다.';

export function requireLoginSheet(message) {
  openSheet({
    title: '로그인이 필요합니다',
    subtitle: message || '예약과 기록은 회원 계정에 안전하게 저장됩니다.',
    content:
      noticeBox('MINA WORLD 앱은 이메일 계정으로 로그인 후 예약·기록을 저장합니다.', 'neutral') +
      '<p class="sheet-help">아직 계정이 없다면 회원가입 후 바로 이용할 수 있습니다.</p>',
    footer:
      '<button type="button" class="btn btn-ghost" data-go="close">닫기</button>' +
      '<button type="button" class="btn btn-primary" data-go="account">로그인 · 회원가입</button>',
    onMount: function (el) {
      var accountBtn = el.querySelector('[data-go="account"]');
      if (accountBtn) accountBtn.addEventListener('click', function () { closeSheet(); go('/account'); });
      var closeBtn = el.querySelector('[data-go="close"]');
      if (closeBtn) closeBtn.addEventListener('click', function () { closeSheet(); });
    }
  });
}

/* 예약 가능한 지점/운영시간 로드 (실패해도 기본값으로 진행) */
async function loadBookingContext() {
  var context = { branches: [], schedules: [], organizations: [], degraded: false };
  try {
    var orgs = await listOrganizationsFiltered('active');
    context.organizations = orgs || [];
    var all = [];
    for (var i = 0; i < context.organizations.length; i++) {
      var list = await listBranchesForOrg(context.organizations[i].id);
      (list || []).forEach(function (b) {
        all.push({
          id: b.id,
          name: b.name,
          address: b.address || '',
          org_id: b.org_id,
          org_name: context.organizations.filter(function (o) { return o.id === b.org_id; }).map(function (o) { return o.name; })[0] || ''
        });
      });
    }
    context.branches = all;
    var perBranch = await Promise.all(context.branches.map(function (b) { return listOrgSchedules(b.org_id); }));
    var merged = [];
    perBranch.forEach(function (rows) { merged = merged.concat(rows || []); });
    context.schedules = merged;
    if (!context.branches.length) context.degraded = true;
  } catch (err) {
    console.warn('[MINA] 예약 정보 조회 실패', err);
    context.degraded = true;
  }
  return context;
}

function schedulesFor(context, orgId, branchId, counselorId) {
  return (context.schedules || []).filter(function (s) {
    if (String(s.org_id) !== String(orgId)) return false;
    if (branchId && s.branch_id && String(s.branch_id) !== String(branchId)) return false;
    if (counselorId) {
      if (s.counselor_id && String(s.counselor_id) !== String(counselorId)) return false;
      if (!s.counselor_id) return false;
    }
    return true;
  });
}

export function openBookingFlow(program, options) {
  options = options || {};
  if (!state.session) {
    requireLoginSheet();
    return;
  }

  var profile = state.profile || {};
  var originalAmount = program.price_krw === null || program.price_krw === undefined ? 0 : Number(program.price_krw);
  var discount = 0;
  var couponCode = '';

  var stateModel = {
    context: null,
    branchId: profile.branch_id || '',
    counselorId: '',
    slot: '',
    slots: [],
    booked: [],
    loading: true
  };

  var content =
    '<div class="booking-summary">' +
      '<div class="booking-summary-top">' +
        '<span class="pill pill-gold">' + esc(program.sub_category || '') + '</span>' +
        '<strong>' + esc(program.title) + '</strong>' +
      '</div>' +
      '<div class="booking-summary-meta">' +
        '<span>' + icon('clock', 15) + esc(program.duration_text || '상담 후 확정') + '</span>' +
        '<span>' + icon('wallet', 15) + esc(program.price_label || (originalAmount > 0 ? fmtKRW(originalAmount) : '상담 확정')) + '</span>' +
      '</div>' +
    '</div>' +
    '<div id="bk-place" class="bk-place">' + loadingBlock('지점 · 운영시간을 불러오는 중') + '</div>' +
    '<div class="form-row">' +
      '<label class="field"><span class="field-label">예약 날짜</span>' +
        '<input type="date" id="bk-date" value="' + defaultDate() + '" min="' + minDate() + '" max="' + maxDate() + '"></label>' +
    '</div>' +
    '<div class="field"><span class="field-label">예약 시간 <span class="field-sub">운영 시간대 중 선택</span></span>' +
      '<div id="bk-slots">' + loadingBlock('예약 가능 시간을 확인하는 중') + '</div></div>' +
    '<div class="form-grid">' +
      '<label class="field"><span class="field-label">예약자 이름</span>' +
        '<input type="text" id="bk-name" value="' + esc(profile.full_name || '') + '" placeholder="이름" autocomplete="name"></label>' +
      '<label class="field"><span class="field-label">연락처</span>' +
        '<input type="tel" id="bk-phone" value="' + esc(profile.phone || '') + '" placeholder="010-0000-0000" autocomplete="tel"></label>' +
    '</div>' +
    '<label class="field"><span class="field-label">관심 고민 · 요청 사항 (선택)</span>' +
      '<textarea id="bk-note" rows="2" placeholder="' + COUNSEL_NOTE_PLACEHOLDER + '"></textarea></label>' +
    '<div class="field"><span class="field-label">결제 수단</span>' +
      '<div class="chip-radio-group">' +
        '<label class="chip-radio"><input type="radio" name="pay-method" value="bank_transfer" checked><span>무통장 입금</span></label>' +
        '<label class="chip-radio"><input type="radio" name="pay-method" value="onsite"><span>현장 결제</span></label>' +
        '<label class="chip-radio"><input type="radio" name="pay-method" value="pg_integration_required"><span>카드(PG) 연동 대기</span></label>' +
      '</div>' +
      '<p class="field-hint">온라인 카드결제는 PG 가맹점 키 연동 후 활성화됩니다. 현재는 무통장 입금 또는 현장 결제로 접수됩니다.</p>' +
    '</div>' +
    (originalAmount > 0
      ? '<div class="field"><span class="field-label">쿠폰 코드</span>' +
        '<div class="input-inline"><input type="text" id="bk-coupon" placeholder="예: MINAWELCOME" autocomplete="off">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="bk-apply">적용</button></div>' +
        '<p class="field-hint" id="bk-coupon-msg">보유 쿠폰 코드를 입력하면 할인이 적용됩니다.</p></div>'
      : noticeBox('가격 미확정 상품입니다. 예약 접수 후 상담에서 금액을 확정하며, 이 단계에서는 결제가 발생하지 않습니다.', 'neutral')) +
    '<div class="pay-box">' +
      '<div class="pay-line"><span>결제 금액</span><strong id="bk-amount">' + (originalAmount > 0 ? fmtKRW(originalAmount) : '상담 후 확정') + '</strong></div>' +
      '<p class="pay-note">' + icon('info', 15) + ' 온라인 카드결제(PG) 연동 대기 상태입니다. 예약은 접수되며 입금/현장 확인으로 진행됩니다.</p>' +
      '<p class="pay-note">' + icon('sparkle', 15) + ' 결제 완료 시 뉴로피드백 이용권은 DB 트리거가 자동 등록하며, 환불 시 잔여 회차 기준으로 만료 처리됩니다.</p>' +
    '</div>';

  var footer = '<button type="button" class="btn btn-ghost" data-cancel>취소</button>' +
    '<button type="button" class="btn btn-primary btn-grow" id="bk-submit">예약 접수하기</button>';

  var sheet = openSheet({
    title: '예약하기',
    subtitle: program.title,
    content: content,
    footer: footer,
    onMount: function (el) {
      var amountEl = el.querySelector('#bk-amount');
      var placeEl = el.querySelector('#bk-place');
      var slotsEl = el.querySelector('#bk-slots');
      var dateEl = el.querySelector('#bk-date');
      var submitBtn = el.querySelector('#bk-submit');

      function selectedBranch() {
        for (var i = 0; i < (stateModel.context ? stateModel.context.branches.length : 0); i++) {
          if (stateModel.context.branches[i].id === stateModel.branchId) return stateModel.context.branches[i];
        }
        return null;
      }

      function renderPlace() {
        var context = stateModel.context;
        if (!context) { placeEl.innerHTML = noticeBox('지점 정보를 불러오지 못했습니다.', 'warn'); return; }
        if (context.degraded || !context.branches.length) {
          placeEl.innerHTML = noticeBox('운영 중인 지점 정보를 불러오지 못했습니다. 예약 접수는 가능하며, 담당자가 일정을 확인해 연락드립니다.', 'warn');
          return;
        }
        var branchOptions = context.branches.map(function (b) {
          var label = (b.org_name ? b.org_name + ' · ' : '') + b.name;
          return '<option value="' + esc(b.id) + '"' + (b.id === stateModel.branchId ? ' selected' : '') + '>' + esc(label) + '</option>';
        }).join('');
        var branch = selectedBranch();
        placeEl.innerHTML =
          '<div class="form-grid">' +
            '<label class="field"><span class="field-label">지점 선택</span>' +
              '<select id="bk-branch">' + branchOptions + '</select>' +
              (branch && branch.address ? '<span class="field-hint">' + esc(branch.address) + '</span>' : '') +
            '</label>' +
            '<label class="field"><span class="field-label">담당자 (선택)</span>' +
              '<select id="bk-counselor"><option value="">지정 안 함</option></select>' +
              '<span class="field-hint" id="bk-counselor-hint">담당자 미지정 시 지점에서 배정합니다.</span>' +
            '</label>' +
          '</div>';

        var branchSelect = placeEl.querySelector('#bk-branch');
        if (branchSelect) {
          branchSelect.addEventListener('change', function () {
            stateModel.branchId = this.value;
            stateModel.counselorId = '';
            var b = selectedBranch();
            if (b) {
              var addr = placeEl.querySelector('#bk-branch + .field-hint');
              if (addr) addr.textContent = b.address || '';
            }
            loadCounselors(el, b, function () { refreshSlots(); });
          });
        }
        loadCounselors(el, branch, function () { refreshSlots(); });
      }

      async function loadCounselors(el, branch, done) {
        var select = el.querySelector('#bk-counselor');
        var hint = el.querySelector('#bk-counselor-hint');
        if (!select || !branch) { if (typeof done === 'function') done(); return; }
        try {
          var profiles = await listProfiles();
          var staff = (profiles || []).filter(function (p) {
            return String(p.org_id || '') === String(branch.org_id) &&
              (p.role === 'counselor' || p.role === 'staff' || p.role === 'partner_admin') &&
              p.status !== 'withdrawn';
          });
          if (!staff.length) {
            select.innerHTML = '<option value="">지정 안 함</option>';
            select.disabled = true;
            if (hint) hint.textContent = '담당자 지정은 기관 소속 회원만 선택할 수 있습니다. 지점에서 배정합니다.';
          } else {
            select.innerHTML = '<option value="">지정 안 함</option>' + staff.map(function (p) {
              return '<option value="' + esc(p.id) + '">' + esc((p.full_name || p.email || '담당자') + (p.staff_role ? ' · ' + p.staff_role : '')) + '</option>';
            }).join('');
            select.addEventListener('change', function () {
              stateModel.counselorId = this.value;
              refreshSlots();
            });
          }
        } catch (err) {
          select.innerHTML = '<option value="">지정 안 함</option>';
          select.disabled = true;
          if (hint) hint.textContent = '담당자 목록을 불러오지 못했습니다. 지점에서 배정합니다.';
        }
        if (typeof done === 'function') done();
      }

      function renderSlots(message, tone) {
        if (message) {
          slotsEl.innerHTML = noticeBox(message, tone || 'warn');
          return;
        }
        if (!stateModel.slots.length) {
          slotsEl.innerHTML = noticeBox('선택한 날짜는 이 지점의 운영일이 아닙니다. 다른 날짜를 선택해 주세요.', 'warn');
          return;
        }
        var openWeekdays = [];
        (stateModel.context.schedules || []).forEach(function (s) {
          if (String(s.org_id) !== String(selectedBranch() ? selectedBranch().org_id : '')) return;
          if (s.is_active === false) return;
          if (stateModel.branchId && s.branch_id && String(s.branch_id) !== String(stateModel.branchId)) return;
          if (openWeekdays.indexOf(Number(s.weekday)) < 0) openWeekdays.push(Number(s.weekday));
        });
        var chips = stateModel.slots.map(function (time) {
          var taken = stateModel.booked.indexOf(time) >= 0;
          return '<label class="chip-radio' + (taken ? ' is-disabled' : '') + '">' +
            '<input type="radio" name="slot" value="' + esc(time) + '"' +
              (taken ? ' disabled' : '') + (stateModel.slot === time && !taken ? ' checked' : '') + '>' +
            '<span>' + esc(time) + (taken ? ' <em>예약됨</em>' : '') + '</span></label>';
        }).join('');
        slotsEl.innerHTML =
          '<div class="chip-radio-group">' + chips + '</div>' +
          '<p class="field-hint">' +
            (openWeekdays.length
              ? '운영일: ' + openWeekdays.sort().map(function (w) { return WEEKDAY_NAMES[w]; }).join('·') + '요일 · 예약된 시간대는 선택할 수 없습니다.'
              : '예약된 시간대는 선택할 수 없습니다.') +
          '</p>';
        var inputs = slotsEl.querySelectorAll('input[name="slot"]');
        for (var i = 0; i < inputs.length; i++) {
          inputs[i].addEventListener('change', function () { stateModel.slot = this.value; });
        }
      }

      async function refreshSlots() {
        if (!stateModel.context) {
          renderSlots('운영 시간 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.');
          return;
        }
        var branch = selectedBranch();
        var date = dateEl.value;
        if (!branch) {
          renderSlots('지점을 선택해 주세요.');
          return;
        }
        var scheduleRows = schedulesFor(stateModel.context, branch.org_id, stateModel.branchId, stateModel.counselorId);
        var weekday = weekdayOf(date);
        var slots = buildSlotsFromSchedules(scheduleRows, weekday);
        if (!slots.length && !scheduleRows.length) {
          /* 운영시간 데이터가 없을 때(마이그레이션 전) 기본 시간대로 안내 */
          slots = CONFIG.BOOKING_SLOT_TIMES.slice();
        }
        stateModel.slots = slots;
        if (stateModel.slot && slots.indexOf(stateModel.slot) < 0) stateModel.slot = '';
        renderSlots(slots.length ? '' : '선택한 날짜는 운영일이 아닙니다.');
        try {
          stateModel.booked = await getBookedSlots(date, stateModel.branchId, stateModel.counselorId || null);
        } catch (err) {
          stateModel.booked = [];
          console.warn('[MINA] 예약 시간 조회 실패', err);
        }
        renderSlots(slots.length ? '' : '선택한 날짜는 운영일이 아닙니다.');
      }

      function refreshAmount() {
        if (!amountEl) return;
        if (!originalAmount) { amountEl.textContent = '상담 후 확정'; return; }
        var final = Math.max(0, originalAmount - discount);
        amountEl.innerHTML = (discount > 0
          ? '<span class="amount-strike">' + fmtKRW(originalAmount) + '</span> ' + fmtKRW(final)
          : fmtKRW(final));
      }

      var applyBtn = el.querySelector('#bk-apply');
      if (applyBtn) {
        applyBtn.addEventListener('click', async function () {
          var code = el.querySelector('#bk-coupon').value.trim();
          var couponMsg = el.querySelector('#bk-coupon-msg');
          if (!code) { toast('쿠폰 코드를 입력해 주세요.'); return; }
          setBusy(applyBtn, true, '확인');
          try {
            var result = await validateCoupon(code, originalAmount);
            if (result.ok) {
              discount = result.discount;
              couponCode = String(result.coupon.code);
              if (couponMsg) couponMsg.innerHTML = '<span class="ok-text">' + esc(result.message) + '</span>';
              toast(result.message, 'success');
            } else {
              discount = 0;
              couponCode = '';
              if (couponMsg) couponMsg.innerHTML = '<span class="err-text">' + esc(result.message) + '</span>';
            }
            refreshAmount();
          } catch (err) {
            toast(friendlyError(err), 'error');
          } finally {
            setBusy(applyBtn, false);
          }
        });
      }

      var cancel = el.querySelector('[data-cancel]');
      if (cancel) cancel.addEventListener('click', function () { closeSheet(); });

      dateEl.addEventListener('change', refreshSlots);

      /* 최초 로딩 */
      loadBookingContext().then(function (context) {
        stateModel.context = context;
        if (!stateModel.branchId && context.branches.length) stateModel.branchId = context.branches[0].id;
        if (profile.org_id) {
          var mine = context.branches.filter(function (b) { return String(b.org_id) === String(profile.org_id); });
          if (mine.length && !profile.branch_id) stateModel.branchId = mine[0].id;
        }
        renderPlace();
      });

      submitBtn.addEventListener('click', async function () {
        var date = dateEl.value;
        var name = el.querySelector('#bk-name').value.trim();
        var phone = el.querySelector('#bk-phone').value.trim();
        var note = el.querySelector('#bk-note').value.trim();

        if (!date) { toast('예약 날짜를 선택해 주세요.'); return; }
        if (!stateModel.slot) { toast('예약 시간을 선택해 주세요.'); return; }
        if (!name) { toast('예약자 이름을 입력해 주세요.'); return; }
        if (!/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(phone.replace(/\s/g, ''))) {
          toast('연락처를 정확히 입력해 주세요. (예: 010-1234-5678)');
          return;
        }

        setBusy(submitBtn, true, '접수 중');
        try {
          /* 제출 직전 최신 예약 시간대 재확인 (다른 사람이 먼저 예약한 경우 차단) */
          var fresh = await getBookedSlots(date, stateModel.branchId, stateModel.counselorId || null);
          if (fresh.indexOf(stateModel.slot) >= 0) {
            stateModel.booked = fresh;
            renderSlots('');
            toast('방금 다른 회원이 예약한 시간대입니다. 다른 시간을 선택해 주세요.', 'error');
            setBusy(submitBtn, false);
            return;
          }

          var methodEl = el.querySelector('input[name="pay-method"]:checked');
          var finalAmount = Math.max(0, originalAmount - discount);
          var branch = selectedBranch();
          var counselorEl = el.querySelector('#bk-counselor');
          var counselorId = stateModel.counselorId || null;
          var counselorName = '';
          if (counselorEl && counselorId) {
            var opt = counselorEl.options[counselorEl.selectedIndex];
            counselorName = opt ? opt.textContent : '';
          }
          var booking = await createBooking({
            payment_method: methodEl ? methodEl.value : 'bank_transfer',
            program_id: program.id,
            program_title: program.title,
            preferred_date: date,
            preferred_time: stateModel.slot,
            booker_name: name,
            booker_phone: phone,
            note: note,
            coupon_code: couponCode || null,
            original_amount: originalAmount,
            discount_amount: discount,
            final_amount: finalAmount,
            org_id: branch ? branch.org_id : null,
            branch_id: branch ? branch.id : null,
            branch_name: branch ? branch.name : '',
            counselor_id: counselorId,
            counselor_name: counselorName
          });
          track('booking_submit', { program_id: program.id, value: finalAmount, currency: 'KRW' });
          closeSheet();
          showBookingSuccess(booking, program, options);
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submitBtn, false);
        }
      });
    }
  });

  return sheet;
}

export function showBookingSuccess(booking, program, options) {
  options = options || {};
  var shortId = String(booking.id || '').slice(0, 8).toUpperCase();
  var content =
    '<div class="success-mark">' + icon('check', 30) + '</div>' +
    '<h3 class="success-title">예약이 접수되었습니다</h3>' +
    '<p class="success-sub">예약 번호 <strong>' + esc(shortId) + '</strong></p>' +
    '<div class="summary-list">' +
      '<div class="summary-row"><span>프로그램</span><strong>' + esc(booking.program_title || program.title) + '</strong></div>' +
      '<div class="summary-row"><span>일시</span><strong>' + fmtDate(booking.preferred_date) + ' ' + esc(booking.preferred_time) + '</strong></div>' +
      (booking.branch_name ? '<div class="summary-row"><span>지점</span><strong>' + esc(booking.branch_name) + '</strong></div>' : '') +
      (booking.counselor_name ? '<div class="summary-row"><span>담당자</span><strong>' + esc(booking.counselor_name) + '</strong></div>' : '') +
      '<div class="summary-row"><span>금액</span><strong>' + (Number(booking.final_amount) > 0 ? fmtKRW(booking.final_amount) : '상담 후 확정') + '</strong></div>' +
      '<div class="summary-row"><span>예약 상태</span><strong>' + esc(BOOKING_STATUS[booking.status] || '예약 대기') + '</strong></div>' +
      '<div class="summary-row"><span>결제 상태</span><strong>' + esc(BOOKING_PAYMENT_STATUS[booking.payment_status] || '결제 모듈 연동 대기') + '</strong></div>' +
    '</div>' +
    noticeBox('<strong>결제 모듈 연동 대기 · 예약 접수</strong> 상태입니다. 온라인 카드결제는 PG 키 연동 후 활성화되며, 현재는 계좌 입금 또는 현장 확인으로 진행됩니다.', 'warn') +
    noticeBox('결제 완료 처리 시 뉴로피드백 이용권이 자동 등록되고, 환불 시 잔여 회차 기준으로 이용권이 만료 처리됩니다. 알림은 앱 내 알림함에 저장됩니다.', 'neutral');

  openSheet({
    title: '예약 접수 완료',
    content: content,
    footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
      '<button type="button" class="btn btn-primary btn-grow" data-mine>내 예약 보기</button>',
    onMount: function (el) {
      var closeBtn = el.querySelector('[data-close]');
      if (closeBtn) closeBtn.addEventListener('click', function () { closeSheet(); });
      var mineBtn = el.querySelector('[data-mine]');
      if (mineBtn) mineBtn.addEventListener('click', function () {
        closeSheet();
        if (typeof options.onDone === 'function') options.onDone(booking);
        else go('/brain-check');
      });
    }
  });
}

export function openBookingEdit(booking, onDone) {
  var slotTimes = CONFIG.BOOKING_SLOT_TIMES;
  var content =
    '<div class="booking-summary">' +
      '<strong>' + esc(booking.program_title) + '</strong>' +
      '<p class="muted small">현재: ' + fmtDate(booking.preferred_date) + ' ' + esc(booking.preferred_time) + '</p>' +
    '</div>' +
    '<label class="field"><span class="field-label">변경할 날짜</span>' +
      '<input type="date" id="ed-date" value="' + esc(booking.preferred_date) + '" min="' + minDate() + '" max="' + maxDate() + '"></label>' +
    '<div class="field"><span class="field-label">변경할 시간</span><div class="chip-radio-group" id="ed-slots">' +
      slotTimes.map(function (time) {
        return '<label class="chip-radio"><input type="radio" name="ed-slot" value="' + time + '"' +
          (time === booking.preferred_time ? ' checked' : '') + '><span>' + time + '</span></label>';
      }).join('') +
    '</div><p class="field-hint" id="ed-slot-hint">이미 예약된 시간대는 저장 시 안내됩니다.</p></div>' +
    '<label class="field"><span class="field-label">요청 사항</span>' +
      '<textarea id="ed-note" rows="2">' + esc(booking.note || '') + '</textarea></label>' +
    noticeBox('일정 변경 후 예약 상태는 다시 <strong>예약 대기</strong>로 접수됩니다. 담당자가 확인 후 확정합니다.', 'neutral');

  openSheet({
    title: '예약 변경',
    subtitle: booking.program_title,
    content: content,
    footer: '<button type="button" class="btn btn-ghost" data-cancel>닫기</button>' +
      '<button type="button" class="btn btn-primary btn-grow" id="ed-save">변경 저장</button>',
    onMount: async function (el) {
      var dateEl = el.querySelector('#ed-date');
      var hints = el.querySelector('#ed-slot-hint');

      async function markBooked() {
        try {
          var booked = await getBookedSlots(dateEl.value, booking.branch_id, booking.counselor_id);
          var inputs = el.querySelectorAll('input[name="ed-slot"]');
          var count = 0;
          for (var i = 0; i < inputs.length; i++) {
            var isTaken = booked.indexOf(inputs[i].value) >= 0;
            inputs[i].disabled = isTaken;
            inputs[i].parentNode.classList.toggle('is-disabled', isTaken);
            if (isTaken) {
              count++;
              if (inputs[i].checked) inputs[i].checked = false;
            }
          }
          if (hints) hints.textContent = count ? count + '개 시간대가 이미 예약되어 선택할 수 없습니다.' : '모든 시간대를 선택할 수 있습니다.';
        } catch (err) {
          console.warn(err);
        }
      }
      dateEl.addEventListener('change', markBooked);
      markBooked();

      var cancel = el.querySelector('[data-cancel]');
      if (cancel) cancel.addEventListener('click', function () { closeSheet(); });
      var save = el.querySelector('#ed-save');
      save.addEventListener('click', async function () {
        var date = el.querySelector('#ed-date').value;
        var slotEl = el.querySelector('input[name="ed-slot"]:checked');
        var note = el.querySelector('#ed-note').value.trim();
        if (!date || !slotEl) { toast('날짜와 시간을 선택해 주세요.'); return; }
        setBusy(save, true, '저장 중');
        try {
          await updateBooking(booking.id, {
            preferred_date: date,
            preferred_time: slotEl.value,
            note: note,
            status: 'pending'
          });
          toast('예약 일정이 변경되었습니다.', 'success');
          closeSheet();
          if (typeof onDone === 'function') onDone();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(save, false);
        }
      });
    }
  });
}

/* ------------------------------------------------- 예약 목록 공용 블록 */
export function bookingItemHtml(booking) {
  var editable = booking.status === 'pending' || booking.status === 'confirmed';
  var amountText = Number(booking.final_amount) > 0 ? fmtKRW(booking.final_amount) : '상담 후 확정';
  var discountLine = Number(booking.discount_amount) > 0
    ? '<span class="list-discount">쿠폰 ' + fmtKRW(booking.discount_amount) + ' 할인</span>' : '';
  return '<div class="list-card" data-booking-id="' + esc(booking.id) + '">' +
    '<div class="list-top">' +
      '<strong>' + esc(booking.program_title) + '</strong>' +
      '<span class="badge badge-' + bookingStatusTone(booking.status) + '">' + esc(BOOKING_STATUS[booking.status] || booking.status) + '</span>' +
    '</div>' +
    '<div class="list-meta">' +
      '<span>' + icon('calendar', 15) + fmtDate(booking.preferred_date) + ' ' + esc(booking.preferred_time) + '</span>' +
      '<span>' + icon('wallet', 15) + amountText + '</span>' +
      discountLine +
    '</div>' +
    (booking.branch_name ? '<div class="list-meta"><span>' + icon('pin', 15) + esc(booking.branch_name) + (booking.counselor_name ? ' · ' + esc(booking.counselor_name) : '') + '</span></div>' : '') +
    (booking.note ? '<p class="list-note">' + esc(booking.note) + '</p>' : '') +
    '<div class="list-actions">' +
      '<span class="badge badge-' + paymentStatusTone(booking.payment_status) + '">' + esc(BOOKING_PAYMENT_STATUS[booking.payment_status] || '결제 연동 대기') + '</span>' +
      (editable
        ? '<span class="action-spacer"></span>' +
          '<button type="button" class="btn btn-ghost btn-xs" data-act="edit">일정 변경</button>' +
          '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-act="cancel">예약 취소</button>'
        : '') +
    '</div>' +
  '</div>';
}

export function bindBookingActions(scope, onChange) {
  if (!scope) return;
  var buttons = scope.querySelectorAll('[data-act]');
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].addEventListener('click', async function () {
      var card = this.closest('[data-booking-id]');
      if (!card) return;
      var id = card.getAttribute('data-booking-id');
      var bookings = await listBookings();
      var booking = null;
      for (var k = 0; k < bookings.length; k++) {
        if (String(bookings[k].id) === String(id)) booking = bookings[k];
      }
      if (!booking) return;
      if (this.getAttribute('data-act') === 'edit') {
        openBookingEdit(booking, onChange);
        return;
      }
      var ok = await confirmDialog({
        title: '예약을 취소할까요?',
        message: fmtDate(booking.preferred_date) + ' ' + booking.preferred_time + ' · ' + booking.program_title + ' 예약이 취소됩니다. 결제 완료 건은 환불 규정(미사용 잔여 회차 기준)에 따라 처리됩니다.',
        confirmLabel: '예약 취소',
        cancelLabel: '유지'
      });
      if (!ok) return;
      try {
        await cancelBooking(booking.id);
        toast('예약이 취소되었습니다.', 'success');
        if (typeof onChange === 'function') onChange();
      } catch (err) {
        toast(friendlyError(err), 'error');
      }
    });
  }
}

/* ------------------------------------------- 관리자 직접 예약 등록 모달 */
export async function openAdminBookingModal(options) {
  options = options || {};
  var context = await loadBookingContext();
  var profiles = [];
  var programs = [];
  try {
    profiles = await listProfiles();
  } catch (err) { console.warn(err); }
  try {
    programs = await listAllPrograms();
  } catch (err) { console.warn(err); }

  var memberOptions = '<option value="">회원 선택</option>' + (profiles || []).filter(function (p) {
    return p.status !== 'withdrawn';
  }).map(function (p) {
    return '<option value="' + esc(p.id) + '">' + esc((p.full_name || '(이름 없음)') + ' · ' + (p.email || '')) + '</option>';
  }).join('');

  var programOptions = (programs || []).map(function (p) {
    return '<option value="' + esc(p.id) + '" data-price="' + (p.price_krw === null || p.price_krw === undefined ? '' : p.price_krw) + '">' +
      esc(p.title) + '</option>';
  }).join('');

  var branchOptions = (context.branches || []).map(function (b) {
    return '<option value="' + esc(b.id) + '">' + esc((b.org_name ? b.org_name + ' · ' : '') + b.name) + '</option>';
  }).join('');

  var content =
    '<div class="form-grid">' +
      '<label class="field"><span class="field-label">회원</span><select id="ab-user">' + memberOptions + '</select></label>' +
      '<label class="field"><span class="field-label">프로그램</span><select id="ab-program">' + programOptions + '</select></label>' +
    '</div>' +
    '<div class="form-grid">' +
      '<label class="field"><span class="field-label">지점</span><select id="ab-branch">' + (branchOptions || '<option value="">지점 없음</option>') + '</select></label>' +
      '<label class="field"><span class="field-label">예약 상태</span><select id="ab-status">' +
        '<option value="confirmed">예약 확정</option><option value="pending">예약 대기</option>' +
      '</select></label>' +
    '</div>' +
    '<div class="form-grid">' +
      '<label class="field"><span class="field-label">날짜</span><input type="date" id="ab-date" value="' + defaultDate() + '" min="' + minDate() + '" max="' + maxDate() + '"></label>' +
      '<label class="field"><span class="field-label">시간</span><input type="time" id="ab-time" value="10:00" step="600"></label>' +
    '</div>' +
    '<div class="form-grid">' +
      '<label class="field"><span class="field-label">결제 금액 (원)</span><input type="number" id="ab-amount" min="0" placeholder="0"></label>' +
      '<label class="field"><span class="field-label">결제 상태</span><select id="ab-pay">' +
        '<option value="pending_pg">결제 모듈 연동 대기</option><option value="bank_transfer">무통장 입금 대기</option>' +
        '<option value="paid">결제 완료</option><option value="refunded">환불 완료</option>' +
      '</select></label>' +
    '</div>' +
    '<label class="field"><span class="field-label">메모</span><input type="text" id="ab-note" placeholder="전화 예약 · 요청 사항"></label>' +
    noticeBox('관리자 직접 등록도 동일한 중복 방지 규칙(지점·담당자·날짜·시간)이 적용됩니다.', 'neutral');

  openSheet({
    title: '관리자 예약 등록',
    subtitle: '전화·방문 접수 예약을 대신 등록합니다',
    wide: true,
    content: content,
    footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
      '<button type="button" class="btn btn-primary btn-grow" id="ab-submit">예약 등록</button>',
    onMount: function (el) {
      var programEl = el.querySelector('#ab-program');
      var amountEl = el.querySelector('#ab-amount');
      programEl.addEventListener('change', function () {
        var opt = this.options[this.selectedIndex];
        var price = opt ? opt.getAttribute('data-price') : '';
        amountEl.value = price || '';
      });

      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });

      var submit = el.querySelector('#ab-submit');
      submit.addEventListener('click', async function () {
        var userId = el.querySelector('#ab-user').value;
        var programId = programEl.value;
        var date = el.querySelector('#ab-date').value;
        var time = el.querySelector('#ab-time').value;
        if (!userId) { toast('회원을 선택해 주세요.'); return; }
        if (!programId) { toast('프로그램을 선택해 주세요.'); return; }
        if (!date || !time) { toast('날짜와 시간을 입력해 주세요.'); return; }
        var program = null;
        for (var i = 0; i < programs.length; i++) if (programs[i].id === programId) program = programs[i];
        var branch = null;
        for (var b = 0; b < (context.branches || []).length; b++) if (context.branches[b].id === el.querySelector('#ab-branch').value) branch = context.branches[b];
        var memberProfile = null;
        for (var p = 0; p < profiles.length; p++) if (String(profiles[p].id) === String(userId)) memberProfile = profiles[p];

        setBusy(submit, true, '등록 중');
        try {
          var payStatus = el.querySelector('#ab-pay').value;
          var booking = await createBooking({
            user_id: userId,
            payment_method: payStatus === 'bank_transfer' ? 'bank_transfer' : 'onsite',
            status: el.querySelector('#ab-status').value,
            program_id: programId,
            program_title: program ? program.title : '',
            preferred_date: date,
            preferred_time: time.length === 5 ? time : time.slice(0, 5),
            booker_name: memberProfile ? memberProfile.full_name : '',
            booker_phone: memberProfile ? memberProfile.phone : '',
            note: el.querySelector('#ab-note').value.trim(),
            original_amount: Number(amountEl.value) || 0,
            discount_amount: 0,
            final_amount: Number(amountEl.value) || 0,
            org_id: branch ? branch.org_id : null,
            branch_id: branch ? branch.id : null,
            branch_name: branch ? branch.name : ''
          });
          await logAudit({
            action: 'booking_created_admin',
            target_table: 'bookings',
            target_id: booking.id,
            detail: { user_id: userId, date: date, time: time, program_id: programId }
          });
          toast('예약이 등록되었습니다.', 'success');
          closeSheet();
          if (typeof options.onDone === 'function') options.onDone(booking);
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });
    }
  });
}
