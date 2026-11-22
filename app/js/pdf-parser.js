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
import { esc } from './ui.js?v=2.0.27';

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
      var sd = data.pairs['표준편차'];
      var total = data.pairs['합계'];
      var parts = [];
      if (avg) parts.push('평균 ' + fmtNum(avg) + '점');
      if (dev) parts.push('최대편차 ' + fmtNum(dev));
      if (sd) parts.push('표준편차 ' + fmtNum(sd));
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

/* ================================================================ 간편검사 */
/* 2쪽 결과지('뇌파 종합 분석 보고서') 전용 파싱
   - 종합 결과지의 항목 머리글은 15pt지만 간편 결과지의 8개 섹션 제목은 12pt입니다.
     그래서 큰 글씨(>=12.5) 필터로는 한 개도 찾지 못합니다.
   - 아래 4개 섹션(육체적/정신적 스트레스 · 행동성향/정서성향)은 좌우 2단 배치라
     같은 높이에 제목이 둘 있으면 페이지 중앙(x)으로 단을 나눠 따로 읽습니다.
   - 워터마크(Neuro/Brain)와 배경 글자는 걸러냅니다. */
var SIMPLE_TITLES = ['뇌 활용 능력', '뇌파의 안정성', '뇌 산만도', '좌우뇌 균형',
  '육체적 스트레스', '정신적 스트레스', '행동성향', '정서성향'];

