/* =====================================================================
   MINA WORLD App — '하루 한 스푼, 뇌과학' 피드 로더
   ---------------------------------------------------------------------
   홈페이지(www.minaworld.co.kr)의 연재 아티클을 앱 안에서 읽을 수 있도록
   두 저장소를 합쳐 하나의 목록으로 제공합니다.

   1) ../data/spoon-feed.json  — 매일 08:30 새 아티클 스케줄이 갱신하는 연재 피드
   2) ../data/articles.json    — 미나 님이 /admin.html 에서 직접 올린 글(있을 때만)

   · 항상 cache: 'no-store' 로 받아 서비스워커/HTTP 캐시에 묶이지 않게 합니다.
   · 두 목록은 id 기준으로 중복을 제거하고 date 내림차순(최신순)으로 정렬합니다.
   ===================================================================== */

var FEED_URL = '../data/spoon-feed.json';
var USER_URL = '../data/articles.json';
var SITE = 'https://www.minaworld.co.kr';

var cache = null;
var pending = null;

function str(value) {
  return value === null || value === undefined ? '' : String(value);
}

function trim(value) {
  return str(value).replace(/\s+/g, ' ').trim();
}

function bust(url) {
  return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'v=' + Date.now();
}

function fetchJson(url) {
  return fetch(bust(url), { cache: 'no-store' }).then(function (res) {
    if (!res || !res.ok) return null;
    return res.json();
  }).catch(function (err) {
    console.warn('[MINA] 아티클 피드 조회 실패', url, err && err.message);
    return null;
  });
}

/* '월 · 뇌과학 기초' → '월요일 · 뇌과학 기초' */
function normalizeCategory(label) {
  var text = trim(label);
  if (!text) return '뇌과학 정보';
  if (text.indexOf('요일') >= 0) return text;
  var m = text.match(/^([월화수목금토일])\s*[·⋅ㆍ\-]\s*(.+)$/);
  if (m) return m[1] + '요일 · ' + m[2];
  return text;
}

/* 문장 단위로 나눈다 (lookbehind 없는 구현 — 구형 iOS에서도 문법 오류가 나지 않게) */
function splitSentences(text) {
  var body = trim(text);
  if (!body) return [];
  var marks = '.!?';
  var parts = [];
  var buf = '';
  for (var i = 0; i < body.length; i++) {
    var ch = body.charAt(i);
    buf += ch;
    if (marks.indexOf(ch) >= 0) {
      var next = body.charAt(i + 1);
      if (next === ' ' || next === '') {
        parts.push(buf);
        buf = '';
      }
    }
  }
  if (trim(buf)) parts.push(buf);
  var out = [];
  for (var p = 0; p < parts.length; p++) {
    var line = trim(parts[p]);
    if (line.length > 7) out.push(line);
  }
  if (!out.length && body) out = [body];
  return out;
}

