/* =====================================================================
   MINA WORLD App — PDF 결과지 자동 수치 추출 (공용 모듈)
   ---------------------------------------------------------------------
   · 뇌파 검사 결과지 PDF(Neuro Science Report)를 **브라우저 안에서만** 읽습니다.
     파일은 어떤 서버·외부 API로도 전송하지 않습니다 (PDF.js 로컬 파싱).
   · PDF.js 는 첨부 시점에만 CDN에서 지연 로드합니다(평소 앱 속도 영향 0).
   · 추출 규칙
       - 검사 유형 : 결과지 쪽수/항목 구성 (2쪽 내외 = 간편, 5쪽 이상 = 종합)
       - 측정일    : '측정일자' 표의 YYYYMMDD / YYYY-MM-DD / YYYY.MM.DD
       - 감정 성향 : '정서 성향' 표의 판정 문구 (예: 상당히 명랑함)
       - 항목별 값 : 각 항목 머리글 아래 좌/우 표의 숫자를 **열 순서 그대로** 읽어
                     항목별 한 줄 요약으로 만듭니다.
       - 숫자 수치는 DB에만 남기고 화면 입력칸은 두지 않습니다. 세부 수치는
                     항목별 설명(한 줄 요약)으로 전달합니다(추측 금지).
   · 그래프 안에 그림(래스터)으로 박힌 수치는 어떤 텍스트 파서도 읽을 수 없습니다.
     그런 항목은 비워 두고 몇 건을 채웠는지만 안내합니다.
   ===================================================================== */
import { esc } from './ui.js?v=2.0.11';

var PDFJS_VERSION = '3.11.174';
var PDFJS_CDN = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/';
var CDN_CMAPS = PDFJS_CDN + 'cmaps/';
var CDN_STANDARD_FONTS = PDFJS_CDN + 'standard_fonts/';

var NUM_RE = /^-?\d+(?:\.\d+)?%?$/;
var ROW_LEFT = ['좌', '좌뇌'];
var ROW_RIGHT = ['우', '우뇌'];

function norm(text) {
  return String(text || '').replace(/\s+/g, '');
}

function isNum(text) {
  return NUM_RE.test(String(text || '').replace(/[−–—]/g, '-').trim());
}

function toNumber(text) {
  var value = Number(String(text || '').replace(/[%−–—\s]/g, ''));
  return isFinite(value) ? value : null;
}

/* 수치 표기: 7.10 → 7.1, 정수는 그대로 */
function fmtNum(text) {
  var value = toNumber(text);
  if (value === null) return String(text || '').trim();
  return String(Math.round(value * 100) / 100);
}

/* ------------------------------------------------------------ PDF.js 로드 */
var pdfjsPromise = null;

function injectScript(src) {
  return new Promise(function (resolve, reject) {
    var tag = document.createElement('script');
    tag.src = src;
    tag.async = true;
    tag.onload = function () { resolve(); };
    tag.onerror = function () { reject(new Error('load failed: ' + src)); };
    document.head.appendChild(tag);
  });
}

export function loadPdfJs() {
  if (pdfjsPromise) return pdfjsPromise;
  pdfjsPromise = (async function () {
    if (window.pdfjsLib) return window.pdfjsLib;
    var candidates = [PDFJS_CDN + 'build/pdf.min.js', PDFJS_CDN + 'legacy/build/pdf.min.js'];
    for (var i = 0; i < candidates.length; i++) {
      try {
        await injectScript(candidates[i]);
        if (window.pdfjsLib) break;
      } catch (err) {
        console.warn('[pdf-parser] PDF.js 로드 실패', candidates[i], err && err.message);
      }
    }
    if (!window.pdfjsLib) throw new Error('pdfjs_unavailable');
    try {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_CDN + 'build/pdf.worker.min.js';
    } catch (err) {
      console.warn('[pdf-parser] worker 설정 실패', err && err.message);
    }
    return window.pdfjsLib;
  })();
  return pdfjsPromise;
}

