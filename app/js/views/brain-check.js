/* S02. BRAIN CHECK — 뇌파측정 서비스 소개 · 예약 · 결과 */
import { BRAND, CHECK_TYPES, BOOKING_STATUS, BOOKING_PAYMENT_STATUS } from '../config.js?v=2.0.14';
import { state, getPrograms, listResults, listBookings, getSignedResultUrl, friendlyError } from '../store.js?v=2.0.14';
import { icon, esc, fmtKRW, fmtDate, toast, emptyState, noticeBox, sectionHead, setBusy, loadingBlock } from '../ui.js?v=2.0.14';
import { openBookingFlow, bookingItemHtml, bindBookingActions } from '../booking.js?v=2.0.14';

var RESULT_ITEMS = {
  simple: [
    '집중 및 주의 상태 지표',
    '좌우 뇌 활성 균형',
    '신체적 · 정신적 스트레스',
    '행동 및 감정 성향 지표'
  ],
  full: [
    '간편검사 항목 전체 포함',
    '자기 피드백 능력 관련 지표',
    '11장 상세 결과 분석 · 1:1 상담',
    '뉴로피드백 1회 체험 포함'
  ]
};

function productCard(program) {
  var isFull = program.id === 'brain_check_full';
  var items = RESULT_ITEMS[isFull ? 'full' : 'simple'];
  return '<article class="product-card' + (isFull ? ' is-featured' : '') + '">' +
    '<div class="product-head">' +
      (program.badge ? '<span class="badge badge-' + (isFull ? 'navy' : 'yellow') + '">' + esc(program.badge) + '</span>' : '') +
      '<h3>' + esc(program.title) + '</h3>' +
      '<p class="product-sub">' + esc(program.subtitle || '') + '</p>' +
    '</div>' +
    '<ul class="tick-list">' +
      items.map(function (item) { return '<li>' + icon('check', 15) + '<span>' + esc(item) + '</span></li>'; }).join('') +
    '</ul>' +
    '<div class="product-meta">' +
      '<span>' + icon('clock', 15) + esc(program.duration_text || '상담 후 확정') + '</span>' +
      '<span>' + icon('file', 15) + (isFull ? '결과지 11장' : '결과지 2장') + '</span>' +
    '</div>' +
    '<div class="product-foot">' +
      '<div class="price"><strong>' + esc(program.price_label || fmtKRW(program.price_krw)) + '</strong>' +
        (isFull ? '<span class="muted small">뉴로피드백 1회 포함</span>' : '<span class="muted small">부가세 포함</span>') +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-sm" data-book="' + esc(program.id) + '">예약하기</button>' +
    '</div>' +
  '</article>';
}

function resultCard(result) {
  var recheckDays = null;
  if (result.next_recheck_date) {
    var diff = Math.round((new Date(result.next_recheck_date).getTime() - new Date().getTime()) / 86400000);
    recheckDays = diff;
  }

  return '<div class="result-card">' +
    '<div class="list-top">' +
      '<strong>' + esc(CHECK_TYPES[result.check_type] || result.check_type) + '</strong>' +
      '<span class="badge badge-neutral">' + fmtDate(result.measured_at) + ' 측정</span>' +
    '</div>' +
    (result.emotion_type ? '<p class="emotion-line">' + icon('sparkle', 14) + '<span>감정 성향 · <strong>' + esc(result.emotion_type) + '</strong></span></p>' : '') +
    (result.summary_note ? '<p class="list-note">' + esc(result.summary_note) + '</p>' : '') +
    (result.next_recheck_date
      ? '<div class="recheck-row' + (recheckDays !== null && recheckDays <= 30 ? ' is-soon' : '') + '">' +
          icon('calendar', 16) +
          '<span>다음 재검사 권장일 · <strong>' + fmtDate(result.next_recheck_date) + '</strong>' +
          (recheckDays !== null && recheckDays <= 30 ? ' (곧 도래)' : '') + '</span>' +
        '</div>'
      : '') +
    '<div class="list-actions">' +
      (result.file_path
        ? '<button type="button" class="btn btn-ghost btn-xs" data-download="' + esc(result.id) + '">결과지 열기 · 다운로드</button>'
        : '<span class="muted small">결과지 파일 미등록</span>') +
      '<span class="action-spacer"></span>' +
      (result.file_name ? '<span class="muted small ellipsis">' + esc(result.file_name) + '</span>' : '') +
    '</div>' +
  '</div>';
}

