/* =====================================================================
   MINA WORLD App — 공유 헬퍼 (카카오톡 · 문자 · 링크 복사)
   ---------------------------------------------------------------------
   카카오 JS SDK 키가 아직 없으므로, 아이폰/안드로이드에서 바로 되는
   세 가지 경로를 제공합니다.

   1) 카톡 · 앱 공유 : navigator.share → OS 기본 공유 시트(카톡·문자·메모)
   2) 문자(SMS)      : sms: URI (iOS는 'sms:&body=', 그 외는 'sms:?body=')
   3) 링크 복사      : navigator.clipboard → 실패 시 textarea + execCommand

   · 버튼은 data-share="sheet|native|sms|copy|copytext" + data-share-* 값만
     달아 두면 문서 단위 위임 리스너가 처리합니다(카드·상세 어디서든 동작).
   · 취소(AbortError)는 조용히 무시하고, 미지원 환경은 앱 내 시트로 안내합니다.
   ===================================================================== */
import { esc, icon, openSheet, toast, track } from './ui.js?v=2.0.36';

var SITE = 'https://www.minaworld.co.kr';
var DEFAULT_KICKER = 'MINA WORLD 하루 한 스푼';

function str(value) {
  return value === null || value === undefined ? '' : String(value);
}

function isIOS() {
  try {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  } catch (err) {
    return false;
  }
}

export function normalizeShare(raw) {
  var source = raw || {};
  var url = str(source.url) || SITE + '/app/';
  var title = str(source.title) || 'MINA WORLD';
  return {
    id: str(source.id) || url,
    kicker: str(source.kicker) || DEFAULT_KICKER,
    title: title,
    summary: str(source.summary || source.text),
    url: url
  };
}

/* 카톡·문자에 그대로 붙여넣기 좋은 문구 */
export function shareBody(raw) {
  var p = normalizeShare(raw);
  var lines = ['[' + p.kicker + ']', p.title];
  if (p.summary) lines.push(p.summary);
  lines.push(p.url);
  return lines.join('\n');
}

/* 문자 앱 바로 열기 — iOS는 'sms:&body=', Android/기타는 'sms:?body=' */
export function smsHref(raw) {
  var body = encodeURIComponent(shareBody(raw));
  return (isIOS() ? 'sms:&body=' : 'sms:?body=') + body;
}

/* 클립보드 복사: Clipboard API 우선, iOS Safari·비보안 컨텍스트는 textarea 폴백 */
function legacyCopy(text) {
  var area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1200px';
  area.style.left = '0';
  area.style.opacity = '0';
  document.body.appendChild(area);
  var ok = false;
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    ok = document.execCommand('copy');
  } catch (err) {
    ok = false;
  }
  if (area.parentNode) area.parentNode.removeChild(area);
  return ok;
}

export function copyToClipboard(text) {
  var target = str(text);
  if (!target) return Promise.resolve(false);
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(target).then(function () {
        return true;
      }).catch(function () {
        return legacyCopy(target);
      });
    }
  } catch (err) { /* 아래 폴백 */ }
  return Promise.resolve(legacyCopy(target));
}

/* 버튼에 붙일 data 속성 묶음 */
export function shareAttrs(raw) {
  var p = normalizeShare(raw);
  return 'data-share-id="' + esc(p.id) + '" data-share-url="' + esc(p.url) +
    '" data-share-title="' + esc(p.title) + '" data-share-summary="' + esc(p.summary) +
    '" data-share-kicker="' + esc(p.kicker) + '"';
}

function payloadFrom(el) {
  return normalizeShare({
    id: el.getAttribute('data-share-id'),
    url: el.getAttribute('data-share-url'),
    title: el.getAttribute('data-share-title'),
    summary: el.getAttribute('data-share-summary'),
    kicker: el.getAttribute('data-share-kicker')
  });
}