/* -------------------------------------------------- 페이지별 텍스트 아이템 */
async function readPages(file) {
  var lib = await loadPdfJs();
  var buffer = await file.arrayBuffer();
  var doc = await lib.getDocument({
    data: new Uint8Array(buffer),
    cMapUrl: CDN_CMAPS,
    cMapPacked: true,
    standardFontDataUrl: CDN_STANDARD_FONTS,
    isEvalSupported: false,
    disableFontFace: true
  }).promise;

  var pages = [];
  for (var p = 1; p <= doc.numPages; p++) {
    var page = await doc.getPage(p);
    var viewport = page.getViewport({ scale: 1 });
    var content = await page.getTextContent({ disableCombineTextItems: true, normalizeWhitespace: true });
    var items = [];
    (content.items || []).forEach(function (item) {
      var text = String(item.str || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      var tx = lib.Util.transform(viewport.transform, item.transform);
      items.push({
        x: tx[4],
        y: tx[5],
        width: (item.width || 0) * viewport.scale,
        height: (item.height || 0) * viewport.scale,
        text: text
      });
    });
    pages.push({ items: items, height: viewport.height, width: viewport.width });
    page.cleanup();
  }
  try { doc.destroy(); } catch (err) { /* noop */ }
  return pages;
}

/* 같은 높이(±3)의 아이템을 한 줄로 묶고, 줄 안에서 x 순으로 정렬 */
function buildLines(items) {
  var sorted = items.slice().sort(function (a, b) {
    if (Math.abs(a.y - b.y) > 3) return a.y - b.y;
    return a.x - b.x;
  });
  var lines = [];
  sorted.forEach(function (item) {
    var target = null;
    for (var i = 0; i < lines.length; i++) {
      if (Math.abs(lines[i].y - item.y) <= 3) { target = lines[i]; break; }
    }
    if (!target) {
      target = { y: item.y, items: [] };
      lines.push(target);
    }
    target.items.push(item);
  });
  lines.forEach(function (line) {
    line.items.sort(function (a, b) { return a.x - b.x; });
    line.text = line.items.map(function (it) { return it.text; }).join(' ');
    line.norm = norm(line.text);
    line.size = line.items.reduce(function (max, it) { return Math.max(max, it.height || 0); }, 0);
  });
  lines.sort(function (a, b) { return a.y - b.y; });
  return lines;
}

function findHeading(lines, title) {
  var target = norm(title);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.norm === target || line.norm.indexOf(target) === 0) return i;
  }
  for (var j = 0; j < lines.length; j++) {
    if (lines[j].norm.indexOf(target) >= 0 && lines[j].norm.length <= target.length + 10) return j;
  }
  return -1;
}

function findHeadings(lines, titles) {
  var hits = [];
  titles.forEach(function (title) {
    var idx = findHeading(lines, title);
    if (idx >= 0) hits.push({ title: title, index: idx, y: lines[idx].y });
  });
  hits.sort(function (a, b) { return a.y - b.y; });
  return hits;
}

function sectionBand(lines, index, headings) {
  var start = lines[index].y;
  var end = Infinity;
  headings.forEach(function (h) {
    if (h.y > start + 1 && h.y < end) end = h.y;
  });
  var lo = index + 1;
  var hi = lines.length;
  for (var i = index + 1; i < lines.length; i++) {
    if (lines[i].y >= end) { hi = i; break; }
  }
  return { lo: lo, hi: hi };
}

function isRowLabel(item) {
  var text = norm(item.text);
  return ROW_LEFT.indexOf(text) >= 0 || ROW_RIGHT.indexOf(text) >= 0;
}

/* 항목 표 읽기: 좌/우 라벨이 붙은 행의 숫자를 x 순서대로 모읍니다 */
function readRows(lines, lo, hi) {
  var rows = [];
  var shared = [];
  for (var i = lo; i < hi; i++) {
    var line = lines[i];
    if (!line.items.length) continue;
    var nums = line.items.filter(function (it) { return isNum(it.text); });
    if (!nums.length) continue;
    var label = isRowLabel(line.items[0]) ? norm(line.items[0].text) : '';
    if (label) {
      rows.push({ label: label, nums: nums, line: line });
      continue;
    }
    /* 라벨 없는 줄 = 좌/우 공통값. 산문 문장은 제외합니다. */
    var short = line.items.every(function (it) {
      return isNum(it.text) || it.text === '%' || (it.text.length <= 14 && !/[.。]$/.test(it.text));
    });
    if (short && line.items.length <= 8) shared.push({ nums: nums, line: line });
  }
  return { rows: rows, shared: shared };
}