function stripMarkdown(text) {
  return trim(str(text).replace(/\*\*/g, '').replace(/`/g, '').replace(/^\s*#{1,6}\s*/, ''));
}

/* /admin.html 에서 직접 쓴 글(마크다운)을 연재 피드와 같은 모양으로 변환 */
function userArticle(raw) {
  if (!raw || !raw.id || !raw.title) return null;
  var sections = [];
  var current = null;
  var lines = str(raw.content).split(/\r?\n/);
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var head = line.match(/^\s*##+\s+(.+)$/);
    if (head) {
      current = { heading: stripMarkdown(head[1]), body: '' };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { heading: '들어가며', body: '' };
      sections.push(current);
    }
    var bullet = line.match(/^\s*[-*]\s+(.+)$/);
    var quote = line.match(/^\s*>\s*(.+)$/);
    var piece = '';
    if (bullet) piece = '• ' + stripMarkdown(bullet[1]);
    else if (quote) piece = '▸ ' + stripMarkdown(quote[1]);
    else piece = stripMarkdown(line);
    if (!piece) continue;
    current.body = current.body ? current.body + '\n' + piece : piece;
  }
  var kept = [];
  for (var k = 0; k < sections.length; k++) {
    if (sections[k].body) kept.push(sections[k]);
  }
  var date = trim(raw.date).slice(0, 10);
  return {
    id: String(raw.id),
    date: date,
    categoryLabel: normalizeCategory(raw.category),
    title: trim(raw.title),
    summary: trim(raw.summary) || trim(raw.execSummary),
    tldr: splitSentences(raw.execSummary || raw.summary),
    sections: kept,
    url: SITE + '/article.html?id=' + encodeURIComponent(raw.id),
    source: 'admin'
  };
}

function normalizeFeedItem(raw) {
  if (!raw || !raw.id || !raw.title) return null;
  var sections = [];
  var rawSections = Array.isArray(raw.sections) ? raw.sections : [];
  for (var i = 0; i < rawSections.length; i++) {
    var sec = rawSections[i] || {};
    if (!trim(sec.body)) continue;
    sections.push({ heading: trim(sec.heading), body: str(sec.body).replace(/\r/g, '') });
  }
  var tldr = [];
  var rawTldr = Array.isArray(raw.tldr) ? raw.tldr : [];
  for (var t = 0; t < rawTldr.length; t++) {
    var item = trim(rawTldr[t]);
    if (item) tldr.push(item);
  }
  var url = trim(raw.url);
  if (!url) url = SITE + '/' + String(raw.id) + '.html';
  return {
    id: String(raw.id),
    date: trim(raw.date).slice(0, 10),
    categoryLabel: normalizeCategory(raw.categoryLabel),
    title: trim(raw.title),
    summary: trim(raw.summary),
    tldr: tldr,
    sections: sections,
    url: url,
    source: 'feed'
  };
}

function sortByDate(list) {
  return list.sort(function (a, b) {
    if (a.date === b.date) return String(a.id) < String(b.id) ? 1 : -1;
    return a.date < b.date ? 1 : -1;
  });
}

function load() {
  if (pending) return pending;
  pending = Promise.all([fetchJson(FEED_URL), fetchJson(USER_URL)]).then(function (results) {
    var feed = results[0];
    var user = results[1];
    var merged = [];
    var seen = {};

    var feedList = Array.isArray(feed) ? feed : (feed && Array.isArray(feed.articles) ? feed.articles : []);
    for (var i = 0; i < feedList.length; i++) {
      var item = normalizeFeedItem(feedList[i]);
      if (!item || seen[item.id]) continue;
      seen[item.id] = true;
      merged.push(item);
    }

    var userList = Array.isArray(user) ? user : (user && Array.isArray(user.articles) ? user.articles : []);
    for (var j = 0; j < userList.length; j++) {
      var extra = userArticle(userList[j]);
      if (!extra || seen[extra.id]) continue;
      seen[extra.id] = true;
      merged.push(extra);
    }

    cache = sortByDate(merged);
    return cache;
  }).then(function (list) {
    pending = null;
    return list;
  }).catch(function (err) {
    pending = null;
    console.warn('[MINA] 아티클 병합 실패', err && err.message);
    return cache || [];
  });
  return pending;
}

function clone(article) {
  return {
    id: article.id,
    date: article.date,
    categoryLabel: article.categoryLabel,
    title: article.title,
    summary: article.summary,
    tldr: article.tldr.slice(),
    sections: article.sections.map(function (s) { return { heading: s.heading, body: s.body }; }),
    url: article.url,
    source: article.source
  };
}

/* 연재 아티클 전체 (최신순) */
export async function listSpoonArticles() {
  var list = cache || await load();
  return (list || []).map(clone);
}

/* id 로 아티클 1편 */
export async function getSpoonArticle(id) {
  var list = cache || await load();
  if (!list) return null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].id === id) return clone(list[i]);
  }
  return null;
}

/* 가장 최근 글 1편 (홈 카드용) */
export async function latestSpoonArticle() {
  var list = cache || await load();
  if (!list || !list.length) return null;
  return clone(list[0]);
}

/* 날짜 표기: 2026-11-17 → 2026.11.17 */
export function spoonDateLabel(date) {
  return str(date).slice(0, 10).replace(/-/g, '.');
}

/* 카테고리 라벨에서 요일 배지 텍스트만: '화요일 · 스트레스와 감정' → '화요일' */
export function spoonWeekday(label) {
  var m = trim(label).match(/^([월화수목금토일])요일/);
  if (m) return m[1] + '요일';
  return trim(label).split('·')[0].trim();
}
