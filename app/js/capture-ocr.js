/* =====================================================================
   MINA WORLD 앱 — NeuroBrain Management System 화면 캡처 → 뉴로피드백 기록 파싱
   (v2.0.20)

   · 이미지는 브라우저 안에서만 처리합니다. 외부 OCR 서버로 보내지 않습니다.
     (Tesseract.js WASM + 학습데이터만 CDN에서 내려받아 이 기기에서 계산)
   · 표의 열 경계는 캡처에 실제로 그려진 세로 격자선의 x 좌표에서 얻고,
     헤더 글자(No. / begin / finish / Trainee / ID / SEQ / Protocol / exercise /
     score / electrodes / wave adjust / waves / comments)로 열 이름을 붙입니다.
   · 훈련 이름(exercise)·프로토콜·SEQ 개수는 사람마다 다르므로 미리 정하지 않고
     표에 적힌 글자를 그대로 읽습니다. (사전 치환·강제 매칭 없음)
   ===================================================================== */

const CDN = {
  script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
  worker: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
  core: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/',
  lang: function (lang) {
    return 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/' + lang + '/4.0.0_best_int';
  }
};

/* NeuroBrain 'Training list' 표의 기본 열 순서 (헤더 글자를 못 읽었을 때의 위치 보정용) */
const DEFAULT_COLUMN_ORDER = [
  'no', 'begin', 'finish', 'trainee', 'id', 'seq', 'protocol',
  'exercise', 'score', 'electrodes', 'wave_adjust', 'waves', 'comments'
];

const KEY_LABEL = {
  no: 'No.', begin: 'begin', finish: 'finish', trainee: 'Trainee', id: 'ID',
  seq: 'SEQ', protocol: 'Protocol', exercise: 'exercise', score: 'score',
  electrodes: 'electrodes', wave_adjust: 'wave adjust', waves: 'waves', comments: 'comments'
};

/* ------------------------------------------------------------ 엔진 로딩 */

let tesseractPromise = null;

function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  if (tesseractPromise) return tesseractPromise;
  tesseractPromise = new Promise(function (resolve, reject) {
    const s = document.createElement('script');
    s.src = CDN.script;
    s.async = true;
    s.onload = function () {
      if (window.Tesseract) resolve(window.Tesseract);
      else reject(new Error('OCR 엔진을 시작하지 못했습니다.'));
    };
    s.onerror = function () {
      reject(new Error('OCR 엔진을 내려받지 못했습니다. 인터넷 연결을 확인해 주세요.'));
    };
    document.head.appendChild(s);
  });
  return tesseractPromise;
}

/* 창 단위 캐시: 같은 화면에서 캡처를 여러 번 올려도 엔진을 다시 내려받지 않습니다. */
const workerCache = (window.__minaOcrWorkers = window.__minaOcrWorkers || {});

async function getWorker(lang, onNote) {
  if (workerCache[lang]) return workerCache[lang];
  const T = await loadTesseract();
  if (onNote) onNote(lang === 'kor' ? '한글 인식 준비 중…' : '영문 인식 준비 중…');
  const worker = await T.createWorker(lang, 1, {
    workerPath: CDN.worker,
    corePath: CDN.core,
    langPath: CDN.lang(lang),
    cacheMethod: 'readwrite',
    logger: function () {}
  });
  workerCache[lang] = worker;
  return worker;
}

/* 관리자 화면을 열 때 미리 엔진을 준비해 두면 첫 캡처가 빠르게 끝납니다. */
export async function preloadOcr(langs) {
  const list = langs && langs.length ? langs : ['eng'];
  const out = [];
  for (let i = 0; i < list.length; i++) {
    try { out.push(await getWorker(list[i])); } catch (e) { /* 무시: 실제 사용 시 다시 시도 */ }
  }
  return out.length;
}

export async function releaseOcrWorkers() {
  const keys = Object.keys(workerCache);
  for (let i = 0; i < keys.length; i++) {
    const w = workerCache[keys[i]];
    delete workerCache[keys[i]];
    try { await w.terminate(); } catch (e) { /* 이미 종료됨 */ }
  }
}

/* --------------------------------------------------------------- 이미지 */

function loadImage(source) {
  return new Promise(function (resolve, reject) {
    const url = URL.createObjectURL(source);
    const img = new window.Image();
    img.onload = function () { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('이미지를 열 수 없습니다. JPG · PNG 파일인지 확인해 주세요.')); };
    img.src = url;
  });
}

function drawToCanvas(img) {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth || img.width;
  c.height = img.naturalHeight || img.height;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, c.width, c.height);
  g.drawImage(img, 0, 0);
  return c;
}

function toGray(imageData, w, h) {
  const src = imageData.data;
  const out = new window.Uint8ClampedArray(w * h);
  for (let i = 0, p = 0; i < out.length; i++, p += 4) {
    out[i] = (src[p] * 0.299 + src[p + 1] * 0.587 + src[p + 2] * 0.114) | 0;
  }
  return out;
}

