/* S06. MINA ACADEMY — 뇌교육상담사 전문가 과정 */
import { state, listCohorts, createEnrollment, listEnrollments, listMaterials, friendlyError } from '../store.js?v=2.0.14';
import { icon, esc, fmtDate, toast, emptyState, noticeBox, sectionHead, badge, openSheet, closeSheet, setBusy } from '../ui.js?v=2.0.14';
import { FALLBACK_ACADEMY_CURRICULUM } from '../catalog.js?v=2.0.14';
import { requireLoginSheet } from '../booking.js?v=2.0.14';

var COHORT_STATUS = { recruiting: '모집 중', ongoing: '진행 중', closed: '마감' };

function cohortCard(cohort) {
  return '<article class="cohort-card">' +
    '<div class="list-top">' +
      '<strong>' + esc(cohort.title) + '</strong>' +
      badge(COHORT_STATUS[cohort.status] || cohort.status, cohort.status === 'recruiting' ? 'green' : 'neutral') +
    '</div>' +
    '<div class="list-meta">' +
      '<span>' + icon('calendar', 15) + esc(cohort.schedule_text) + '</span>' +
      '<span>' + icon('clock', 15) + esc(cohort.hours_text) + '</span>' +
      '<span>' + icon('wallet', 15) + esc(cohort.fee_label) + '</span>' +
    '</div>' +
    (cohort.status === 'closed'
      ? '<p class="muted small">이 기수는 마감되었습니다. 다음 기수 일정을 안내받으려면 문의해 주세요.</p>'
      : '<button type="button" class="btn btn-primary btn-sm btn-block" data-enroll="' + esc(cohort.id) + '">수강 신청</button>') +
  '</article>';
}

