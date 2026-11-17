/* S05. MIND CARE & BRAIN WELLNESS — 10종 프로그램 */
import { BRAND } from '../config.js?v=2.0.6';
import { getPrograms, friendlyError } from '../store.js?v=2.0.6';
import { icon, esc, fmtKRW, emptyState, noticeBox, openSheet, closeSheet } from '../ui.js?v=2.0.6';
import { openBookingFlow } from '../booking.js?v=2.0.6';

var FILTERS = [
  { id: 'all', label: '전체' },
  { id: 'MIND CARE', label: 'MIND CARE' },
  { id: 'BRAIN WELLNESS', label: 'BRAIN WELLNESS' },
  { id: '생애주기별', label: '생애주기별' }
];

function programCard(program) {
  return '<article class="program-card" data-program="' + esc(program.id) + '">' +
    '<div class="program-top">' +
      '<span class="pill pill-soft">' + esc(program.sub_category || '') + '</span>' +
      (program.badge ? '<span class="badge badge-neutral">' + esc(program.badge) + '</span>' : '') +
    '</div>' +
    '<h3>' + esc(program.title) + '</h3>' +
    '<p class="program-sub">' + esc(program.subtitle || '') + '</p>' +
    '<div class="program-meta">' +
      '<span>' + icon('clock', 14) + esc(program.duration_text || '상담 후 확정') + '</span>' +
      '<span>' + icon('wallet', 14) + esc(program.price_krw ? fmtKRW(program.price_krw) : (program.price_label || '상담 확정')) + '</span>' +
    '</div>' +
    '<button type="button" class="program-link" data-detail="' + esc(program.id) + '">자세히 보기' + icon('chevronRight', 15) + '</button>' +
  '</article>';
}

function detailContent(program) {
  return '<div class="detail-hero">' +
      '<span class="pill pill-navy">' + esc(program.sub_category || '') + '</span>' +
      '<h2>' + esc(program.title) + '</h2>' +
      '<p class="muted">' + esc(program.subtitle || '') + '</p>' +
    '</div>' +
    '<div class="detail-block"><h4>프로그램 소개</h4><p>' + esc(program.description || '') + '</p></div>' +
    '<div class="detail-block"><h4>추천 대상</h4><p>' + esc(program.target_audience || '상담에서 안내드립니다.') + '</p></div>' +
    '<div class="detail-block"><h4>진행 방식</h4><p>' + esc(program.format_method || '상담에서 안내드립니다.') + '</p></div>' +
    '<div class="detail-grid">' +
      '<div class="detail-cell"><span>소요 시간</span><strong>' + esc(program.duration_text || '상담 후 확정') + '</strong></div>' +
      '<div class="detail-cell"><span>가격</span><strong>' + esc(program.price_krw ? fmtKRW(program.price_krw) : (program.price_label || '상담 확정')) + '</strong></div>' +
    '</div>' +
    noticeBox('본 프로그램은 의료기관의 진단·치료를 대체하지 않는 웰니스 프로그램입니다.', 'warn');
}