/* ------------------------------------------------------- 격자선 / 표 찾기
   NeuroBrain 화면의 표 격자선은 아주 옅은 회색(약 238~240)으로 그려집니다.
   그래서 "어두운 픽셀"이 아니라 "옅은 회색 픽셀"을 선으로 봅니다. */

function isGridGray(v) { return v >= 228 && v <= 248; }

function mergeAdjacent(items, coordKey, tolerance) {
  const out = [];
  const list = items.slice().sort(function (a, b) { return a[coordKey] - b[coordKey]; });
  for (let i = 0; i < list.length; i++) {
    const it = list[i];
    const last = out[out.length - 1];
    if (last && it[coordKey] - last.end <= tolerance) {
      last.end = it[coordKey];
      if (it.len > last.len) { last.len = it.len; last.a = it.a; last.b = it.b; }
    } else {
      out.push({ start: it[coordKey], end: it[coordKey], len: it.len, a: it.a, b: it.b });
    }
  }
  return out.map(function (g) {
    return { pos: Math.round((g.a === undefined ? g.start : (g.start + g.end) / 2)), start: g.start, end: g.end, len: g.len, a: g.a, b: g.b };
  });
}

/* 가로 격자선: 각 y 에서 가장 긴 '옅은 회색' 연속 구간 */
function detectHorizontalLines(gray, w, h) {
  const lines = [];
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let run = 0, gap = 0, best = 0, startX = 0, bestA = 0, bestB = 0;
    for (let x = 0; x < w; x++) {
      if (isGridGray(gray[row + x])) {
        if (run === 0) startX = x;
        run += gap + 1;
        gap = 0;
        if (run > best) { best = run; bestA = startX; bestB = x; }
      } else {
        gap++;
        if (gap > 2) { run = 0; gap = 0; }
      }
    }
    if (best > w * 0.35) lines.push({ y: y, len: best, a: bestA, b: bestB });
  }
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const last = merged[merged.length - 1];
    if (last && l.y - last.y2 <= 2) {
      last.y2 = l.y;
      if (l.len > last.len) { last.len = l.len; last.a = l.a; last.b = l.b; }
    } else {
      merged.push({ y: l.y, y2: l.y, len: l.len, a: l.a, b: l.b });
    }
  }
  return merged;
}

/* Training list 표 찾기: 같은 좌우 폭을 가진 가로선이 촘촘히 이어지는 구간 */
function findTable(lines, imgWidth) {
  if (!lines.length) return null;
  const clusters = [];
  const sorted = lines.slice().sort(function (a, b) { return b.len - a.len; });
  for (let i = 0; i < sorted.length; i++) {
    const l = sorted[i];
    let target = null;
    for (let k = 0; k < clusters.length; k++) {
      if (Math.abs(clusters[k].a - l.a) < 30 && Math.abs(clusters[k].b - l.b) < 30) { target = clusters[k]; break; }
    }
    if (!target) { target = { a: l.a, b: l.b, lines: [] }; clusters.push(target); }
    target.lines.push(l);
  }

  let best = null;
  for (let c = 0; c < clusters.length; c++) {
    const width = clusters[c].b - clusters[c].a;
    if (width < imgWidth * 0.35) continue;
    const ls = clusters[c].lines.slice().sort(function (p, q) { return p.y - q.y; });
    const runs = [];
    let start = 0;
    for (let i = 1; i < ls.length; i++) {
      if (ls[i].y - ls[i - 1].y > 40) { runs.push(ls.slice(start, i)); start = i; }
    }
    runs.push(ls.slice(start));
    for (let r = 0; r < runs.length; r++) {
      const run = runs[r];
      if (run.length < 4) continue;
      const score = run.length * 10000 + width;
      if (!best || score > best.score) {
        best = {
          x0: clusters[c].a,
          x1: clusters[c].b,
          y0: run[0].y,
          y1: run[run.length - 1].y,
          rows: run,
          score: score
        };
      }
    }
  }
  return best;
}

/* 세로 격자선(열 경계) — 표 세로 범위 안에서 옅은 회색이 길게 이어지는 x */
function detectColumnLines(gray, w, x0, x1, y0, y1) {
  const height = y1 - y0;
  if (height < 20) return [];
  const from = Math.max(0, x0 - 8);
  const to = Math.min(w - 1, x1 + 8);
  const counts = new window.Int32Array(w);
  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    for (let x = from; x <= to; x++) {
      if (isGridGray(gray[row + x])) counts[x]++;
    }
  }
  const threshold = Math.max(30, height * 0.55);
  const hits = [];
  for (let x = from; x <= to; x++) {
    if (counts[x] >= threshold) hits.push({ x: x, len: counts[x], a: y0, b: y1 });
  }
  return mergeAdjacent(hits, 'x', 2).map(function (l) { return l.pos; });
}