export async function render(ctx) {
  var cohorts = [];
  var enrollments = [];
  var materials = [];
  var loadError = '';

  try {
    cohorts = await listCohorts();
    if (state.session) {
      var uid = state.session.user.id;
      var loaded = await Promise.all([listEnrollments(uid), listMaterials()]);
      enrollments = loaded[0];
      materials = loaded[1];
    }
  } catch (err) {
    loadError = friendlyError(err);
  }

  var myEnrollments = enrollments;
  var curriculum = FALLBACK_ACADEMY_CURRICULUM.map(function (item) {
    return '<div class="week-row">' +
      '<span class="week-badge">' + esc(item.week) + '</span>' +
      '<div><strong>' + esc(item.title) + '</strong><p>' + esc(item.detail) + '</p></div>' +
    '</div>';
  }).join('');

  var cohortBlock = cohorts.length
    ? cohorts.map(cohortCard).join('')
    : emptyState({ icon: 'calendar', title: '등록된 기수 일정이 없습니다', desc: '관리자가 기수 일정을 등록하면 이곳에 표시됩니다.' });

  var studentBlock;
  if (!state.session) {
    studentBlock = emptyState({
      icon: 'lock',
      title: '수강생 마이페이지는 로그인 후 열립니다',
      desc: '수강 신청 후 진도·시험 상태·교육 자료·아카데미 공지를 확인할 수 있습니다.',
      action: '<a class="btn btn-ghost btn-sm" href="#/account">로그인 · 회원가입</a>'
    });
  } else if (!myEnrollments.length) {
    studentBlock = emptyState({
      icon: 'file',
      title: '수강 신청 내역이 없습니다',
      desc: '기수 일정을 선택해 수강 신청하면 진도와 자료가 열립니다.',
      action: '<button type="button" class="btn btn-ghost btn-sm" data-scroll-cohorts>기수 일정 보기</button>'
    });
  } else {
    studentBlock = myEnrollments.map(function (enr) {
      var cohort = null;
      for (var i = 0; i < cohorts.length; i++) if (String(cohorts[i].id) === String(enr.cohort_id)) cohort = cohorts[i];
      var hours = Number(enr.progress_hours || 0);
      var percent = Math.min(100, Math.round(hours / 40 * 100));
      var examLabel = enr.exam_status === 'passed' ? '합격' : enr.exam_status === 'failed' ? '불합격' : '응시 전';
      var statusLabel = enr.status === 'enrolled' ? '수강 중' : enr.status === 'completed' ? '수료' : enr.status === 'canceled' ? '취소' : '접수 대기';
      return '<div class="student-card">' +
        '<div class="list-top"><strong>' + esc(cohort ? cohort.title : '뇌교육상담사 전문가 과정') + '</strong>' + badge(statusLabel, 'navy') + '</div>' +
        '<div class="student-progress"><div class="usage-figures"><strong>' + hours + '</strong><span>/ 40시간 이수</span></div>' +
          '<div class="progress"><span style="width:' + percent + '%"></span></div></div>' +
        '<div class="student-meta">' +
          '<span>시험 상태 · <strong>' + esc(examLabel) + '</strong></span>' +
          '<span>결제 · <strong>교육비 상담 안내</strong></span>' +
        '</div>' +
        '<div class="notice-block">' + icon('info', 16) + '<span>진도·시험 결과는 담당자가 확인 후 반영합니다.</span></div>' +
      '</div>';
    }).join('');
  }

  var materialBlock;
  if (!state.session || !myEnrollments.length) {
    materialBlock = emptyState({
      icon: 'lock',
      title: '교육 자료실은 수강생에게 열립니다',
      desc: '수강 신청이 승인되면 교육 자료(PDF·링크)와 공지를 내려받을 수 있습니다.'
    });
  } else if (!materials.length) {
    materialBlock = emptyState({
      icon: 'file',
      title: '등록된 교육 자료가 없습니다',
      desc: '아카데미 담당자가 자료를 등록하면 이곳에 표시됩니다.'
    });
  } else {
    materialBlock = materials.map(function (m) {
      return '<div class="material-row">' +
        '<span class="material-ico">' + icon(m.is_notice ? 'bell' : 'file', 18) + '</span>' +
        '<div class="material-body"><strong>' + esc(m.title) + '</strong>' +
          (m.body ? '<p class="muted small">' + esc(m.body) + '</p>' : '') +
          '<span class="muted small">' + fmtDate(m.created_at) + (m.is_notice ? ' · 공지' : '') + '</span></div>' +
        (m.file_url ? '<a class="btn btn-ghost btn-xs" href="' + esc(m.file_url) + '" target="_blank" rel="noopener">열기</a>' : '') +
      '</div>';
    }).join('');
  }

  var html =
    '<header class="page-head">' +
      '<span class="page-eyebrow">' + icon('file', 16) + ' MINA ACADEMY</span>' +
      '<h1 class="page-title">뇌교육상담사<br>전문가 과정</h1>' +
      '<p class="page-desc">뇌과학 이론부터 뇌파 데이터 리딩, 웰니스 프로그램 설계까지 — 총 40시간 · 5주 과정.</p>' +
    '</header>' +

    '<section class="section">' +
      noticeBox('<strong>민간자격 안내 (필수 고지)</strong><br>본 과정의 ‘뇌교육상담사’ 자격증은 <strong>등록 민간자격증</strong>이며, <strong>국가자격증 또는 국제공인자격증이 아닙니다.</strong> 자격의 명칭·등록번호·자격관리기관은 자격기본법에 따라 관리자 등록 후 표시됩니다.', 'warn') +
    '</section>' +

    (loadError ? '<section class="section">' + noticeBox(esc(loadError), 'warn') + '</section>' : '') +

    '<section class="section">' +
      sectionHead('과정 개요', '') +
      '<div class="overview-card">' +
        '<div class="overview-grid">' +
          '<div class="overview-cell"><span>이론 교육</span><strong>총 40시간</strong></div>' +
          '<div class="overview-cell"><span>기간</span><strong>5주 · 주 8시간</strong></div>' +
          '<div class="overview-cell"><span>방식</span><strong>오프라인 이론 + 실습</strong></div>' +
          '<div class="overview-cell"><span>수료</span><strong>시험 응시 후 자격 발급</strong></div>' +
        '</div>' +
        '<p class="muted small">뇌과학 기반 상담 이론부터 2채널 뇌파 데이터 리딩, 대상별 웰니스 프로그램 설계, 실습·슈퍼비전까지 5주 동안 40시간을 이수합니다.</p>' +
      '</div>' +
    '</section>' +

    '<section class="section">' +
      sectionHead('5주 커리큘럼', '') +
      '<div class="week-list">' + curriculum + '</div>' +
    '</section>' +

    '<section class="section">' +
      sectionHead('시험 · 자격 취득 안내', '') +
      '<div class="info-rows">' +
        '<div class="info-row">' + icon('check', 17) + '<span><strong>수료 기준</strong> 5주 40시간 이수 후 민간자격 시험 응시</span></div>' +
        '<div class="info-row">' + icon('file', 17) + '<span><strong>자격 발급</strong> 시험 합격 시 ‘뇌교육상담사(등록 민간자격)’ 명칭으로 발급</span></div>' +
        '<div class="info-row">' + icon('alert', 17) + '<span><strong>법적 고지</strong> 국가자격·국제공인자격이 아니며, 자격 기본법에 따른 등록 민간자격입니다.</span></div>' +
      '</div>' +
    '</section>' +

    '<section class="section" id="cohort-section">' +
      sectionHead('기수 일정 · 교육비', '<span class="muted small">' + cohorts.length + '개 기수</span>') +
      cohortBlock +
      noticeBox('교육비는 기수별 관리자 설정가로 표시되며, 결제 모듈 연동 전까지는 접수 후 상담으로 확정됩니다.', 'neutral') +
    '</section>' +

    '<section class="section">' +
      sectionHead('수강생 마이페이지', '<span class="muted small">진도 · 시험 · 자료</span>') +
      studentBlock +
    '</section>' +

    '<section class="section">' +
      sectionHead('교육 자료 · 공지', '') +
      materialBlock +
    '</section>' +

    '<footer class="app-footer"><p class="footer-note">본 자격증은 등록 민간자격증이며 국가자격증 또는 국제공인자격증이 아닙니다.</p></footer>';

  return {
    title: 'MINA ACADEMY',
    html: html,
    mount: function (el) {
      function openEnroll(cohort) {
        if (!state.session) { requireLoginSheet('수강 신청은 로그인 후 가능합니다.'); return; }
        var profile = state.profile || {};
        openSheet({
          title: '수강 신청',
          subtitle: cohort.title,
          content:
            '<div class="detail-block"><h4>과정 정보</h4><p>' + esc(cohort.schedule_text) + '<br>' + esc(cohort.hours_text) + '<br>교육비 · ' + esc(cohort.fee_label) + '</p></div>' +
            '<label class="field"><span class="field-label">신청자 이름</span><input type="text" id="en-name" value="' + esc(profile.full_name || '') + '"></label>' +
            '<label class="field"><span class="field-label">연락처</span><input type="tel" id="en-phone" value="' + esc(profile.phone || '') + '" placeholder="010-0000-0000"></label>' +
            '<label class="field"><span class="field-label">수강 동기 (선택)</span><textarea id="en-motivation" rows="3" placeholder="뇌교육상담사 과정을 통해 이루고 싶은 목표"></textarea></label>' +
            noticeBox('신청 후 상태는 <strong>접수 대기</strong>이며, 담당자 확인 후 <strong>수강 중</strong>으로 변경됩니다. 결제는 교육비 상담 후 진행됩니다.', 'neutral'),
          footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
            '<button type="button" class="btn btn-primary btn-grow" id="en-submit">신청하기</button>',
          onMount: function (sheet) {
            var close = sheet.querySelector('[data-close]');
            if (close) close.addEventListener('click', function () { closeSheet(); });
            var submit = sheet.querySelector('#en-submit');
            submit.addEventListener('click', async function () {
              var name = sheet.querySelector('#en-name').value.trim();
              var phone = sheet.querySelector('#en-phone').value.trim();
              var motivation = sheet.querySelector('#en-motivation').value.trim();
              if (!name) { toast('이름을 입력해 주세요.'); return; }
              if (!/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(phone.replace(/\s/g, ''))) {
                toast('연락처를 정확히 입력해 주세요.');
                return;
              }
              setBusy(submit, true, '접수 중');
              try {
                await createEnrollment({
                  cohort_id: cohort.id,
                  applicant_name: name,
                  applicant_phone: phone,
                  motivation: motivation
                });
                closeSheet();
                openSheet({
                  title: '수강 신청 완료',
                  content: '<div class="success-mark">' + icon('check', 30) + '</div>' +
                    '<h3 class="success-title">접수되었습니다</h3>' +
                    '<p class="success-sub">' + esc(cohort.title) + '</p>' +
                    noticeBox('상태는 <strong>접수 대기</strong>입니다. 담당자 확인 후 수강 중으로 변경되며, 교육 자료실이 열립니다.', 'neutral'),
                  footer: '<button type="button" class="btn btn-primary" data-done>확인</button>',
                  onMount: function (s) {
                    var done = s.querySelector('[data-done]');
                    if (done) done.addEventListener('click', function () { closeSheet(); ctx.rerender(); });
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

      var enrollButtons = el.querySelectorAll('[data-enroll]');
      for (var i = 0; i < enrollButtons.length; i++) {
        enrollButtons[i].addEventListener('click', function () {
          var id = this.getAttribute('data-enroll');
          var cohort = null;
          for (var k = 0; k < cohorts.length; k++) if (String(cohorts[k].id) === String(id)) cohort = cohorts[k];
          if (cohort) openEnroll(cohort);
        });
      }

      var scrollBtn = el.querySelector('[data-scroll-cohorts]');
      if (scrollBtn) {
        scrollBtn.addEventListener('click', function () {
          var section = el.querySelector('#cohort-section');
          if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    }
  };
}
