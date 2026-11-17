/* 예약 플로우 (BRAIN CHECK · NEURO TRAINING · 프로그램 공용) */
import { CONFIG, BOOKING_STATUS, BOOKING_PAYMENT_STATUS } from './config.js';
import { state, createBooking, updateBooking, cancelBooking, listBookings, validateCoupon, friendlyError } from './store.js';
import { esc, fmtKRW, fmtDate, icon, toast, openSheet, closeSheet, noticeBox, setBusy, go, track, confirmDialog, bookingStatusTone, paymentStatusTone } from './ui.js';

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

  var timeChips = CONFIG.BOOKING_SLOT_TIMES.map(function (time) {
    return '<label class="chip-radio"><input type="radio" name="slot" value="' + time + '"' +
      (time === '10:00' ? ' checked' : '') + '><span>' + time + '</span></label>';
  }).join('');

  var content =
    '<div class="booking-summary">' +
      '<div class="booking-summary-top">' +
        '<span class="pill pill-navy">' + esc(program.sub_category || '') + '</span>' +
        (program.name ? '' : '') +
        '<strong>' + esc(program.title) + '</strong>' +
      '</div>' +
      '<div class="booking-summary-meta">' +
        '<span>' + icon('clock', 15) + esc(program.duration_text || '상담 후 확정') + '</span>' +
        '<span>' + icon('wallet', 15) + esc(program.price_krw ? fmtKRW(originalAmount) : (program.price_label || '상담 확정')) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="form-row">' +
      '<label class="field"><span class="field-label">예약 날짜</span>' +
        '<input type="date" id="bk-date" value="' + defaultDate() + '" min="' + minDate() + '" max="' + maxDate() + '"></label>' +
    '</div>' +
    '<div class="field"><span class="field-label">예약 시간</span><div class="chip-radio-group">' + timeChips + '</div></div>' +
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
      var couponInput = el.querySelector('#bk-coupon');
      var couponMsg = el.querySelector('#bk-coupon-msg');
      var applyBtn = el.querySelector('#bk-apply');
      var submitBtn = el.querySelector('#bk-submit');

      function refreshAmount() {
        if (!amountEl) return;
        if (!originalAmount) { amountEl.textContent = '상담 후 확정'; return; }
        var final = Math.max(0, originalAmount - discount);
        amountEl.innerHTML = (discount > 0
          ? '<span class="amount-strike">' + fmtKRW(originalAmount) + '</span> ' + fmtKRW(final)
          : fmtKRW(final));
      }

      if (applyBtn) {
        applyBtn.addEventListener('click', async function () {
          var code = couponInput.value.trim();
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

      submitBtn.addEventListener('click', async function () {
        var date = el.querySelector('#bk-date').value;
        var slotEl = el.querySelector('input[name="slot"]:checked');
        var name = el.querySelector('#bk-name').value.trim();
        var phone = el.querySelector('#bk-phone').value.trim();
        var note = el.querySelector('#bk-note').value.trim();

        if (!date) { toast('예약 날짜를 선택해 주세요.'); return; }
        if (!slotEl) { toast('예약 시간을 선택해 주세요.'); return; }
        if (!name) { toast('예약자 이름을 입력해 주세요.'); return; }
        if (!/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(phone.replace(/\s/g, ''))) {
          toast('연락처를 정확히 입력해 주세요. (예: 010-1234-5678)');
          return;
        }

        setBusy(submitBtn, true, '접수 중');
        try {
          var mine = await listBookings();
          var duplicated = mine.filter(function (b) {
            return b.preferred_date === date && b.preferred_time === slotEl.value &&
              (b.status === 'pending' || b.status === 'confirmed');
          });
          if (duplicated.length) {
            toast('이미 같은 시간에 접수된 예약이 있습니다.', 'error');
            setBusy(submitBtn, false);
            return;
          }

          var methodEl = el.querySelector('input[name="pay-method"]:checked');
          var finalAmount = Math.max(0, originalAmount - discount);
          var booking = await createBooking({
            payment_method: methodEl ? methodEl.value : 'bank_transfer',
            program_id: program.id,
            program_title: program.title,
            preferred_date: date,
            preferred_time: slotEl.value,
            booker_name: name,
            booker_phone: phone,
            note: note,
            coupon_code: couponCode || null,
            original_amount: originalAmount,
            discount_amount: discount,
            final_amount: finalAmount
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
      '<div class="summary-row"><span>금액</span><strong>' + (Number(booking.final_amount) > 0 ? fmtKRW(booking.final_amount) : '상담 후 확정') + '</strong></div>' +
      '<div class="summary-row"><span>예약 상태</span><strong>' + esc(BOOKING_STATUS[booking.status] || '예약 대기') + '</strong></div>' +
      '<div class="summary-row"><span>결제 상태</span><strong>' + esc(BOOKING_PAYMENT_STATUS[booking.payment_status] || '결제 모듈 연동 대기') + '</strong></div>' +
      '<div class="summary-row"><span>결제 수단</span><strong>' + (booking.payment_status === 'bank_transfer' ? '무통장 입금' : '현장 결제 / PG 연동 대기') + '</strong></div>' +
    '</div>' +
    noticeBox('<strong>결제 모듈 연동 대기 · 예약 접수</strong> 상태입니다. 온라인 카드결제는 PG 키 연동 후 활성화되며, 현재는 계좌 입금 또는 현장 확인으로 진행됩니다.', 'warn') +
    noticeBox('알림은 <strong>앱 내 알림함에 저장</strong>되었습니다. 카카오 알림톡·앱 푸시 발송은 외부 연동 후 활성화됩니다.', 'neutral');

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
  var content =
    '<div class="booking-summary">' +
      '<strong>' + esc(booking.program_title) + '</strong>' +
      '<p class="muted small">현재: ' + fmtDate(booking.preferred_date) + ' ' + esc(booking.preferred_time) + '</p>' +
    '</div>' +
    '<label class="field"><span class="field-label">변경할 날짜</span>' +
      '<input type="date" id="ed-date" value="' + esc(booking.preferred_date) + '" min="' + minDate() + '" max="' + maxDate() + '"></label>' +
    '<div class="field"><span class="field-label">변경할 시간</span><div class="chip-radio-group">' +
      CONFIG.BOOKING_SLOT_TIMES.map(function (time) {
        return '<label class="chip-radio"><input type="radio" name="ed-slot" value="' + time + '"' +
          (time === booking.preferred_time ? ' checked' : '') + '><span>' + time + '</span></label>';
      }).join('') +
    '</div></div>' +
    '<label class="field"><span class="field-label">요청 사항</span>' +
      '<textarea id="ed-note" rows="2">' + esc(booking.note || '') + '</textarea></label>' +
    noticeBox('일정 변경 후 예약 상태는 다시 <strong>예약 대기</strong>로 접수됩니다. 담당자가 확인 후 확정합니다.', 'neutral');

  openSheet({
    title: '예약 변경',
    subtitle: booking.program_title,
    content: content,
    footer: '<button type="button" class="btn btn-ghost" data-cancel>닫기</button>' +
      '<button type="button" class="btn btn-primary btn-grow" id="ed-save">변경 저장</button>',
    onMount: function (el) {
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
        message: fmtDate(booking.preferred_date) + ' ' + booking.preferred_time + ' · ' + booking.program_title + ' 예약이 취소됩니다.',
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
