/* 관리자 → 뉴로피드백: NeuroBrain 화면 캡처 자동 입력 (v2.0.20)
   - 이미지는 브라우저 안에서만 OCR (외부 전송 없음)
   - 인식된 회차를 고르면 회차 기록 입력 폼을 채우고, 단계별 세부 기록을 아래 표에서 수정 */
import { recognizeNeuroCapture, preloadOcr } from '../../capture-ocr.js?v=2.0.20';
import { esc, noticeBox, toast } from '../../ui.js?v=2.0.20';

export function captureSectionHtml() {
  return '<section class="admin-section" id="capture-section">' +
    '<h2 class="admin-h2">화면 캡처 자동 입력 <span class="muted small" style="font-weight:400">· NeuroBrain</span></h2>' +
    '<div class="capture-zone" id="ses-capture-zone" tabindex="0" role="button" aria-label="캡처 이미지 붙여넣기 또는 파일 선택">' +
      '<div class="capture-zone-main">' +
        '<strong>NeuroBrain Management System 화면을 캡처해 붙여넣으세요</strong>' +
        '<span class="capture-caption">PC에서 <kbd>Win</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> 로 찍은 뒤 이 영역에서 <kbd>Ctrl</kbd>+<kbd>V</kbd> · 이미지 파일을 골라도 됩니다.<br>' +
          '이미지는 브라우저 안에서만 읽고 서버로 보내지 않습니다.</span>' +
      '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm" id="ses-capture-pick">이미지 파일 선택</button>' +
      '<input type="file" id="ses-capture" accept="image/*" hidden>' +
    '</div>' +
    '<div class="capture-status" id="ses-capture-status" hidden></div>' +
    '<div id="ses-capture-result"></div>' +
    '</section>';
}

function fmtSessionLabel(s) {
  const parts = [];
  if (s.total_score_s !== null && s.total_score_s !== undefined) parts.push(s.total_score_s + 'S');
  if (s.total_points_p !== null && s.total_points_p !== undefined) parts.push(s.total_points_p + 'P');
  return parts.join(' · ');
}

function rowsFromSession(s) {
  return s.exercises.map(function (ex) {
    return {
      seq: ex.seq,
      protocol: ex.protocol || '',
      exercise: ex.exercise || '',
      score_s: ex.score_s,
      score_p: ex.score_p,
      raw_score: ex.raw_score || '',
      confidence: ex.confidence || 0
    };
  });
}