/* 1탭 공유 바 — 카톡·앱 / 문자 / 링크 복사 (375px 3등분 그리드) */
export function shareBar(raw, options) {
  var p = normalizeShare(raw);
  var attrs = shareAttrs(p);
  var variant = options && options.variant ? ' is-' + options.variant : '';
  return '<div class="spoon-share-bar' + variant + '" role="group" aria-label="공유">' +
    '<button type="button" class="share-btn" data-share="native" ' + attrs + '>' +
      icon('share', 16) + '<span>카톡·앱 공유</span></button>' +
    '<a class="share-btn" href="' + esc(smsHref(p)) + '" data-share="sms" ' + attrs + '>' +
      icon('message', 16) + '<span>문자 보내기</span></a>' +
    '<button type="button" class="share-btn" data-share="copy" ' + attrs + '>' +
      icon('copy', 16) + '<span>링크 복사</span></button>' +
  '</div>';
}

/* 상세 상단용 아이콘 버튼 */
export function shareIconButton(raw) {
  var p = normalizeShare(raw);
  return '<button type="button" class="icon-btn share-nav-btn" data-share="sheet" ' +
    shareAttrs(p) + ' aria-label="공유" title="공유">' + icon('share', 19) + '</button>';
}

/* 카드·섹션 헤더용 작은 칩 버튼 */
export function shareChipButton(raw, label) {
  var p = normalizeShare(raw);
  return '<button type="button" class="share-chip" data-share="sheet" ' +
    shareAttrs(p) + ' aria-label="공유">' + icon('share', 13) +
    '<span>' + esc(label || '공유') + '</span></button>';
}

/* OS 공유 시트 (카톡·문자·메모 선택) */
export function nativeShare(raw) {
  var p = normalizeShare(raw);
  var shareFn = navigator.share;
  if (typeof shareFn !== 'function') {
    return copyToClipboard(shareBody(p)).then(function (ok) {
      track('spoon_share', { id: p.id, method: ok ? 'fallback_copy' : 'fallback_fail' });
      toast(ok
        ? '이 환경은 카톡 공유 시트가 없어요. 제목·요약과 링크를 복사했어요.'
        : '카톡에 붙여넣을 링크를 복사하지 못했어요. 아래 공유 버튼을 눌러 주세요.');
      return false;
    });
  }
  var payload = {
    title: p.title,
    text: p.summary ? p.title + '\n' + p.summary : p.title,
    url: p.url
  };
  var result;
  try {
    result = shareFn.call(navigator, payload);
  } catch (err) {
    result = Promise.reject(err);
  }
  return Promise.resolve(result).then(function () {
    track('spoon_share', { id: p.id, method: 'native' });
    return true;
  }).catch(function (err) {
    if (err && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return false;
    return copyToClipboard(shareBody(p)).then(function (ok) {
      track('spoon_share', { id: p.id, method: ok ? 'share_error_copy' : 'share_error' });
      toast(ok
        ? '공유 시트를 열지 못해 제목·요약과 링크를 복사했어요. 카톡에 붙여넣어 주세요.'
        : '공유 시트를 열지 못했어요. 링크 복사를 이용해 주세요.');
      return false;
    });
  });
}

function optionRow(kind, glyph, title, desc, tag) {
  var inner = '<span class="share-opt-ico">' + icon(glyph, 18) + '</span>' +
    '<span class="share-opt-text"><strong>' + esc(title) + '</strong>' +
    '<span>' + esc(desc) + '</span></span>' +
    (tag === 'a' ? '' : icon('chevronRight', 15));
  if (tag === 'a') {
    return '<a class="share-opt" data-share-opt="' + kind + '">' + inner + '</a>';
  }
  return '<button type="button" class="share-opt" data-share-opt="' + kind + '">' + inner + '</button>';
}

/* 앱 내 공유 바텀시트 */
export function openShareSheet(raw, options) {
  var p = normalizeShare(raw);
  var opts = options || {};
  var note = str(opts.note);
  var content =
    (note ? '<p class="share-note">' + esc(note) + '</p>' : '') +
    '<div class="share-preview">' +
      '<span class="share-preview-tag">' + esc(p.kicker) + '</span>' +
      '<strong class="share-preview-title">' + esc(p.title) + '</strong>' +
      (p.summary ? '<p class="share-preview-desc">' + esc(p.summary) + '</p>' : '') +
      '<span class="share-preview-url">' + esc(p.url) + '</span>' +
    '</div>' +
    '<div class="share-options">' +
      optionRow('native', 'share', '카카오톡 · 다른 앱으로 공유',
        '아이폰·안드로이드 공유 시트에서 카톡·문자·메모를 고르세요', 'button') +
      '<a class="share-opt" href="' + esc(smsHref(p)) + '" data-share-opt="sms">' +
        '<span class="share-opt-ico">' + icon('message', 18) + '</span>' +
        '<span class="share-opt-text"><strong>문자(SMS)로 바로 보내기</strong>' +
        '<span>문자 앱이 열리고 제목·요약·링크가 입력됩니다</span></span>' +
      '</a>' +
      optionRow('copy', 'copy', '링크만 복사하기',
        '짧은 주소 한 줄만 복사합니다', 'button') +
      optionRow('copytext', 'file', '제목·요약 + 링크 함께 복사',
        '카톡 채팅창에 그대로 붙여넣기 좋은 문구입니다', 'button') +
    '</div>' +
    '<p class="share-tip">카톡 채팅방에 붙여넣으면 제목과 링크가 함께 전달됩니다.</p>';

  return openSheet({
    title: opts.title || '공유하기',
    subtitle: opts.subtitle || '카카오톡 · 문자 · 링크 복사',
    content: content,
    onMount: function (el) {
      var buttons = el.querySelectorAll('[data-share-opt]');
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener('click', function () {
          var kind = this.getAttribute('data-share-opt');
          if (kind === 'sms') {
            track('spoon_share', { id: p.id, method: 'sms' });
            return;
          }
          if (kind === 'native') {
            nativeShare(p);
            return;
          }
          if (kind === 'copytext') {
            copyToClipboard(shareBody(p)).then(function (ok) {
              track('spoon_share', { id: p.id, method: ok ? 'copy_text' : 'copy_text_fail' });
              toast(ok
                ? '제목·요약과 링크를 함께 복사했어요. 카톡 채팅방에 붙여넣어 보세요!'
                : '복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.', ok ? 'success' : 'error');
            });
            return;
          }
          copyToClipboard(p.url).then(function (ok) {
            track('spoon_share', { id: p.id, method: ok ? 'copy_link' : 'copy_link_fail' });
            toast(ok
              ? '링크가 복사되었어요. 카톡이나 문자에 바로 붙여넣어 보세요!'
              : '복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.', ok ? 'success' : 'error');
          });
        });
      }
    }
  });
}