function judgementOf(sharedItems) {
  for (var i = 0; i < sharedItems.length; i++) {
    var items = sharedItems[i].line.items;
    for (var k = 0; k < items.length; k++) {
      var text = items[k].text;
      if (isNum(text) || text === '%') continue;
      if (/^[가-힣]{2,}/.test(norm(text)) && text.length <= 14) return text.trim();
    }
  }
  return '';
}

/* 좌/우 값을 '좌 a / 우 b' 형태로 */
function lr(left, right, unit) {
  var suffix = unit || '';
  if (left === null || left === undefined) return '';
  if (right === null || right === undefined || right === '') return fmtNum(left) + suffix;
  return '좌 ' + fmtNum(left) + suffix + ' / 우 ' + fmtNum(right) + suffix;
}

/* --------------------------------------------------------------- 항목 정의 */
var SECTIONS = [
  {
    key: '주파수 출현빈도 및 평균 진폭',
    title: '주파수 출현빈도 및 평균 진폭',
    columns: ['우세 주파수', 'α 상대 세기'],
    unit: 'Hz·%',
    build: function (data) {
      if (!data.rows.length) return '';
      var left = data.rows[0].nums;
      var right = data.rows[1] ? data.rows[1].nums : [];
      if (left.length < 2) return '';
      return '우세 주파수 ' + lr(left[0].text, right[0] && right[0].text, 'Hz') +
        ' · α 상대 세기 ' + lr(left[1].text, right[1] && right[1].text, '%');
    }
  },
  {
    key: '알파파 파형의 변화',
    title: '알파파 파워의 변화',
    columns: ['α 평균진폭', '최대값', '최소값', '표준편차', '최대편차'],
    build: function (data) {
      if (data.rows.length < 2) return '';
      if (data.rows[0].nums.length < 4) return '';
      var left = data.rows[0].nums;
      var right = data.rows[1].nums;
      var parts = [];
      ['α 평균진폭', '최대값', '최소값', '표준편차', '최대편차'].forEach(function (name, i) {
        if (!left[i]) return;
        parts.push(name + ' ' + fmtNum(left[i].text) + '/' + fmtNum(right[i] ? right[i].text : ''));
      });
      return parts.join(' · ') + ' (좌/우)';
    }
  },
  {
    key: '개안·폐안 뇌파의 변화',
    title: '개안-폐안 뇌파의 변화',
    columns: ['δ', 'θ', 'α', 'SMR', '-β', '+β'],
    build: function (data) {
      if (data.rows.length < 2) return '';
      var oe1L = data.rows[0].nums;
      var oe1R = data.rows[1].nums;
      var oe2L = data.rows[2] ? data.rows[2].nums : [];
      var oe2R = data.rows[3] ? data.rows[3].nums : [];
      var alphaIndex = 2;
      if (!oe1L[alphaIndex]) return '';
      var text = 'OE1 α ' + lr(oe1L[alphaIndex].text, oe1R[alphaIndex] && oe1R[alphaIndex].text, '%');
      if (oe2L[alphaIndex]) text += ' · OE2 α ' + lr(oe2L[alphaIndex].text, oe2R[alphaIndex] && oe2R[alphaIndex].text, '%');
      return text + ' (개안-폐안 변화율 · 10~40%면 조절 양호)';
    }
  },
  {
    key: '뇌 산만비율(Θ/SMR)',
    title: '뇌 산만비율',
    columns: [],
    build: function () { return ''; }
  },
  {
    key: '좌우뇌 균형',
    title: '좌우뇌 균형',
    columns: ['진폭 대칭', '좌우 동조'],
    build: function (data) {
      if (!data.shared.length) return '';
      var nums = data.shared[0].nums;
      if (nums.length < 2) return '';
      return '진폭 대칭 ' + fmtNum(nums[0].text) + '% · 좌우 동조 ' + fmtNum(nums[1].text) + '%' +
        ' (진폭 대칭 80% · 동조 50% 이상이 협응 양호)';
    }
  },
  {
    key: '육체적 긴장과 스트레스',
    title: '육체적 긴장과 스트레스',
    columns: ['스트레스', 'δ / SMR', 'δ / -β', 'δ / +β'],
    build: function (data) {
      if (data.rows.length < 2 || !data.rows[0].nums.length) return '';
      var left = data.rows[0].nums;
      var right = data.rows[1].nums;
      return '스트레스 ' + lr(left[0].text, right[0] && right[0].text) +
        ' (10 이상이면 긴장·회복력 저하)';
    }
  },
  {
    key: '정신적 산만과 스트레스',
    title: '정신적 산만과 스트레스',
    columns: ['스트레스', 'δ / α', 'α / +β', 'SMR / +β'],
    build: function (data) {
      if (data.rows.length < 2 || !data.rows[0].nums.length) return '';
      var left = data.rows[0].nums;
      var right = data.rows[1].nums;
      return '스트레스 ' + lr(left[0].text, right[0] && right[0].text) + ' (1 이하가 바람직)';
    }
  },
  {
    key: '행동 성향(α/β)',
    title: '행동 성향',
    columns: ['α / -β', 'Θ / -β', '-β', '+β'],
    build: function (data) {
      if (data.rows.length < 2) return '';
      var left = data.rows[0].nums;
      var right = data.rows[1].nums;
      var parts = [];
      if (left[0]) parts.push('α/-β ' + lr(left[0].text, right[0] && right[0].text));
      if (left[1]) parts.push('Θ/-β ' + lr(left[1].text, right[1] && right[1].text));
      var verdict = judgementOf(data.shared);
      if (verdict) parts.push('판정 ' + verdict);
      return parts.join(' · ');
    }
  },
  {
    key: '정서 성향(Lα·Rα)',
    title: '정서 성향',
    columns: ['α 평균', '+β', 'Lα-Rα 차이', '+β 차이'],
    build: function (data) {
      var parts = [];
      if (data.rows.length >= 2) {
        var left = data.rows[0].nums;
        var right = data.rows[1].nums;
        if (left[0]) parts.push('α 평균 ' + lr(left[0].text, right[0] && right[0].text));
      }
      var sharedNums = [];
      data.shared.forEach(function (row) {
        row.nums.forEach(function (n) { sharedNums.push(n); });
      });
      if (sharedNums[0]) parts.push('Lα-Rα 차이 ' + fmtNum(sharedNums[0].text) + '%');
      var verdict = judgementOf(data.shared);
      if (verdict) parts.push('판정 ' + verdict);
      return parts.join(' · ');
    }
  },
  {
    key: '자기 피드백 능력',
    title: '자기 피드백 능력',
    columns: ['합계', '평균', '최대편차', '표준편차'],
    build: function (data) {
      if (!data.pairs) return '';
      var avg = data.pairs['평균'];
      var dev = data.pairs['최대편차'];
      var total = data.pairs['합계'];
      var parts = [];
      if (avg) parts.push('평균 ' + fmtNum(avg) + '점');
      if (dev) parts.push('최대편차 ' + fmtNum(dev));
      if (total) parts.push('합계 ' + fmtNum(total));
      if (!parts.length) return '';
      return parts.join(' · ') + ' (항목 25점 이상·최대편차 5 이하가 이상적)';
    }
  }
];