export async function render(ctx) {
  var programs = [];
  var results = [];
  var bookings = [];
  var loadError = '';

  try {
    programs = await getPrograms('brain_check');
    if (state.session) {
      var uid = state.session.user.id;
      var loaded = await Promise.all([listResults(uid), listBookings(uid)]);
      results = loaded[0];
      bookings = loaded[1].filter(function (b) { return String(b.program_id || '').indexOf('brain_check') === 0; });
    }
  } catch (err) {
    loadError = friendlyError(err);
  }

  var products = programs.length
    ? programs.map(productCard).join('')
    : '<p class="muted small">검사 상품 정보를 불러오는 중입니다.</p>';

  var resultsBlock;
  if (!state.session) {
    resultsBlock = emptyState({
      icon: 'lock',
      title: '로그인 후 결과를 확인할 수 있습니다',
      desc: '관리자가 등록한 검사 결과지는 회원 계정에서만 열람할 수 있습니다.',
      action: '<a class="btn btn-ghost btn-sm" href="#/account">로그인 · 회원가입</a>'
    });
  } else if (!results.length) {
    resultsBlock = emptyState({
      icon: 'file',
      title: '아직 등록된 뇌파검사 결과가 없습니다',
      desc: '측정 완료 후 담당자가 결과지를 등록하면 이곳에서 바로 확인하고 내려받을 수 있습니다.',
      action: '<button type="button" class="btn btn-ghost btn-sm" data-book="brain_check_simple">첫 검사 예약하기</button>'
    });
  } else {
    resultsBlock = results.map(resultCard).join('');
  }

  var bookingsBlock;
  if (!state.session) {
    bookingsBlock = emptyState({
      icon: 'calendar',
      title: '예약 내역은 로그인 후 확인됩니다',
      desc: '로그인하면 예약 일정 변경·취소를 직접 할 수 있습니다.',
      action: '<a class="btn btn-ghost btn-sm" href="#/account">로그인</a>'
    });
  } else if (!bookings.length) {
    bookingsBlock = emptyState({
      icon: 'calendar',
      title: '예약 내역이 없습니다',
      desc: '위 검사 상품에서 날짜와 시간을 선택해 예약해 보세요.'
    });
  } else {
    bookingsBlock = bookings.map(bookingItemHtml).join('');
  }

  var html =
    '<header class="page-head">' +
      '<span class="page-eyebrow">' + icon('pulse', 16) + ' BRAIN CHECK</span>' +
      '<h1 class="page-title">뇌파로 확인하는<br>나의 컨디션</h1>' +
      '<p class="page-desc">2채널 무선 뇌파 측정으로 집중·스트레스·균형 지표를 확인합니다. 결과는 웰니스 관리 참고 자료로 제공됩니다.</p>' +
    '</header>' +

    '<section class="section">' +
      (loadError ? noticeBox(esc(loadError), 'warn') : '') +
      '<div class="product-list">' + products + '</div>' +
    '</section>' +

    '<section class="section">' +
      noticeBox('<strong>비의료 웰니스 고지</strong><br>' + esc(BRAND.nonMedical), 'warn') +
    '</section>' +

    '<section class="section">' +
      sectionHead('내 검사 결과', results.length ? '<span class="muted small">' + results.length + '건</span>' : '') +
      resultsBlock +
    '</section>' +

    '<section class="section">' +
      sectionHead('내 예약', '<span class="muted small">변경 · 취소 가능</span>') +
      bookingsBlock +
    '</section>' +

    '<section class="section">' +
      '<div class="info-rows">' +
        '<div class="info-row">' + icon('clock', 17) + '<span><strong>진행 시간</strong> 간편 약 20~30분 · 종합 약 60분</span></div>' +
        '<div class="info-row">' + icon('info', 17) + '<span><strong>준비 사항</strong> 측정 전 카페인·격한 운동은 피해 주세요.</span></div>' +
        '<div class="info-row">' + icon('wallet', 17) + '<span><strong>결제</strong> 온라인 결제 연동 전까지 예약 접수 후 계좌 입금 또는 현장 결제로 진행됩니다.</span></div>' +
      '</div>' +
    '</section>' +

    '<footer class="app-footer"><p class="footer-note">' + esc(BRAND.nonMedical) + '</p></footer>';

  return {
    title: 'BRAIN CHECK',
    html: html,
    mount: function (el) {
      var bookButtons = el.querySelectorAll('[data-book]');
      for (var i = 0; i < bookButtons.length; i++) {
        bookButtons[i].addEventListener('click', function () {
          var id = this.getAttribute('data-book');
          var program = null;
          for (var k = 0; k < programs.length; k++) {
            if (programs[k].id === id) program = programs[k];
          }
          if (!program) { toast('상품 정보를 찾지 못했습니다.'); return; }
          openBookingFlow(program, { onDone: function () { ctx.rerender(); } });
        });
      }

      var downloadButtons = el.querySelectorAll('[data-download]');
      for (var d = 0; d < downloadButtons.length; d++) {
        downloadButtons[d].addEventListener('click', async function () {
          var id = this.getAttribute('data-download');
          var target = null;
          for (var k = 0; k < results.length; k++) {
            if (String(results[k].id) === String(id)) target = results[k];
          }
          if (!target || !target.file_path) { toast('등록된 결과지 파일이 없습니다.'); return; }
          setBusy(this, true, '여는 중');
          try {
            var url = await getSignedResultUrl(target.file_path);
            if (!url) {
              toast('결과지 열람 주소를 발급하지 못했습니다. 관리자에게 문의해 주세요.', 'error');
              setBusy(this, false);
              return;
            }
            window.open(url, '_blank', 'noopener');
            setBusy(this, false);
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(this, false);
          }
        });
      }

      bindBookingActions(el, function () { ctx.rerender(); });
    }
  };
}