/* 문서 단위 위임 — data-share 버튼이면 어디서든 동작 */
function onClick(event) {
  var node = event.target;
  var el = node && node.closest ? node.closest('[data-share]') : null;
  if (!el) return;
  var method = el.getAttribute('data-share');
  var payload = payloadFrom(el);
  if (method === 'sms') {
    /* 문자 앱 실행은 브라우저 기본 동작에 맡기고, 기록만 남깁니다 */
    track('spoon_share', { id: payload.id, method: 'sms' });
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (method === 'native') {
    nativeShare(payload);
    return;
  }
  if (method === 'copytext') {
    copyToClipboard(shareBody(payload)).then(function (ok) {
      track('spoon_share', { id: payload.id, method: ok ? 'copy_text' : 'copy_text_fail' });
      toast(ok
        ? '제목·요약과 링크를 함께 복사했어요. 카톡 채팅방에 붙여넣어 보세요!'
        : '복사하지 못했어요. 링크를 길게 눌러 복사해 주세요.', ok ? 'success' : 'error');
    });
    return;
  }
  if (method === 'copy') {
    copyToClipboard(payload.url).then(function (ok) {
      track('spoon_share', { id: payload.id, method: ok ? 'copy_link' : 'copy_link_fail' });
      toast(ok
        ? '링크가 복사되었어요. 카톡이나 문자에 바로 붙여넣어 보세요!'
        : '복사하지 못했어요. 주소를 길게 눌러 복사해 주세요.', ok ? 'success' : 'error');
    });
    return;
  }
  openShareSheet(payload);
}

if (typeof document !== 'undefined') {
  document.addEventListener('click', onClick, false);
}