function readPairs(lines, lo, hi, labels) {
  var out = {};
  for (var i = lo; i < hi; i++) {
    var items = lines[i].items;
    for (var k = 0; k < items.length; k++) {
      labels.forEach(function (label) {
        if (norm(items[k].text) !== norm(label)) return;
        for (var n = k + 1; n < items.length; n++) {
          if (isNum(items[n].text)) out[label] = items[n].text;
        }
      });
    }
  }
  return out;
}

/* ------------------------------------------------------------ 측정일 추출 */
function readMeasuredAt(pages) {
  var compact = /^(20\d{2})(\d{2})(\d{2})$/;
  var dashed = /^(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})$/;
  function make(m) {
    var month = String(m[2]).padStart(2, '0');
    var day = String(m[3]).padStart(2, '0');
    var monthNum = Number(month);
    var dayNum = Number(day);
    if (monthNum < 1 || monthNum > 12 || dayNum < 1 || dayNum > 31) return '';
    return m[1] + '-' + month + '-' + day;
  }
  /* 1순위: '측정일자' 라벨이 있는 줄의 날짜 */
  for (var p = 0; p < pages.length; p++) {
    var lines = buildLines(pages[p].items);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.norm.indexOf('측정일') < 0) continue;
      for (var k = 0; k < line.items.length; k++) {
        var m = compact.exec(line.items[k].text.trim()) || dashed.exec(line.items[k].text.trim());
        if (m) return make(m);
      }
      /* 라벨과 값이 다른 줄에 있는 경우: 바로 다음 줄까지 확인 */
      for (var j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        for (var n = 0; n < lines[j].items.length; n++) {
          var m2 = compact.exec(lines[j].items[n].text.trim()) || dashed.exec(lines[j].items[n].text.trim());
          if (m2) return make(m2);
        }
      }
    }
  }
  /* 2순위: 리포트 첫 두 쪽에서 발견되는 첫 날짜(측정일 표기가 없는 양식) */
  for (var q = 0; q < Math.min(2, pages.length); q++) {
    var lines2 = buildLines(pages[q].items);
    for (var r = 0; r < lines2.length; r++) {
      for (var s = 0; s < lines2[r].items.length; s++) {
        var m3 = compact.exec(lines2[r].items[s].text.trim()) || dashed.exec(lines2[r].items[s].text.trim());
        if (m3) return make(m3);
      }
    }
  }
  return '';
}