/* 글자가 있는 행 띠 찾기 (표 안쪽 텍스트 줄) */
function detectTextBands(gray, w, h, x0, x1, y0, y1, separators) {
  const left = Math.max(0, x0);
  const right = Math.min(w - 1, x1);
  const skip = new window.Uint8Array(w);
  (separators || []).forEach(function (sx) {
    for (let k = sx - 3; k <= sx + 3; k++) if (k >= 0 && k < w) skip[k] = 1;
  });
  const threshold = Math.max(4, Math.round((right - left) * 0.002));
  const bands = [];
  let cur = null;
  let gap = 99;
  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    let ink = 0;
    for (let x = left; x <= right; x++) { if (!skip[x] && gray[row + x] < 205) ink++; }
    if (ink >= threshold) {
      if (cur && gap <= 3) { cur.y1 = y; }
      else { cur = { y0: y, y1: y }; bands.push(cur); }
      gap = 0;
    } else {
      gap++;
      if (gap > 3) cur = null;
    }
  }
  return bands.map(function (b) {
    return { y0: Math.max(y0, b.y0 - 2), y1: Math.min(y1, b.y1 + 2) };
  });
}

/* -------------------------------------------------------------- 헤더 이름 */

function headerKey(raw) {
  const t = String(raw || '').toLowerCase().replace(/[^a-z#]/g, '');
  if (!t) return '';
  if (t.charAt(0) === '#' || t.indexOf('no') === 0 || t.indexOf('num') === 0) return 'no';
  if (t.indexOf('beg') === 0) return 'begin';
  if (t.indexOf('fin') === 0) return 'finish';
  if (t.indexOf('trai') === 0) return 'trainee';
  if (t === 'id' || t === 'iid' || t === '1d') return 'id';
  if (t.indexOf('seq') === 0) return 'seq';
  if (t.indexOf('prot') === 0) return 'protocol';
  if (t.indexOf('exer') === 0 || t.indexOf('game') === 0) return 'exercise';
  if (t.indexOf('sco') === 0) return 'score';
  if (t.indexOf('elec') === 0) return 'electrodes';
  if (t.indexOf('wave') === 0) return 'wave_adjust';
  if (t.indexOf('com') === 0) return 'comments';
  if (t.indexOf('wa') === 0) return 'waves';
  return '';
}

function resolveColumnKeys(columns, headerLabels) {
  const keys = new Array(columns.length).fill('');
  let mapped = 0;
  for (let i = 0; i < columns.length; i++) {
    const k = headerKey(headerLabels[i]);
    if (k && keys.indexOf(k) < 0) { keys[i] = k; mapped++; }
  }
  if (mapped >= 6) {
    /* 헤더로 확인하지 못한 열은 기본 순서에서 남은 이름을 순서대로 채운다 */
    let cursor = 0;
    for (let i = 0; i < keys.length; i++) {
      if (keys[i]) continue;
      while (cursor < DEFAULT_COLUMN_ORDER.length && keys.indexOf(DEFAULT_COLUMN_ORDER[cursor]) >= 0) cursor++;
      if (cursor < DEFAULT_COLUMN_ORDER.length) keys[i] = DEFAULT_COLUMN_ORDER[cursor++];
    }
    return { keys: keys, mode: 'header' };
  }
  /* 헤더 글자를 거의 못 읽은 경우: 소프트웨어의 고정 열 순서로 위치 보정 */
  for (let i = 0; i < columns.length && i < DEFAULT_COLUMN_ORDER.length; i++) keys[i] = DEFAULT_COLUMN_ORDER[i];
  return { keys: keys, mode: 'order' };
}

/* ------------------------------------------------------------- 셀 -> 이미지 */

function buildCellImage(gray, w, h, x0, y0, x1, y1, targetHeight) {
  const left = Math.max(0, Math.min(x0, x1));
  const right = Math.min(w, Math.max(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const bottom = Math.min(h, Math.max(y0, y1));
  let minX = right, maxX = left, minY = bottom, maxY = top, count = 0;

  for (let y = top; y < bottom; y++) {
    const row = y * w;
    for (let x = left; x < right; x++) {
      if (gray[row + x] < 200) {
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (count < 4 || maxX <= minX || maxY <= minY) return null;

  const inkW = maxX - minX + 1;
  const inkH = maxY - minY + 1;
  const scale = Math.max(2, Math.min(7, Math.round((targetHeight || 44) / Math.max(7, inkH))));
  const padX = 12, padY = 10;
  const cw = (inkW + 4) * scale + padX * 2;
  const ch = (inkH + 4) * scale + padY * 2;

  const tmpW = inkW + 4, tmpH = inkH + 4;
  const tmp = document.createElement('canvas');
  tmp.width = tmpW;
  tmp.height = tmpH;
  const tg = tmp.getContext('2d');
  const imgData = tg.createImageData(tmpW, tmpH);
  const px = imgData.data;
  for (let i = 0; i < px.length; i += 4) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255; }
  for (let y = 0; y < inkH; y++) {
    const sy = minY + y;
    for (let x = 0; x < inkW; x++) {
      const v = gray[sy * w + minX + x];
      const out = (y + 2) * tmpW + (x + 2);
      const val = v < 205 ? 0 : 255;
      px[out * 4] = val;
      px[out * 4 + 1] = val;
      px[out * 4 + 2] = val;
    }
  }
  tg.putImageData(imgData, 0, 0);

  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, cw, ch);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(tmp, padX, padY, tmpW * scale, tmpH * scale);

  return { canvas: c, w: cw, h: ch, scale: scale, inkH: inkH };
}

function buildStrip(cells) {
  const gap = 16, padY = 12, padX = 10;
  let width = 40;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] && cells[i].w > width) width = cells[i].w;
  }
  width += padX * 2;
  let height = padY * 2;
  const offsets = [];
  for (let i = 0; i < cells.length; i++) {
    const ch = cells[i] ? cells[i].h : 26;
    offsets.push({ top: height, bottom: height + ch, empty: !cells[i] });
    height += ch + gap;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, width, height);
  for (let i = 0; i < cells.length; i++) {
    if (!cells[i]) continue;
    g.imageSmoothingEnabled = false;
    g.drawImage(cells[i].canvas, padX, offsets[i].top);
  }
  return { canvas: canvas, offsets: offsets };
}

/* ------------------------------------------------------------------- OCR */

function paramsFor(key, single) {
  const mode = single ? '7' : '6';
  let whitelist = '';
  if (key === 'no') whitelist = '0123456789#';
  else if (key === 'seq' || key === 'id') whitelist = '0123456789';
  else if (key === 'score') whitelist = '0123456789SP()';
  else if (key === 'begin' || key === 'finish') whitelist = '0123456789-:. ';
  return { tessedit_pageseg_mode: mode, tessedit_char_whitelist: whitelist, preserve_interword_spaces: '1' };
}

function extractLines(data) {
  if (!data) return null;
  if (Array.isArray(data.lines) && data.lines.length) return data.lines;
  const out = [];
  if (Array.isArray(data.blocks)) {
    data.blocks.forEach(function (b) {
      (b.paragraphs || []).forEach(function (p) {
        (p.lines || []).forEach(function (l) {
          out.push({ text: l.text, confidence: l.confidence, bbox: l.bbox });
        });
      });
    });
  }
  return out.length ? out : null;
}

async function ocrStrip(worker, strip, key) {
  await worker.setParameters(paramsFor(key, false));
  const res = await worker.recognize(strip.canvas);
  const data = res && res.data ? res.data : {};
  const lines = extractLines(data);
  const texts = new Array(strip.offsets.length).fill('');
  const conf = new Array(strip.offsets.length).fill(0);

  if (lines) {
    lines.forEach(function (line) {
      if (!line.bbox) return;
      const cy = (line.bbox.y0 + line.bbox.y1) / 2;
      let hit = -1;
      for (let i = 0; i < strip.offsets.length; i++) {
        if (cy >= strip.offsets[i].top - 6 && cy <= strip.offsets[i].bottom + 6) { hit = i; break; }
      }
      if (hit >= 0) {
        const t = String(line.text || '').trim();
        if (t) {
          texts[hit] = (texts[hit] ? texts[hit] + ' ' : '') + t;
          conf[hit] = Math.max(conf[hit], Number(line.confidence) || 0);
        }
      }
    });
  } else {
    const rows = String(data.text || '').split('\n').map(function (s) { return s.trim(); }).filter(function (s) { return s.length; });
    for (let i = 0; i < rows.length && i < texts.length; i++) texts[i] = rows[i];
  }
  return { texts: texts, conf: conf };
}

async function ocrSingle(worker, cell, key) {
  await worker.setParameters(paramsFor(key, true));
  const res = await worker.recognize(cell.canvas);
  const text = res && res.data ? String(res.data.text || '').replace(/\s+/g, ' ').trim() : '';
  return { text: text, conf: res && res.data ? Number(res.data.confidence) || 0 : 0 };
}

/* ------------------------------------------------------------- 값 다듬기 */

function dayStr(v) { return (v < 10 ? '0' : '') + v; }

function digitsOnly(s) {
  return String(s || '')
    .replace(/[OoQ]/g, '0')
    .replace(/[ilI|]/g, '1')
    .replace(/[^0-9]/g, '');
}

function toInt(s) {
  const d = digitsOnly(s);
  if (!d) return null;
  return parseInt(d, 10);
}

/* score: "28S(5P)" · "0S(0P)" · 가끔 괄호가 빠지거나 O/0 이 섞임 */
export function parseScoreText(raw) {
  const t = String(raw || '')
    .replace(/[OoQ]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/\s+/g, '');
  let m = t.match(/(\d{1,4})[Ss5$]\s*\(\s*(\d{1,3})\s*[Pp]\)/);
  if (!m) m = t.match(/(\d{1,4})[Ss5$]\s*(\d{1,3})\s*[Pp]/);
  if (!m) m = t.match(/(\d{1,4})[Ss5$]/);
  if (!m) return { s: null, p: null, raw: String(raw || '') };
  return {
    s: parseInt(m[1], 10),
    p: m[2] !== undefined ? parseInt(m[2], 10) : null,
    raw: String(raw || '')
  };
}

/* begin / finish: "2026-11-18 13:1..." 처럼 칸 폭 때문에 잘려서 보일 수 있음 */
export function parseDateCell(raw) {
  const clean = String(raw || '')
    .replace(/[OoQ]/g, '0')
    .replace(/[Il|]/g, '1')
    .trim();
  const dm = clean.match(/(\d{4})\s*[-–.]\s*(\d{1,2})\s*[-–.]\s*(\d{1,2})/);
  let date = null;
  let rest = clean;
  if (dm) {
    date = dm[1] + '-' + dayStr(parseInt(dm[2], 10)) + '-' + dayStr(parseInt(dm[3], 10));
    rest = clean.slice(dm.index + dm[0].length);
  }
  let time = '';
  let partial = false;
  const tm = rest.match(/(\d{1,2})\s*[:;.]\s*(\d{1,2})?/);
  if (tm) {
    const hh = String(parseInt(tm[1], 10));
    const mm = tm[2] === undefined ? '' : tm[2];
    time = hh + ':' + mm;
    partial = mm.length < 2;
  } else if (date) {
    partial = true;
  }
  if (/\.{2,}\s*$/.test(clean) || /\.$/.test(clean)) partial = true;
  return { date: date, time: time, partial: partial, raw: String(raw || '') };
}

function cleanName(s) {
  return String(s || '')
    .replace(/[|_]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^가-힣A-Za-z0-9 .·-]/g, '')
    .trim();
}

function cleanText(s) {
  return String(s || '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/[^A-Za-z0-9)\]]+$/, '')
    .trim();
}

/* 프로토콜: BETA- · L/R 처럼 기호가 뜻을 가지므로 그대로 둔다 */
function cleanProtocol(s) {
  return String(s || '')
    .replace(/[|]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s·.,:;]+/, '')
    .trim();
}

/* ------------------------------------------------------------- 본문 파싱 */

function cellTextsForColumn(columns, keys, key, texts) {
  const idx = keys.indexOf(key);
  if (idx < 0) return null;
  return texts[idx];
}

function emptyRowCheck(texts, rowIndex) {
  for (let c = 0; c < texts.length; c++) {
    const t = texts[c][rowIndex];
    if (t && t.length) return false;
  }
  return true;
}

export async function recognizeNeuroCapture(source, opts) {
  const options = opts || {};
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : function () {};
  const t0 = Date.now();

  onProgress({ phase: 'image', percent: 3, message: '이미지를 읽는 중…' });
  const img = await loadImage(source);
  const canvas = drawToCanvas(img);
  const w = canvas.width, h = canvas.height;
  const gray = toGray(canvas.getContext('2d').getImageData(0, 0, w, h), w, h);

  onProgress({ phase: 'layout', percent: 8, message: '표 영역을 찾는 중…' });
  const hlines = detectHorizontalLines(gray, w, h);
  const table = findTable(hlines, w);
  if (!table) {
    throw new Error('표(Training list)를 찾지 못했습니다. NeuroBrain의 훈련 목록이 보이도록 캡처해 주세요.');
  }

  let xs = detectColumnLines(gray, w, table.x0, table.x1, table.y0, table.y1);
  xs = xs.filter(function (x) { return x >= table.x0 - 2 && x <= table.x1 + 2; });
  const mergedXs = [];
  for (let i = 0; i < xs.length; i++) {
    if (!mergedXs.length) { mergedXs.push(xs[i]); continue; }
    const prev = mergedXs[mergedXs.length - 1];
    if (xs[i] - prev < 12) mergedXs[mergedXs.length - 1] = Math.round((prev + xs[i]) / 2);
    else mergedXs.push(xs[i]);
  }
  xs = mergedXs;
  if (!xs.length || Math.abs(xs[0] - table.x0) > 14) xs.unshift(table.x0);
  if (Math.abs(xs[xs.length - 1] - table.x1) > 14) xs.push(table.x1);

  const columns = [];
  for (let i = 0; i + 1 < xs.length; i++) {
    if (xs[i + 1] - xs[i] >= 16) columns.push({ x0: xs[i], x1: xs[i + 1] });
  }
  if (columns.length < 4) {
    throw new Error('표의 열 경계를 읽지 못했습니다. 표 전체가 잘리지 않게 캡처해 주세요.');
  }

  /* 행: 표 안에서 글자가 있는 줄을 모두 찾는다 (빈 줄은 자동 제외) */
  const bandTop = Math.max(0, table.y0 - 160);
  const bands = detectTextBands(gray, w, h, table.x0 + 3, table.x1 - 3, bandTop, table.y1, xs);
  if (bands.length < 2) {
    throw new Error('표의 내용을 찾지 못했습니다. 화면이 흐리지 않은지 확인해 주세요.');
  }

  /* 헤더 글자 읽기 — 후보 몇 줄 중 헤더 이름이 가장 많이 읽히는 줄을 헤더로 본다 */
  onProgress({ phase: 'engine', percent: 14, message: 'OCR 엔진 준비 중…' });
  const eng = await getWorker('eng', function (m) {
    onProgress({ phase: 'engine', percent: 16, message: m });
  });

  const headerCandidates = bands.slice(0, 8);
  let headerIndex = 0;
  let headerLabels = [];
  let bestScore = -1;
  for (let i = 0; i < headerCandidates.length; i++) {
    const strip = buildStrip(columns.map(function (c) {
      return buildCellImage(gray, w, h, c.x0 + 2, headerCandidates[i].y0, c.x1 - 1, headerCandidates[i].y1);
    }));
    const out = await ocrStrip(eng, strip, 'header');
    let score = 0;
    out.texts.forEach(function (t) { if (headerKey(t)) score++; });
    if (score > bestScore) { bestScore = score; headerIndex = i; headerLabels = out.texts; }
    if (score >= 5) break;
  }
  const headerRow = bands[headerIndex];
  const dataRows = bands.slice(headerIndex + 1);
  if (!dataRows.length) {
    throw new Error('표에 훈련 기록 줄이 없습니다.');
  }
  const debugRows = bands.map(function (b) { return [b.y0, b.y1]; });

  const resolved = resolveColumnKeys(columns, headerLabels);
  const keys = resolved.keys;

  onProgress({ phase: 'columns', percent: 26, message: '훈련 기록을 읽는 중…' });

  /* 열 단위로 한 번에 읽기 */
  const colTexts = [];
  const colConf = [];
  const needRetry = [];
  const order = [];

  for (let c = 0; c < columns.length; c++) {
    const key = keys[c];
    if (!key) { colTexts.push(new Array(dataRows.length).fill('')); colConf.push(new Array(dataRows.length).fill(0)); continue; }
    if (key === 'trainee') { order.push({ c: c, key: key, lang: 'kor' }); continue; }
    if (['no', 'seq', 'id', 'protocol', 'exercise', 'score', 'begin', 'finish', 'electrodes'].indexOf(key) < 0) {
      colTexts.push(new Array(dataRows.length).fill(''));
      colConf.push(new Array(dataRows.length).fill(0));
      continue;
    }
    order.push({ c: c, key: key, lang: 'eng' });
  }

  let done = 0;
  for (let o = 0; o < order.length; o++) {
    const job = order[o];
    const worker = await getWorker(job.lang, function () {});
    const cellTarget = job.lang === 'kor' ? 58 : (['no', 'seq', 'id', 'score'].indexOf(job.key) >= 0 ? 58 : 44);
    const cells = dataRows.map(function (r) {
      return buildCellImage(gray, w, h, columns[job.c].x0 + 2, r.y0 + 1, columns[job.c].x1 - 1, r.y1 - 1, cellTarget);
    });
    const strip = buildStrip(cells);
    const out = await ocrStrip(worker, strip, job.key);
    colTexts[job.c] = out.texts;
    colConf[job.c] = out.conf;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] && (!out.texts[i] || out.conf[i] < 60)) {
        needRetry.push({ c: job.c, row: i, key: job.key, lang: job.lang });
      }
    }
    done++;
    onProgress({
      phase: 'columns',
      percent: 26 + Math.round((done / Math.max(1, order.length)) * 52),
      message: (KEY_LABEL[job.key] || job.key) + ' 열 읽는 중…'
    });
  }

  /* 비었거나 흐릿한 칸은 한 칸씩 다시 읽기 */
  const retryLimit = Math.min(needRetry.length, 28);
  for (let i = 0; i < retryLimit; i++) {
    const job = needRetry[i];
    const worker = await getWorker(job.lang, function () {});
    const r = dataRows[job.row];
    const cell = buildCellImage(gray, w, h, columns[job.c].x0 + 2, r.y0 + 1, columns[job.c].x1 - 1, r.y1 - 1);
    if (!cell) continue;
    const one = await ocrSingle(worker, cell, job.key);
    if (one.text && (!colTexts[job.c][job.row] || one.conf > colConf[job.c][job.row])) {
      colTexts[job.c][job.row] = one.text;
      colConf[job.c][job.row] = one.conf;
    }
  }

  /* 상단 회원 정보 줄 (표 위쪽 띠) */
  onProgress({ phase: 'member', percent: 82, message: '회원 정보를 확인하는 중…' });
  let member = { name: '', memberCode: '', gender: '', birthday: '', dateFrom: '', dateTo: '' };
  let barInfo = { found: false, texts: [] };
  const barBottom = table.y0 - 4;
  const barTop = Math.max(0, table.y0 - 96);
  if (barBottom - barTop > 14) {
    const bx0 = Math.max(0, table.x0 - 8);
    const bx1 = Math.min(w, table.x1);
    const barGray = gray;
    const barCanvas = document.createElement('canvas');
    const bw = bx1 - bx0;
    const bh = barBottom - barTop;
    const scale = Math.max(2, Math.min(3, Math.round(120 / Math.max(24, bh * 3))));
    barCanvas.width = bw * 2;
    barCanvas.height = bh * 2;
    const bg = barCanvas.getContext('2d');
    bg.imageSmoothingEnabled = false;
    const tmp = document.createElement('canvas');
    tmp.width = bw;
    tmp.height = bh;
    const tg = tmp.getContext('2d');
    const imgData = tg.createImageData(bw, bh);
    const px = imgData.data;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const v = barGray[(barTop + y) * w + bx0 + x];
        const val = v < 205 ? 0 : 255;
        const p = (y * bw + x) * 4;
        px[p] = val; px[p + 1] = val; px[p + 2] = val; px[p + 3] = 255;
      }
    }
    tg.putImageData(imgData, 0, 0);
    bg.fillStyle = '#ffffff';
    bg.fillRect(0, 0, barCanvas.width, barCanvas.height);
    bg.drawImage(tmp, 0, 0, bw * 2, bh * 2);

    try {
      const korWorker = await getWorker('kor', function () {});
      await korWorker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
      const kres = await korWorker.recognize(barCanvas);
      const korText = kres && kres.data ? String(kres.data.text || '') : '';
      await eng.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: '' });
      const eres = await eng.recognize(barCanvas);
      const engText = eres && eres.data ? String(eres.data.text || '') : '';
      barInfo = { found: true, korText: korText, engText: engText };

      const joined = (engText + ' ' + korText).replace(/\s+/g, ' ');
      const code = joined.match(/\d{2,3}\s*-\s*\d{2,4}\s*-\s*\d{3,4}\s*-\s*\d{2,4}/);
      if (code) member.memberCode = code[0].replace(/\s+/g, '');
      const dates = joined.match(/\d{4}\s*[-.]\s*\d{1,2}\s*[-.]\s*\d{1,2}/g) || [];
      const parsedDates = [];
      dates.forEach(function (d) {
        const p = parseDateCell(d);
        if (p.date && parsedDates.indexOf(p.date) < 0) parsedDates.push(p.date);
      });
      if (parsedDates.length >= 3) {
        member.birthday = parsedDates[0];
        member.dateFrom = parsedDates[1];
        member.dateTo = parsedDates[2];
      } else if (parsedDates.length === 2) {
        member.dateFrom = parsedDates[0];
        member.dateTo = parsedDates[1];
      } else if (parsedDates.length === 1) {
        member.birthday = parsedDates[0];
      }
      const gender = joined.match(/(?:^|\s)([FM])(?:\s|$)/);
      if (gender) member.gender = gender[1];

      const hangulRuns = (korText.match(/[가-힣]{2,5}/g) || []).filter(function (n) {
        return ['이름', '회원', '센터', '기간', '생년', '월일', '성별'].indexOf(n) < 0;
      });
      if (hangulRuns.length) member.name = hangulRuns[0];
    } catch (err) {
      barInfo = { found: false, error: String(err && err.message || err) };
    }
  }

  /* ---------------------------------------------------------- 세션 묶기 */
  const txt = function (key, rowIndex) {
    const idx = keys.indexOf(key);
    if (idx < 0) return '';
    return colTexts[idx] ? (colTexts[idx][rowIndex] || '') : '';
  };
  const confOf = function (key, rowIndex) {
    const idx = keys.indexOf(key);
    if (idx < 0) return 0;
    return colConf[idx] ? (colConf[idx][rowIndex] || 0) : 0;
  };

  const sessions = [];
  let current = null;

  for (let i = 0; i < dataRows.length; i++) {
    const noRaw = txt('no', i);
    const seqRaw = txt('seq', i);
    const exRaw = txt('exercise', i);
    const scoreRaw = txt('score', i);
    const noDigits = toInt(noRaw);
    const hasContent = !!(seqRaw || exRaw || scoreRaw);
    const isNewSession = noDigits !== null && /#/.test(noRaw) && hasContent;

    if (isNewSession) {
      const begin = parseDateCell(txt('begin', i));
      const finish = parseDateCell(txt('finish', i));
      current = {
        no: noDigits,
        begin: begin,
        finish: finish,
        date: begin.date || finish.date || '',
        trainee: cleanName(txt('trainee', i)),
        electrodes: cleanText(txt('electrodes', i)),
        exercises: []
      };
      sessions.push(current);
    }
    if (!current || !hasContent) continue;

    const sc = parseScoreText(scoreRaw);
    const seq = toInt(seqRaw);
    const exText = cleanText(exRaw);
    const protoText = cleanProtocol(txt('protocol', i));
    if (!exText && sc.s === null && seq === null) continue;

    current.exercises.push({
      seq: seq === null ? current.exercises.length + 1 : seq,
      protocol: protoText,
      exercise: exText,
      score_s: sc.s,
      score_p: sc.p,
      raw_score: sc.raw,
      confidence: Math.round(Math.min(
        confOf('exercise', i) || 0,
        confOf('score', i) || 0,
        confOf('seq', i) || 0
      ))
    });
    if (!current.electrodes) current.electrodes = cleanText(txt('electrodes', i));
  }

  /* 세션 요약 계산 */
  sessions.forEach(function (s) {
    let totalS = 0, totalP = 0, sCount = 0, pCount = 0;
    const protocols = [];
    s.exercises.forEach(function (ex) {
      if (ex.score_s !== null) { totalS += ex.score_s; sCount++; }
      if (ex.score_p !== null) { totalP += ex.score_p; pCount++; }
      if (ex.protocol && protocols.indexOf(ex.protocol) < 0) protocols.push(ex.protocol);
    });
    s.total_score_s = sCount ? totalS : null;
    s.total_points_p = pCount ? totalP : null;
    s.protocols = protocols;
    s.step_count = s.exercises.length;
    s.low_confidence = s.exercises.some(function (ex) { return ex.confidence > 0 && ex.confidence < 40; });
  });

  /* 회원 이름: 상단 콤보박스 글자보다 Trainee 칸 글자가 더 잘 읽히므로 그쪽을 우선 */
  const traineeNames = sessions
    .map(function (s) { return s.trainee; })
    .filter(function (n) { return /[가-힣]/.test(n || ''); });
  if (traineeNames.length) {
    const counts = {};
    traineeNames.forEach(function (n) { counts[n] = (counts[n] || 0) + 1; });
    let bestName = '';
    let bestCount = 0;
    Object.keys(counts).forEach(function (n) {
      if (counts[n] > bestCount) { bestName = n; bestCount = counts[n]; }
    });
    member.nameFromBar = member.name;
    member.name = bestName;
    member.nameCandidates = Object.keys(counts);
  }

  const warnings = [];
  if (resolved.mode === 'order') {
    warnings.push('헤더 글자를 충분히 읽지 못해 프로그램의 기본 열 순서로 이름을 붙였습니다. 값이 이상하면 직접 고쳐 주세요.');
  }
  if (!member.name) {
    warnings.push('상단 회원 이름을 읽지 못했습니다. 회원을 직접 선택해 주세요.');
  }
  sessions.forEach(function (s) {
    if (!s.date) warnings.push('#' + s.no + ' 회차의 훈련 날짜를 읽지 못했습니다.');
  });

  onProgress({ phase: 'done', percent: 100, message: '인식 완료' });

  return {
    ok: sessions.length > 0,
    member: member,
    sessions: sessions,
    table: {
      x0: table.x0, x1: table.x1, y0: table.y0, y1: table.y1,
      columns: columns.map(function (c, i) { return { key: keys[i], label: headerLabels[i] || '', x0: c.x0, x1: c.x1 }; }),
      rows: dataRows.length,
      headerMode: resolved.mode
    },
    warnings: warnings,
    debug: {
      imgW: w, imgH: h,
      tableRows: table.rows.length,
      textRows: dataRows.length,
      rows: debugRows,
      columnXs: xs,
      headerLabels: headerLabels,
      headerScore: bestScore,
      headerIndex: headerIndex
    },
    elapsedMs: Date.now() - t0
  };
}

/* ------------------------------------------------------------ 표시 도우미 */

export function sessionDetailsText(details) {
  if (!details) return '';
  const parts = [];
  if (details.total_score_s !== null && details.total_score_s !== undefined) parts.push(details.total_score_s + 'S');
  if (details.total_points_p !== null && details.total_points_p !== undefined) parts.push(details.total_points_p + 'P');
  return parts.join(' · ');
}

export function protocolSummary(details) {
  if (!details || !details.exercises || !details.exercises.length) return '';
  const list = [];
  details.exercises.forEach(function (ex) {
    if (ex.protocol && list.indexOf(ex.protocol) < 0) list.push(ex.protocol);
  });
  return list.join(' · ');
}