export function bindNeuroCapture(el, opts) {
  const options = opts || {};
  const zone = el.querySelector('#ses-capture-zone');
  const fileInput = el.querySelector('#ses-capture');
  const pickBtn = el.querySelector('#ses-capture-pick');
  const statusEl = el.querySelector('#ses-capture-status');
  const resultEl = el.querySelector('#ses-capture-result');

  let model = null;
  let rows = [];
  let selected = 0;
  let busy = false;

  const api = {
    getDetails: getDetails,
    hasSession: function () { return !!(model && model.sessions && model.sessions.length); },
    refreshBadges: function () { if (model) renderResult(); }
  };

  function setStatus(text, percent) {
    statusEl.hidden = false;
    let prefix = '';
    if (typeof percent === 'number' && percent >= 0 && percent < 100) prefix = '<span class="capture-pct">' + percent + '%</span> ';
    statusEl.innerHTML = prefix + esc(text);
  }

  function currentUser() {
    if (typeof options.getSelectedUser === 'function') return options.getSelectedUser() || '';
    return '';
  }

  function findMatches() {
    const profiles = options.profiles || [];
    if (!model || !model.member) return [];
    const names = [];
    if (model.member.name) names.push(model.member.name);
    (model.member.nameCandidates || []).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
    if (!names.length) return [];
    return profiles.filter(function (p) {
      const full = String(p.full_name || '').trim();
      return full && names.indexOf(full) >= 0;
    });
  }

  function isRegistered(session, userId) {
    const sessions = options.sessions || [];
    return sessions.some(function (s) {
      if (userId && String(s.user_id) !== String(userId)) return false;
      if (Number(s.session_no) !== Number(session.no)) return false;
      const stamp = String(s.trained_at || '').slice(0, 10);
      return stamp && session.date && stamp === session.date;
    });
  }

  function renderResult() {
    if (!model) { resultEl.innerHTML = ''; return; }
    const sessions = model.sessions || [];
    const matched = findMatches();
    const userId = currentUser() || (matched.length === 1 ? String(matched[0].id) : '');

    let html = '<div class="capture-summary">';
    html += '<div class="capture-summary-row"><strong>' + esc(model.member.name || '회원 미확인') + '</strong>' +
      (model.member.birthday ? '<span class="muted small">생년월일 ' + esc(model.member.birthday) + '</span>' : '') +
      (model.member.dateFrom ? '<span class="muted small">' + esc(model.member.dateFrom) + ' ~ ' + esc(model.member.dateTo || '') + '</span>' : '') +
      '<span class="muted small">회차 ' + sessions.length + '개 · ' + (model.elapsedMs / 1000).toFixed(1) + '초</span></div>';

    if (matched.length === 1) {
      html += '<div class="capture-match ok">회원 자동 매칭 · ' + esc(matched[0].full_name) + ' (' + esc(matched[0].email || '') + ')</div>';
    } else if (matched.length > 1) {
      html += '<div class="capture-match warn">동명이인 ' + matched.length + '명 — 아래 <strong>회원</strong> 칸에서 직접 골라 주세요.</div>';
    } else if (model.member.name) {
      html += '<div class="capture-match warn">회원 목록에서 "' + esc(model.member.name) + '"을(를) 찾지 못했습니다. 아래 <strong>회원</strong> 칸에서 직접 선택해 주세요.</div>';
    }

    if (model.warnings && model.warnings.length) {
      html += '<div class="capture-warn">' + model.warnings.map(function (w) { return esc(w); }).join('<br>') + '</div>';
    }

    if (!sessions.length) {
      html += '<div class="capture-match warn">표에서 회차를 찾지 못했습니다. 표 전체가 보이게 다시 캡처해 주세요.</div>';
    } else {
      html += '<div class="capture-sessions">';
      sessions.forEach(function (s, i) {
        const reg = isRegistered(s, userId);
        html += '<button type="button" class="capture-session' + (i === selected ? ' is-active' : '') + '" data-session="' + i + '">' +
          '<span class="csb-no">#' + esc(s.no) + '</span>' +
          '<span class="csb-date">' + esc(s.date || '날짜 미확인') + '</span>' +
          '<span class="csb-total">' + esc(fmtSessionLabel(s) || '점수 미확인') + '</span>' +
          '<span class="csb-steps">' + s.step_count + '단계</span>' +
          (reg ? '<span class="badge badge-neutral">이미 등록됨</span>' : '') +
          '</button>';
      });
      html += '</div>';
      html += detailHtml(sessions[selected]);
    }
    html += '</div>';
    resultEl.innerHTML = html;
    bindResultEvents();
  }

  function detailHtml(session) {
    if (!session) return '';
    let html = '<div class="capture-detail">' +
      '<div class="capture-detail-head"><strong>#' + esc(session.no) + ' 단계별 기록</strong>' +
      '<span class="muted small">수정·추가·삭제할 수 있습니다. ' +
      (session.begin.text ? '시작 ' + esc(session.begin.text) + ' · ' : '') +
      (session.finish.text ? '종료 ' + esc(session.finish.text) : '') + '</span></div>';
    html += '<div class="table-scroll"><table class="data-table capture-table"><thead><tr>' +
      '<th style="width:52px">SEQ</th><th style="width:120px">Protocol</th><th>exercise</th>' +
      '<th style="width:92px">score S</th><th style="width:92px">score P</th><th style="width:44px"></th>' +
      '</tr></thead><tbody>';
    rows.forEach(function (r, i) {
      const low = r.confidence > 0 && r.confidence < 40;
      html += '<tr' + (low ? ' class="is-uncertain"' : '') + '>' +
        '<td><input type="text" class="capture-cell" data-row="' + i + '" data-field="seq" value="' + esc(r.seq) + '" inputmode="numeric"></td>' +
        '<td><input type="text" class="capture-cell" data-row="' + i + '" data-field="protocol" value="' + esc(r.protocol) + '"></td>' +
        '<td><input type="text" class="capture-cell" data-row="' + i + '" data-field="exercise" value="' + esc(r.exercise) + '"></td>' +
        '<td><input type="text" class="capture-cell" data-row="' + i + '" data-field="score_s" value="' + esc(r.score_s === null ? '' : r.score_s) + '" inputmode="numeric"></td>' +
        '<td><input type="text" class="capture-cell" data-row="' + i + '" data-field="score_p" value="' + esc(r.score_p === null ? '' : r.score_p) + '" inputmode="numeric"></td>' +
        '<td><button type="button" class="btn btn-ghost btn-xs" data-remove="' + i + '" aria-label="이 줄 삭제">−</button></td>' +
        '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div class="capture-detail-foot">' +
      '<button type="button" class="btn btn-ghost btn-xs" id="ses-capture-addrow">+ 단계 추가</button>' +
      '<span class="muted small">합계 <strong>' + totalsText() + '</strong></span>' +
      '</div></div>';
    return html;
  }

  function totalsText() {
    let s = 0, p = 0, hasS = false, hasP = false;
    rows.forEach(function (r) {
      const sv = Number(r.score_s);
      const pv = Number(r.score_p);
      if (isFinite(sv) && r.score_s !== '' && r.score_s !== null) { s += sv; hasS = true; }
      if (isFinite(pv) && r.score_p !== '' && r.score_p !== null) { p += pv; hasP = true; }
    });
    const parts = [];
    if (hasS) parts.push(s + 'S');
    if (hasP) parts.push(p + 'P');
    return parts.join(' · ') || '-';
  }

  function bindResultEvents() {
    const buttons = resultEl.querySelectorAll('[data-session]');
    for (let i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function () {
        selected = Number(this.getAttribute('data-session'));
        const s = model.sessions[selected];
        rows = rowsFromSession(s);
        renderResult();
        applyToForm(s);
      });
    }
    const cells = resultEl.querySelectorAll('.capture-cell');
    for (let k = 0; k < cells.length; k++) {
      cells[k].addEventListener('input', function () {
        const idx = Number(this.getAttribute('data-row'));
        const field = this.getAttribute('data-field');
        if (!rows[idx]) return;
        let value = this.value;
        if (field === 'seq' || field === 'score_s' || field === 'score_p') {
          const num = value.replace(/[^0-9]/g, '');
          if (num !== value) this.value = num;
          rows[idx][field] = num === '' ? null : Number(num);
        } else {
          rows[idx][field] = value;
        }
        const foot = resultEl.querySelector('.capture-detail-foot .muted');
        if (foot) foot.innerHTML = '합계 <strong>' + esc(totalsText()) + '</strong>';
      });
    }
    const removeButtons = resultEl.querySelectorAll('[data-remove]');
    for (let r = 0; r < removeButtons.length; r++) {
      removeButtons[r].addEventListener('click', function () {
        const idx = Number(this.getAttribute('data-remove'));
        rows.splice(idx, 1);
        renderResult();
      });
    }
    const addBtn = resultEl.querySelector('#ses-capture-addrow');
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        rows.push({ seq: rows.length + 1, protocol: '', exercise: '', score_s: null, score_p: null, raw_score: '', confidence: 0 });
        renderResult();
      });
    }
  }

  function applyToForm(session) {
    if (typeof options.onSessionPicked !== 'function') return;
    const matched = findMatches();
    options.onSessionPicked({
      session: session,
      userId: matched.length === 1 ? String(matched[0].id) : (currentUser() || ''),
      matchedCount: matched.length,
      totals: totalsText(),
      rows: rows.slice()
    });
  }

  function getDetails() {
    if (!model || !model.sessions || !model.sessions.length) return null;
    const s = model.sessions[selected];
    if (!s) return null;
    const cleanRows = rows.filter(function (r) {
      return String(r.exercise || '').trim() || String(r.protocol || '').trim() || r.score_s !== null || r.score_p !== null;
    }).map(function (r, i) {
      return {
        seq: r.seq === null || r.seq === undefined || r.seq === '' ? i + 1 : Number(r.seq),
        protocol: String(r.protocol || '').trim(),
        exercise: String(r.exercise || '').trim(),
        score_s: r.score_s === '' || r.score_s === undefined ? null : r.score_s,
        score_p: r.score_p === '' || r.score_p === undefined ? null : r.score_p,
        raw_score: r.raw_score || ''
      };
    });
    let totalS = 0, totalP = 0, hasS = false, hasP = false;
    cleanRows.forEach(function (r) {
      if (r.score_s !== null) { totalS += Number(r.score_s); hasS = true; }
      if (r.score_p !== null) { totalP += Number(r.score_p); hasP = true; }
    });
    const protocols = [];
    cleanRows.forEach(function (r) { if (r.protocol && protocols.indexOf(r.protocol) < 0) protocols.push(r.protocol); });
    return {
      source: 'neurobrain_capture',
      session_no: s.no,
      begin_time: s.begin.text || '',
      finish_time: s.finish.text || '',
      begin_partial: !!s.begin.partial,
      finish_partial: !!s.finish.partial,
      electrodes: s.electrodes || '',
      protocols: protocols,
      total_score_s: hasS ? totalS : null,
      total_points_p: hasP ? totalP : null,
      step_count: cleanRows.length,
      capture: {
        trainee: s.trainee || '',
        member_name: model.member.name || '',
        member_code: model.member.memberCode || '',
        birthday: model.member.birthday || '',
        date_from: model.member.dateFrom || '',
        date_to: model.member.dateTo || '',
        recognized_at: new Date().toISOString()
      },
      exercises: cleanRows
    };
  }

  async function handleFile(file) {
    if (busy) return;
    if (!file || !file.type || file.type.indexOf('image') !== 0) {
      setStatus('이미지 파일만 인식할 수 있습니다.');
      return;
    }
    busy = true;
    resultEl.innerHTML = '';
    setStatus('이미지를 읽는 중…', 4);
    try {
      const result = await recognizeNeuroCapture(file, {
        onProgress: function (p) { setStatus(p.message, p.percent); }
      });
      model = result;
      selected = 0;
      rows = result.sessions.length ? rowsFromSession(result.sessions[0]) : [];
      setStatus('인식 완료 · ' + result.sessions.length + '개 회차', 100);
      renderResult();
      const matched = findMatches();
      if (matched.length > 1) {
        toast('동명이인 ' + matched.length + '명입니다. 회원을 직접 골라 주세요.', 'warn');
      } else if (!matched.length) {
        toast('회원을 자동으로 찾지 못했습니다. 회원 칸에서 선택해 주세요.', 'warn');
      }
      if (result.sessions.length) applyToForm(result.sessions[0]);
    } catch (err) {
      model = null;
      rows = [];
      setStatus(String(err && err.message || err));
      resultEl.innerHTML = noticeBox('캡처를 자동으로 읽지 못했습니다. ' + esc(String(err && err.message || err)) +
        '<br>아래 <strong>회차 기록 입력</strong>에서 직접 입력할 수 있습니다.', 'warn');
    } finally {
      busy = false;
    }
  }

  zone.addEventListener('click', function (e) {
    if (e.target === fileInput) return;
    fileInput.click();
  });
  zone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  pickBtn.addEventListener('click', function (e) { e.stopPropagation(); fileInput.click(); });
  zone.addEventListener('dragover', function (e) { e.preventDefault(); zone.classList.add('is-over'); });
  zone.addEventListener('dragleave', function () { zone.classList.remove('is-over'); });
  zone.addEventListener('drop', function (e) {
    e.preventDefault();
    zone.classList.remove('is-over');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
  });

  if (window.__minaCapturePaste) document.removeEventListener('paste', window.__minaCapturePaste);
  function onPaste(e) {
    if (!document.body.contains(zone)) {
      document.removeEventListener('paste', onPaste);
      if (window.__minaCapturePaste === onPaste) window.__minaCapturePaste = null;
      return;
    }
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type && items[i].type.indexOf('image') === 0) {
        const blob = items[i].getAsFile();
        if (blob) { e.preventDefault(); handleFile(blob); return; }
      }
    }
  }
  window.__minaCapturePaste = onPaste;
  document.addEventListener('paste', onPaste);

  /* 관리자가 이 화면을 열면 엔진을 미리 준비해 첫 캡처를 빠르게 */
  setTimeout(function () { preloadOcr(['eng']); }, 1200);

  return api;
}