/* --------------------------------------------------------------- 공개 API */
export async function parseReport(file) {
  var pages;
  try {
    pages = await readPages(file);
  } catch (err) {
    console.warn('[pdf-parser] PDF를 읽지 못했습니다', err);
    if (err && String(err.message || err).indexOf('pdfjs_unavailable') >= 0) {
      return { ok: false, reason: 'auto' };
    }
    return { ok: false, reason: 'unreadable' };
  }
  if (!pages.length) return { ok: false, reason: 'unreadable' };

  var result = {
    ok: true,
    pageCount: pages.length,
    checkType: '',
    measuredAt: '',
    emotion: '',
    items: {},
    filledItems: 0,
    notes: []
  };

  var titles = SECTIONS.map(function (s) { return s.title; });
  var parsed = {};
  var best = {};

  pages.forEach(function (page, pno) {
    var lines = buildLines(page.items);
    var headings = findHeadings(lines, titles).filter(function (h) {
      /* 머리글은 큰 글씨 (본문 10pt · 머리글 15pt) */
      return lines[h.index].size >= 12.5;
    });
    headings.forEach(function (heading) {
      var band = sectionBand(lines, heading.index, headings);
      var data = readRows(lines, band.lo, band.hi);
      if (heading.title === '자기 피드백 능력') {
        data.pairs = readPairs(lines, band.lo, band.hi, SECTIONS[9].columns);
      }
      /* 표지의 목차 목록(값 없음)보다 실제 표가 있는 쪽을 고릅니다 */
      var score = data.rows.length + data.shared.length * 0.5 +
        (data.pairs ? Object.keys(data.pairs).length : 0);
      if (!best[heading.title] || score > best[heading.title].score) {
        best[heading.title] = { score: score, page: pno };
        parsed[heading.title] = data;
      }
    });
  });

  /* 검사 유형: 종합 결과지 항목(자기 피드백 능력)이 있거나 5쪽 이상이면 종합 */
  var hasFullSection = Boolean(parsed['자기 피드백 능력'] || parsed['정서 성향'] || parsed['행동 성향']);
  result.checkType = (pages.length >= 5 || hasFullSection) ? 'full' : 'simple';

  result.measuredAt = readMeasuredAt(pages);

  /* 항목별 한 줄 요약 */
  SECTIONS.forEach(function (section) {
    var data = parsed[section.title];
    if (!data) return;
    var text = '';
    try { text = section.build(data) || ''; } catch (err) { text = ''; }
    if (text) {
      result.items[section.key] = text;
      result.filledItems += 1;
    }
  });

  /* 감정 성향 */
  var emotionData = parsed['정서 성향'];
  if (emotionData) {
    var verdict = judgementOf(emotionData.shared || []);
    if (verdict) result.emotion = verdict;
  }

  if (!result.measuredAt) result.notes.push('no-date');
  if (!result.filledItems) result.notes.push('no-items');
  return result;
}

/* 자동 요약 문장 (요약 코멘트가 비어 있을 때만 사용) */
export function summaryText(report) {
  if (!report || !report.ok) return '';
  var parts = [];
  if (report.emotion) parts.push('감정 성향 ' + report.emotion);
  var itemCount = report.items ? Object.keys(report.items).length : 0;
  if (itemCount) parts.push('항목별 설명 ' + itemCount + '건');
  if (!parts.length) return '';
  return '결과지에서 자동 정리한 요약입니다. ' + parts.join(' · ') +
    '. 세부 수치는 아래 항목별 설명과 첨부한 결과지를 참고해 주세요.';
}