var ROW_LABELS = ['좌', '우', '좌뇌', '우뇌'];
/* 표 머리글(값이 아닌 라벨)은 문장으로 오인하지 않습니다 */
var TABLE_LABELS = ['표준주파수', '우세주파수', '구분', '평가', '차이비율', 'a평균진폭', '진폭편차'];
var JUNK_TEXT_RE = /^(?:neuro|brain|`\s*평\s*가\s*`|평\s+가|item|[`'"·\-.]*)$/i;

function isJunkItem(item) {
  var text = String(item.text || '').trim();
  if (!text) return true;
  if (JUNK_TEXT_RE.test(text)) return true;
  return (item.height || 0) >= 14.5;   /* 워터마크·표지 제목 */
}

function bodyItemsOf(items) {
  return items.filter(function (it) { return !isJunkItem(it); });
}

/* 같은 높이(±tol)의 아이템을 한 행으로 묶고, 붙어 있는 조각은 한 칸(cell)으로 합칩니다.
   (결과지에 따라 한 칸의 글자가 여러 아이템으로 쪼개져 나오기 때문) */
function groupRows(items, tol) {
  var gap = tol || 3;
  var rows = [];
  items.slice().sort(function (a, b) { return a.y - b.y || a.x - b.x; }).forEach(function (it) {
    var target = null;
    for (var i = rows.length - 1; i >= 0; i--) {
      if (Math.abs(rows[i].y - it.y) <= gap) { target = rows[i]; break; }
      if (rows[i].y < it.y - gap - 1) break;
    }
    if (!target) {
      target = { y: it.y, items: [] };
      rows.push(target);
    }
    target.items.push(it);
  });
  rows.forEach(function (row) {
    row.items.sort(function (a, b) { return a.x - b.x; });
    var cells = [];
    row.items.forEach(function (it) {
      var last = cells[cells.length - 1];
      var limit = Math.max(2.5, (it.height || 10) * 0.35);
      if (last && (it.x - (last.x + last.w)) <= limit) {
        last.text = last.text + ' ' + it.text;
        last.w = it.x + (it.width || 0) - last.x;
      } else {
        cells.push({ x: it.x, y: it.y, w: it.width || 0, text: it.text });
      }
    });
    row.cells = cells;
    row.norm = norm(cells.map(function (c) { return c.text; }).join(''));
  });
  rows.sort(function (a, b) { return a.y - b.y; });
  return rows;
}

function isCellNum(cell) { return isNum(cell.text); }

function rowByLabel(rows, label) {
  var target = norm(label);
  for (var i = 0; i < rows.length; i++) {
    var cells = rows[i].cells;
    if (cells.length && norm(cells[0].text) === target) return rows[i];
  }
  return null;
}

function rowNums(row) {
  return row ? row.cells.filter(isCellNum) : [];
}

/* 한 행에서 문장만 (좌/우·라벨·숫자 제외) */
function rowSentence(row) {
  if (!row) return '';
  return row.cells.filter(function (cell) {
    if (isCellNum(cell)) return false;
    var key = norm(cell.text);
    if (ROW_LABELS.indexOf(key) >= 0 || TABLE_LABELS.indexOf(key) >= 0) return false;
    return /[가-힣]/.test(cell.text) && key.length >= 5;
  }).map(function (cell) { return cell.text; }).join(' ');
}

/* 행 라벨(첫 칸)을 뺀 나머지 글자 칸 */
function cellText(row, index) {
  if (!row) return '';
  var texts = row.cells.slice(1).filter(function (cell) {
    if (isCellNum(cell)) return false;
    return ROW_LABELS.indexOf(norm(cell.text)) < 0 && /[가-힣]/.test(cell.text);
  });
  return texts[index] ? texts[index].text : '';
}

function round1(text) {
  var value = toNumber(text);
  if (value === null) return String(text || '').trim();
  return String(Math.round(value * 10) / 10);
}

/* 1쪽 '폐안 뇌파 특성' 표의 Body stress · Mind stress (FP1=좌 · FP2=우) */
function readStressMeters(pages) {
  var out = {};
  pages.forEach(function (page) {
    if (out['Body stress'] && out['Mind stress']) return;
    groupRows(bodyItemsOf(page.items)).forEach(function (row) {
      var flat = row.norm.toLowerCase();
      var key = flat.indexOf('bodystress') === 0 ? 'Body stress'
        : (flat.indexOf('mindstress') === 0 ? 'Mind stress' : '');
      if (!key || out[key]) return;
      var nums = rowNums(row);
      if (nums.length < 2) return;
      out[key] = { left: round1(nums[0].text), right: round1(nums[1].text) };
    });
  });
  return out;
}

/* 페이지에서 8개 섹션 제목을 찾아 구역(제목 아래 ~ 다음 제목 위)을 잘라 냅니다 */
function simpleSections(page) {
  var items = bodyItemsOf(page.items);
  var wanted = {};
  SIMPLE_TITLES.forEach(function (name) { wanted[norm(name)] = name; });
  var headers = [];
  items.forEach(function (it) {
    var size = it.height || 0;
    if (size < 11 || size > 14) return;      /* 섹션 제목은 12pt */
    var name = wanted[norm(it.text)];
    if (!name) return;
    for (var i = 0; i < headers.length; i++) if (headers[i].key === name) return;
    headers.push({ key: name, x: it.x, y: it.y });
  });
  if (headers.length < 4) return [];
  headers.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
  var mid = (page.width || 596) / 2;
  var bottom = (page.height || 841) - 40;
  headers.forEach(function (heading) {
    var end = Infinity;
    headers.forEach(function (other) {
      if (other !== heading && other.y > heading.y + 6 && other.y < end) end = other.y;
    });
    heading.hi = Math.min(end, bottom);
    var twin = null;
    headers.forEach(function (other) {
      if (other !== heading && Math.abs(other.y - heading.y) <= 6 &&
        (other.x - mid) * (heading.x - mid) < 0) twin = other;
    });
    heading.xMin = twin ? (heading.x < mid ? 0 : mid) : 0;
    heading.xMax = twin ? (heading.x < mid ? mid : page.width) : page.width;
    heading.body = items.filter(function (it) {
      return it.y > heading.y + 6 && it.y < heading.hi &&
        it.x >= heading.xMin && it.x < heading.xMax;
    });
  });
  return headers;
}

/* 뇌 활용 능력 · 표준/우세 주파수 + 좌뇌·우뇌 평가 */
function simpleBrainUse(body) {
  var nums = [];
  var sentences = [];
  groupRows(body).forEach(function (row) {
    rowNums(row).forEach(function (cell) { nums.push(cell); });
    var sentence = rowSentence(row);
    if (sentence) sentences.push(sentence);
  });
  nums.sort(function (a, b) { return a.x - b.x; });
  var parts = [];
  var dominant = nums;
  if (nums.length >= 3) {
    parts.push('표준 주파수 ' + fmtNum(nums[0].text) + 'Hz');
    dominant = nums.slice(1);
  }
  if (dominant.length >= 2) {
    parts.push('우세 주파수 좌 ' + fmtNum(dominant[0].text) + 'Hz / 우 ' + fmtNum(dominant[1].text) + 'Hz');
  } else if (dominant.length === 1) {
    parts.push('우세 주파수 ' + fmtNum(dominant[0].text) + 'Hz');
  }
  if (sentences.length) {
    parts.push('좌뇌 ' + sentences[0] + (sentences[1] ? ' / 우뇌 ' + sentences[1] : ''));
  }
  return parts.join(' · ');
}

/* 뇌파의 안정성 · α평균진폭 · 진폭 편차 · 판정 (좌/우 + 편차) */
function simpleStability(body) {
  var rows = groupRows(body);
  var left = rowByLabel(rows, '좌뇌');
  var right = rowByLabel(rows, '우뇌');
  var gap = rowByLabel(rows, '편차');
  if (!left || !right) return '';
  var l = rowNums(left);
  var r = rowNums(right);
  if (l.length < 2 || r.length < 2) return '';
  var d = rowNums(gap);
  var parts = [];
  parts.push('α평균진폭 좌 ' + fmtNum(l[0].text) + ' / 우 ' + fmtNum(r[0].text) +
    (d.length ? ' (편차 ' + fmtNum(d[0].text) + ')' : ''));
  parts.push('진폭 편차 좌 ' + fmtNum(l[1].text) + ' / 우 ' + fmtNum(r[1].text) +
    (d.length > 1 ? ' (편차 ' + fmtNum(d[1].text) + ')' : ''));
  var lv = cellText(left, 0);
  var rv = cellText(right, 0);
  if (lv || rv) parts.push('판정 좌 ' + (lv || '—') + ' / 우 ' + (rv || '—'));
  return parts.join(' · ');
}

/* 뇌 산만도 · 좌뇌/우뇌 평가 문장 */
function simpleDistraction(body) {
  var sentences = [];
  groupRows(body).forEach(function (row) {
    var sentence = rowSentence(row);
    if (sentence) sentences.push(sentence);
  });
  if (!sentences.length) return '';
  if (sentences.length === 1) return sentences[0];
  return '좌뇌 ' + sentences[0] + ' / 우뇌 ' + sentences[1];
}

/* 좌우뇌 균형 · 좌우동조 · 진폭대칭 평가 */
function simpleBalance(body) {
  var rows = groupRows(body);
  var sync = cellText(rowByLabel(rows, '좌우동조'), 0);
  var symmetry = cellText(rowByLabel(rows, '진폭대칭'), 0);
  var parts = [];
  if (sync) parts.push('좌우동조 ' + sync);
  if (symmetry) parts.push('진폭대칭 ' + symmetry);
  return parts.join(' · ');
}

/* 육체적 · 정신적 스트레스 · 1쪽 표 수치 + 좌/우 평가 문장 */
function simpleStress(body, kind, meters) {
  var sentences = [];
  groupRows(body).forEach(function (row) {
    var sentence = rowSentence(row);
    if (sentence) sentences.push(sentence);
  });
  var parts = [];
  var meter = meters[kind === '육체적' ? 'Body stress' : 'Mind stress'];
  if (meter) {
    parts.push((kind === '육체적' ? 'Body' : 'Mind') + ' stress 좌 ' + meter.left + ' / 우 ' + meter.right);
  }
  if (sentences.length) {
    parts.push('좌 ' + sentences[0] + (sentences[1] ? ' / 우 ' + sentences[1] : ''));
  }
  return parts.join(' · ');
}

/* 행동성향(α/-β) · 정서성향(α평균) 표 · 좌/우 값 + 차이비율 + 판정 */
function simpleTrait(body) {
  var rows = groupRows(body);
  var head = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].cells.length && norm(rows[i].cells[0].text) === '구분') {
      head = rows[i];
      break;
    }
  }
  if (!head) return '';
  var columns = head.cells.slice(1).map(function (cell) {
    return { key: cell.text, x: cell.x };
  });
  if (!columns.length) return '';
  var bucket = {};
  columns.forEach(function (col) { bucket[col.key] = { nums: [], texts: [] }; });
  rows.forEach(function (row) {
    if (row.y <= head.y + 5) return;
    row.cells.forEach(function (cell) {
      if (ROW_LABELS.indexOf(norm(cell.text)) >= 0 || norm(cell.text) === '구분') return;
      var best = null;
      columns.forEach(function (col) {
        if (!best || Math.abs(cell.x - col.x) < Math.abs(cell.x - best.x)) best = col;
      });
      if (!best) return;
      if (isNum(cell.text)) bucket[best.key].nums.push(cell);
      else bucket[best.key].texts.push(cell.text);
    });
  });
  function colBy(test) {
    for (var i = 0; i < columns.length; i++) if (test(norm(columns[i].key))) return bucket[columns[i].key];
    return null;
  }
  var avg = colBy(function (key) { return key.indexOf('α평균') >= 0; });
  var ratio = colBy(function (key) { return key.indexOf('α/-β') >= 0 || key.indexOf('/-β') >= 0; });
  var diff = colBy(function (key) { return key.indexOf('차이비율') >= 0; });
  var judge = colBy(function (key) { return key.indexOf('평가') >= 0; });
  var parts = [];
  var pair = avg || ratio;
  if (pair && pair.nums.length >= 2) {
    var label = avg ? 'α평균' : 'α/-β';
    parts.push(label + ' 좌 ' + fmtNum(pair.nums[0].text) + ' / 우 ' + fmtNum(pair.nums[1].text));
  } else if (pair && pair.nums.length === 1) {
    parts.push('좌 ' + fmtNum(pair.nums[0].text));
  }
  if (diff && diff.nums.length) parts.push('차이비율 ' + fmtNum(diff.nums[0].text));
  var verdict = judge && judge.texts.length ? judge.texts[0] : '';
  if (verdict) parts.push('판정 ' + verdict);
  return parts.join(' · ');
}

/* 2쪽 결과지 전체 → 8개 항목 + 감정 성향 */
function readSimpleReport(pages) {
  var meters = readStressMeters(pages);
  var out = { found: 0, items: {}, emotion: '' };
  var seen = {};
  pages.forEach(function (page) {
    simpleSections(page).forEach(function (heading) {
      if (seen[heading.key]) return;
      seen[heading.key] = true;
      out.found += 1;
      var text = '';
      try {
        if (heading.key === '뇌 활용 능력') text = simpleBrainUse(heading.body);
        else if (heading.key === '뇌파의 안정성') text = simpleStability(heading.body);
        else if (heading.key === '뇌 산만도') text = simpleDistraction(heading.body);
        else if (heading.key === '좌우뇌 균형') text = simpleBalance(heading.body);
        else if (heading.key === '육체적 스트레스') text = simpleStress(heading.body, '육체적', meters);
        else if (heading.key === '정신적 스트레스') text = simpleStress(heading.body, '정신적', meters);
        else if (heading.key === '행동성향' || heading.key === '정서성향') text = simpleTrait(heading.body);
      } catch (err) {
        console.warn('[pdf-parser] 간편검사 항목 읽기 실패', heading.key, err && err.message);
        text = '';
      }
      if (text) out.items[heading.key] = text;
      if (heading.key === '정서성향' && text) {
        var verdict = text.split('판정 ')[1];
        if (verdict) out.emotion = verdict.trim();
      }
    });
  });
  return out;
}

/* ------------------------------------------------------------ 측정일 추출 */
/* 생년월일 표기(D.O.B · 생년월일)는 측정일이 아니므로 후보에서 제외합니다. */
var DOB_LINE_RE = /D\.?\s*O\.?\s*B|생년월일|생\s*년\s*월\s*일|DATE\s*OF\s*BIRTH/i;

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
        if (DOB_LINE_RE.test(lines[j].norm)) continue;
        for (var n = 0; n < lines[j].items.length; n++) {
          var m2 = compact.exec(lines[j].items[n].text.trim()) || dashed.exec(lines[j].items[n].text.trim());
          if (m2) return make(m2);
        }
      }
    }
  }
  /* 2순위: 리포트 첫 두 쪽에서 발견되는 첫 날짜(측정일 표기가 없는 양식)
     — 생년월일 줄(D.O.B · 생년월일)에 적힌 날짜는 측정일이 아니므로 건너뜁니다. */
  for (var q = 0; q < Math.min(2, pages.length); q++) {
    var lines2 = buildLines(pages[q].items);
    for (var r = 0; r < lines2.length; r++) {
      if (DOB_LINE_RE.test(lines2[r].norm)) continue;
      for (var s = 0; s < lines2[r].items.length; s++) {
        var m3 = compact.exec(lines2[r].items[s].text.trim()) || dashed.exec(lines2[r].items[s].text.trim());
        if (m3) return make(m3);
      }
    }
  }
  return '';
}

/* ------------------------------------------------- '뇌파 종합 분석 보고서' 평가 */
/* 12쪽 요약 페이지처럼 항목별 '평가' 문장이 있는 양식에서 뇌 산만도 평가를 읽습니다.
   (Θ/SMR 수치는 그래프 그림으로만 표시되어 텍스트로 읽을 수 없습니다.) */
var OVERVIEW_CATEGORIES = ['뇌 산만도', '뇌 활용 능력', '뇌파의 안정성'];

/* 그래프 위에 겹쳐 그려진 라벨(Neuro/Brain · 좌뇌/우뇌 등)을 평가 문장에서 떼어냅니다. */
function cleanOverviewText(raw) {
  var text = String(raw || '').trim();
  for (var i = 0; i < 3; i++) {
    var next = text
      .replace(/^(Neuro|Brain)\s*/i, '')
      .replace(/^(좌|우)\s*뇌\s*/, '')
      .replace(/^(좌우\s*동조|진폭\s*대칭)\s*/, '')
      .trim();
    if (next === text) break;
    text = next;
  }
  return text;
}

function readOverviewNotes(pages) {
  var out = {};
  pages.forEach(function (page) {
    var lines = buildLines(page.items);
    var isOverview = lines.some(function (line) { return line.norm.indexOf('종합분석') >= 0; });
    if (!isOverview) return;
    var targets = OVERVIEW_CATEGORIES.map(function (name) { return { name: name, norm: norm(name) }; });
    targets.forEach(function (category) {
      if (out[category.name]) return;
      var idx = -1;
      for (var i = 0; i < lines.length; i++) {
        if (lines[i].norm === category.norm) { idx = i; break; }
      }
      if (idx < 0) return;
      var startY = lines[idx].y;
      var endY = Infinity;
      for (var j = idx + 1; j < lines.length; j++) {
        var other = targets.some(function (name) { return lines[j].norm === name.norm; });
        if (other) { endY = lines[j].y; break; }
      }
      for (var k = idx + 1; k < lines.length; k++) {
        var line = lines[k];
        if (line.y >= endY) break;
        if (line.y - startY < 8 || line.y - startY > 100) continue;
        var text = cleanOverviewText(line.text);
        if (!/[가-힣]/.test(text) || text.length < 8) continue;
        if (/^[0-9.%\s]+$/.test(text)) continue;
        out[category.name] = text;
        break;
      }
    });
  });
  return out;
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

  /* 간편검사(2쪽) 결과지: 8개 섹션 제목이 12pt·2단 배치라 별도 규칙으로 읽습니다.
     종합검사(5쪽 이상)는 아래 기존 규칙을 그대로 씁니다. */
  if (pages.length <= 4) {
    var simple = readSimpleReport(pages);
    if (simple.found >= 6) {
      result.checkType = 'simple';
      result.measuredAt = readMeasuredAt(pages);
      result.emotion = simple.emotion || '';
      Object.keys(simple.items).forEach(function (key) {
        result.items[key] = simple.items[key];
        result.filledItems += 1;
      });
      if (!result.measuredAt) result.notes.push('no-date');
      if (!result.filledItems) result.notes.push('no-items');
      return result;
    }
  }

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

  /* 뇌 산만도: 수치는 그래프 그림이라 읽을 수 없고, 요약 페이지의 평가 문장만 옮깁니다 */
  if (!result.items['뇌 산만비율(Θ/SMR)']) {
    var overview = readOverviewNotes(pages);
    if (overview['뇌 산만도']) {
      result.items['뇌 산만비율(Θ/SMR)'] = '평가 · ' + overview['뇌 산만도'] +
        ' (Θ/-β · δ/-β 수치는 결과지 그래프 참고)';
      result.filledItems += 1;
    }
  }

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

function nodeValue(node) {
  return node ? String(node.value || '').trim() : '';
}

/* PDF가 채운 값과 사용자가 직접 고친 값을 구분해, 새 PDF를 첨부하면
   이전 PDF의 잔재는 새 값으로 깨끗이 교체하고 사람이 고친 칸만 남깁니다. */
function createFieldState(fields) {
  var state = { values: { date: '', emotion: '', summary: '' }, manual: {} };

  Object.keys(fields || {}).forEach(function (key) {
    var node = fields[key];
    if (!node || !node.addEventListener) return;
    node.addEventListener('input', function () {
      var current = nodeValue(node);
      if (!current || current === String(state.values[key] || '')) state.manual[key] = false;
      else state.manual[key] = true;
    });
    node.addEventListener('change', function () {
      var current = nodeValue(node);
      if (!current || current === String(state.values[key] || '')) state.manual[key] = false;
      else state.manual[key] = true;
    });
  });

  return {
    manual: state.manual,
    value: function (key) { return state.values[key]; },
    reset: function () {
      state.values = { date: '', emotion: '', summary: '' };
      state.manual = {};
    },
    /* 새 PDF 값 반영 · 결과: 'filled' | 'kept' | 'cleared' | 'same' */
    apply: function (key, value) {
      var node = fields[key];
      if (!node) return 'none';
      var next = value === null || value === undefined ? '' : String(value).trim();
      var current = nodeValue(node);

      if (state.manual[key]) {
        if (current && current !== String(state.values[key] || '')) return 'kept';
        state.manual[key] = false;
      }
      if (!next) {
        /* 새 PDF에 값이 없으면 : 이전 PDF가 넣은 값만 되돌립니다 */
        if (current && state.values[key] && current === String(state.values[key])) {
          node.value = '';
          state.values[key] = '';
          return 'cleared';
        }
        return 'none';
      }
      state.values[key] = next;
      if (current === next) return 'same';
      node.value = next;
      return 'filled';
    },
    set: function (key, value) {
      state.values[key] = value === null || value === undefined ? '' : String(value);
      state.manual[key] = false;
    }
  };
}

/* check-items 의 fillItems 로 항목별 설명을 채웁니다 (동적 import 회피용 콜백 주입).
   fillItems 콜백은 (map, options) 를 받아 채운 개수를 돌려주거나
   {filled, kept, cleared, written} 상세를 돌려줄 수 있습니다. */
export function bindPdfAutofill(opts) {
  var input = opts.fileInput;
  var status = opts.statusEl;
  if (!input) return null;
  var filling = false;
  var fields = opts.fields || {};
  var fieldState = createFieldState(fields);
  var prevItems = {};

  function reset() {
    fieldState.reset();
    prevItems = {};
    setStatus(status, '', '');
  }

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

    /* 1) 검사 유형 — 항목 템플릿이 함께 바뀌도록 change 이벤트 발생.
       항목칸은 지금 바로 새 PDF 기준으로 다시 채우므로 유형 변경은 먼저 처리합니다. */
    if (opts.typeEl && report.checkType && opts.typeEl.value !== report.checkType) {
      opts.typeEl.value = report.checkType;
      try {
        opts.typeEl.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        console.warn('[pdf-parser] 유형 변경 이벤트 실패', err);
      }
    }

    /* 2) 측정일 · 감정 성향 · 요약 — 폼 기본값(오늘 날짜)이나 이전 PDF 값이
       새 PDF 값을 막지 않습니다. 사용자가 직접 고친 칸만 남깁니다. */
    var counts = { filled: 0, kept: 0, cleared: 0 };
    function count(result) {
      if (result === 'filled') counts.filled += 1;
      else if (result === 'kept') counts.kept += 1;
      else if (result === 'cleared') counts.cleared += 1;
    }
    count(fieldState.apply('date', report.measuredAt));
    count(fieldState.apply('emotion', report.emotion));
    if (fields.summary) {
      var auto = summaryText(report);
      count(fieldState.apply('summary', auto));
    }

    /* 3) 항목별 설명 — 이전 PDF가 채운 값은 새 값으로 교체하고, 새 PDF에 없는
       항목은 이전 PDF 잔재를 비웁니다. */
    var itemFilled = 0;
    var itemKept = 0;
    var itemCleared = 0;
    var written = null;
    if (typeof opts.fillItems === 'function') {
      try {
        var itemResult = opts.fillItems(report.items, { overwrite: true, previous: prevItems }) || 0;
        if (typeof itemResult === 'object') {
          itemFilled = Number(itemResult.filled || 0);
          itemKept = Number(itemResult.kept || 0);
          itemCleared = Number(itemResult.cleared || 0);
          written = itemResult.written || null;
        } else {
          itemFilled = Number(itemResult || 0);
        }
      } catch (err) {
        console.warn('[pdf-parser] 항목 입력 실패', err);
      }
    }
    prevItems = written || report.items || {};

    var parts = [];
    if (report.measuredAt) parts.push('측정일');
    if (report.emotion) parts.push('감정 성향');
    if (itemFilled) parts.push('항목 설명 ' + itemFilled + '건');

    if (!parts.length && !counts.filled) {
      setStatus(status, 'warn', '이 파일에서는 수치를 자동으로 읽지 못했습니다. 파일은 그대로 첨부되며 수치는 직접 입력해 주세요.');
      return;
    }
    var message = 'PDF에서 ' + parts.join(' · ') + '을 자동으로 불러왔습니다. 확인 후 결과 등록을 눌러 주세요.';
    if (!parts.length) message = 'PDF를 읽었지만 새로 채울 값이 없었습니다. 내용을 확인해 주세요.';
    if (report.checkType) {
      message += ' <small>(검사 유형: ' + (report.checkType === 'full' ? '종합검사' : '간편검사') + ' · 결과지 ' + report.pageCount + '쪽)</small>';
    }
    if (counts.kept || itemKept) {
      message += ' <small>직접 입력해 둔 칸 ' + (counts.kept + itemKept) + '개는 그대로 두었습니다.</small>';
    }
    if (counts.cleared || itemCleared) {
      message += ' <small>이전 PDF에서 넘어온 값 ' + (counts.cleared + itemCleared) + '개는 비웠습니다.</small>';
    }
    var expected = report.checkType === 'full' ? 10 : 8;
    if (itemFilled && itemFilled < expected) {
      message += ' <small>그래프 안 그림으로 된 수치는 자동 인식되지 않아 해당 항목은 비워 두었습니다.</small>';
    }
    setStatus(status, 'success', message);
  });

  return { reset: reset };
}