export async function render(ctx) {
  var mindCare = [];
  var wellness = [];
  var loadError = '';

  try {
    var loaded = await Promise.all([getPrograms('mind_care'), getPrograms('brain_wellness')]);
    mindCare = loaded[0];
    wellness = loaded[1];
  } catch (err) {
    loadError = friendlyError(err);
  }

  var all = mindCare.concat(wellness);
  var requested = ctx.query.get('group') || 'all';
  var activeFilter = 'all';
  for (var i = 0; i < FILTERS.length; i++) {
    if (FILTERS[i].id === requested) activeFilter = requested;
  }

  function listFor(filter) {
    if (filter === 'all') return all;
    return all.filter(function (p) { return (p.sub_category || '') === filter; });
  }

  var cards = listFor(activeFilter);

  var filterHtml = FILTERS.map(function (filter) {
    return '<button type="button" class="chip' + (filter.id === activeFilter ? ' is-on' : '') + '" data-filter="' + esc(filter.id) + '">' +
      esc(filter.label) + '</button>';
  }).join('');

  var html =
    '<header class="page-head">' +
      '<span class="page-eyebrow">' + icon('grid', 16) + ' PROGRAMS</span>' +
      '<h1 class="page-title">마인드케어 ·<br>브레인 웰니스</h1>' +
      '<p class="page-desc">스트레스·번아웃·감정·수면·집중력까지, 뇌과학 기반 10종 프로그램을 1:1로 진행합니다.</p>' +
    '</header>' +

    (loadError ? '<section class="section">' + noticeBox(esc(loadError), 'warn') + '</section>' : '') +

    '<section class="section">' +
      '<div class="chip-wrap filter-wrap" id="program-filters">' + filterHtml + '</div>' +
      '<div class="program-grid" id="program-grid">' +
        (cards.length ? cards.map(programCard).join('') : emptyState({ icon: 'grid', title: '해당 카테고리 프로그램이 없습니다', desc: '다른 카테고리를 선택해 주세요.' })) +
      '</div>' +
    '</section>' +

    '<section class="section">' +
      '<div class="info-rows">' +
        '<div class="info-row">' + icon('user', 17) + '<span><strong>1:1 진행</strong> 뇌파 점검 후 개인 상태에 맞춘 루틴으로 진행합니다.</span></div>' +
        '<div class="info-row">' + icon('wallet', 17) + '<span><strong>가격 안내</strong> 확정된 가격은 DB 설정가로 표시되며, 미확정 상품은 상담에서 확정됩니다.</span></div>' +
        '<div class="info-row">' + icon('calendar', 17) + '<span><strong>예약</strong> 상세 화면의 ‘바로 예약’에서 날짜·시간을 선택할 수 있습니다.</span></div>' +
      '</div>' +
    '</section>' +

    '<footer class="app-footer"><p class="footer-note">' + esc(BRAND.nonMedical) + '</p></footer>';

  return {
    title: '프로그램',
    html: html,
    mount: function (el) {
      function bindCards() {
        var detailButtons = el.querySelectorAll('[data-detail]');
        for (var d = 0; d < detailButtons.length; d++) {
          detailButtons[d].addEventListener('click', function () {
            var id = this.getAttribute('data-detail');
            var program = null;
            for (var k = 0; k < all.length; k++) if (all[k].id === id) program = all[k];
            if (!program) return;
            openDetail(program);
          });
        }
      }

      function openDetail(program) {
        openDetailSheet(program, ctx);
      }

      var filters = el.querySelectorAll('[data-filter]');
      for (var f = 0; f < filters.length; f++) {
        filters[f].addEventListener('click', function () {
          var filter = this.getAttribute('data-filter');
          var buttons = el.querySelectorAll('[data-filter]');
          for (var k = 0; k < buttons.length; k++) buttons[k].classList.toggle('is-on', buttons[k] === this);
          var grid = el.querySelector('#program-grid');
          var subset = listFor(filter);
          grid.innerHTML = subset.length
            ? subset.map(programCard).join('')
            : emptyState({ icon: 'grid', title: '해당 카테고리 프로그램이 없습니다', desc: '다른 카테고리를 선택해 주세요.' });
          bindCards();
        });
      }

      bindCards();

      var requestedId = ctx.query.get('id');
      if (requestedId) {
        for (var r = 0; r < all.length; r++) {
          if (all[r].id === requestedId) openDetail(all[r]);
        }
      }
    }
  };
}

function openDetailSheet(program, ctx) {
  openSheet({
      title: program.title,
      subtitle: program.subtitle || '',
      content: detailContent(program),
      footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
        '<button type="button" class="btn btn-primary btn-grow" data-book-now>바로 예약</button>',
    onMount: function (el) {
      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });
      var book = el.querySelector('[data-book-now]');
      if (book) book.addEventListener('click', function () {
        closeSheet();
        openBookingFlow(program, { onDone: function () { ctx.rerender(); } });
      });
    }
  });
}