/* --------------------------------------------------------- 폼 자동 입력 연결 */
function setStatus(node, tone, message) {
  if (!node) return;
  if (!message) {
    node.hidden = true;
    node.innerHTML = '';
    return;
  }
  node.hidden = false;
  node.className = 'pdf-status is-' + tone;
  node.innerHTML = message;
}

function setIfEmpty(node, value) {
  if (!node || value === null || value === undefined || value === '') return false;
  if (String(node.value || '').trim() !== '') return false;
  node.value = String(value);
  return true;
}

/* check-items 의 fillItems 로 항목별 설명을 채웁니다 (동적 import 회피용 콜백 주입) */
export function bindPdfAutofill(opts) {
  var input = opts.fileInput;
  var status = opts.statusEl;
  if (!input) return;
  var filling = false;

  input.addEventListener('change', async function () {
    var file = input.files && input.files[0] ? input.files[0] : null;
    if (!file) { setStatus(status, '', ''); return; }
    if (filling) return;

    var isPdf = /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
    if (!isPdf) {
      setStatus(status, 'info', '이미지 파일은 수치를 자동으로 읽지 않습니다. 파일은 그대로 첨부되며 수치는 직접 입력해 주세요.');
      return;
    }

    filling = true;
    setStatus(status, 'info', '<span class="spinner spinner-sm"></span>PDF에서 수치를 읽는 중입니다…');
    var report;
    try {
      report = await parseReport(file);
    } catch (err) {
      console.warn('[pdf-parser] 파싱 실패', err);
      report = { ok: false, reason: 'unreadable' };
    }
    filling = false;

    if (!report.ok) {
      var reason = report.reason === 'auto'
        ? 'PDF 자동 인식 기능을 불러오지 못했습니다(네트워크 확인). 파일은 그대로 첨부되며 수치는 직접 입력해 주세요.'
        : '이 파일에서는 수치를 자동으로 읽지 못했습니다. 파일은 그대로 첨부되며 수치는 직접 입력해 주세요.';
      setStatus(status, 'warn', esc(reason));
      return;
    }

    var filled = 0;
    var skipped = 0;
    function track(ok) { if (ok) filled += 1; else skipped += 1; }

    /* 1) 검사 유형 — 항목 템플릿이 함께 바뀌도록 change 이벤트 발생 */
    if (opts.typeEl && report.checkType && opts.typeEl.value !== report.checkType) {
      opts.typeEl.value = report.checkType;
      try {
        opts.typeEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        console.warn('[pdf-parser] 유형 변경 이벤트 실패', err);
      }
    }

    /* 2) 기본 항목 */
    var fields = opts.fields || {};
    track(setIfEmpty(fields.date, report.measuredAt));
    if (report.emotion) track(setIfEmpty(fields.emotion, report.emotion));
    if (fields.summary && !String(fields.summary.value || '').trim()) {
      var auto = summaryText(report);
      if (auto) { fields.summary.value = auto; filled += 1; }
    }

    /* 3) 항목별 설명 */
    var itemFilled = 0;
    if (typeof opts.fillItems === 'function') {
      try {
        itemFilled = opts.fillItems(report.items) || 0;
      } catch (err) {
        console.warn('[pdf-parser] 항목 입력 실패', err);
      }
    }

    var parts = [];
    if (report.measuredAt) parts.push('측정일');
    if (report.emotion) parts.push('감정 성향');
    if (itemFilled) parts.push('항목 설명 ' + itemFilled + '건');

    if (!parts.length) {
      setStatus(status, 'warn', '이 파일에서는 수치를 자동으로 읽지 못했습니다. 파일은 그대로 첨부되며 수치는 직접 입력해 주세요.');
      return;
    }
    var message = 'PDF에서 ' + parts.join(' · ') + '을 자동으로 불러왔습니다. 확인 후 결과 등록을 눌러 주세요.';
    if (report.checkType) {
      message += ' <small>(검사 유형: ' + (report.checkType === 'full' ? '종합검사' : '간편검사') + ' · 결과지 ' + report.pageCount + '쪽)</small>';
    }
    if (skipped) message += ' <small>이미 입력된 칸 ' + skipped + '개는 덮어쓰지 않았습니다.</small>';
    var expected = report.checkType === 'full' ? 10 : 8;
    if (itemFilled && itemFilled < expected) {
      message += ' <small>그래프 안 그림으로 된 수치는 자동 인식되지 않아 해당 항목은 비워 두었습니다.</small>';
    }
    setStatus(status, 'success', message);
  });
}
