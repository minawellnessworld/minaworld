/* 관리자 → 콘텐츠: 공지 · 이벤트 · 뇌과학 · 웰니스 · FAQ · 교육 안내 등록/수정/삭제 */
import { COMMUNITY_CATEGORIES, categoryLabel } from '../../config.js?v=2.0.22';
import { state, listPosts, createPost, updatePost, deletePost, friendlyError } from '../../store.js?v=2.0.22';
import { logAudit } from '../../store-security.js?v=2.0.22';
import {
  icon, esc, fmtDate, toast, badge, openSheet, closeSheet, confirmDialog, setBusy, noticeBox
} from '../../ui.js?v=2.0.22';

function opt(value, label, selected) {
  return '<option value="' + esc(value) + '"' + (selected === value ? ' selected' : '') + '>' + esc(label) + '</option>';
}

function table(headers, rows) {
  return '<div class="table-scroll"><table class="data-table"><thead><tr>' +
    headers.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
    '</tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function emptyRow(cols, text) {
  return '<tr><td colspan="' + cols + '" class="table-empty">' + esc(text) + '</td></tr>';
}

var EDITOR_CATEGORIES = ['notice', 'event', 'neuroscience', 'wellness', 'faq', 'academy_guide', 'column', 'review', 'qna'];

export async function build(ctx) {
  var filter = ctx.query.get('cat') || '';
  var posts = [];
  try {
    posts = await listPosts(filter ? { category: filter } : {});
  } catch (err) {
    console.warn(err);
  }

  var categoryOptions = EDITOR_CATEGORIES.map(function (id) {
    return opt(id, categoryLabel(id));
  }).join('');

  var filterBar = '<option value="">전체 카테고리</option>' + COMMUNITY_CATEGORIES.map(function (c) {
    return opt(c.id, c.label, filter);
  }).join('');

  var rows = posts.map(function (p) {
    return '<tr data-post="' + esc(p.id) + '">' +
      '<td class="muted small">' + esc(categoryLabel(p.category)) + '</td>' +
      '<td><strong>' + esc(p.title) + '</strong>' +
        (p.is_pinned ? ' ' + badge('고정', 'yellow') : '') +
        (p.is_hidden ? ' ' + badge('숨김', 'red') : '') +
        '<br><span class="muted small">' + esc(String(p.body || '').slice(0, 60)) + (String(p.body || '').length > 60 ? '…' : '') + '</span></td>' +
      '<td class="muted small">' + esc(p.author_name || '') + '</td>' +
      '<td class="muted small">' + fmtDate(p.created_at) + '</td>' +
      '<td>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-edit="' + esc(p.id) + '">수정</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-pin="' + esc(p.id) + '">' + (p.is_pinned ? '고정해제' : '고정') + '</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-hide="' + esc(p.id) + '">' + (p.is_hidden ? '숨김해제' : '숨김') + '</button>' +
        '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-del="' + esc(p.id) + '">삭제</button>' +
      '</td>' +
    '</tr>';
  }).join('');

  var html =
    '<section class="admin-section">' +
      '<h2 class="admin-h2">콘텐츠 등록</h2>' +
      '<p class="muted small">공지사항 · 이벤트 · 뇌과학 콘텐츠 · 웰니스 정보 · 자주 묻는 질문(FAQ) · 교육 안내를 앱 커뮤니티에 바로 게시합니다.</p>' +
      '<div class="admin-form">' +
        '<div class="form-grid">' +
          '<label class="field"><span class="field-label">카테고리</span><select id="ct-cat">' + categoryOptions + '</select></label>' +
          '<label class="field field-inline"><span class="field-label">상단 고정</span>' +
            '<label class="switch"><input type="checkbox" id="ct-pin"><span></span></label></label>' +
        '</div>' +
        '<label class="field"><span class="field-label">제목</span><input type="text" id="ct-title" placeholder="제목"></label>' +
        '<label class="field"><span class="field-label">내용</span><textarea id="ct-body" rows="5" placeholder="본문"></textarea></label>' +
        '<button type="button" class="btn btn-primary" id="ct-submit">게시</button>' +
      '</div>' +
    '</section>' +
    '<section class="admin-section">' +
      '<div class="admin-toolbar">' +
        '<select id="ct-filter">' + filterBar + '</select>' +
        '<span class="muted small">' + posts.length + '건</span>' +
      '</div>' +
      table(['카테고리', '제목', '작성자', '작성일', ''], rows || emptyRow(5, '게시글이 없습니다.')) +
      noticeBox('FAQ·교육 안내는 앱 커뮤니티와 아카데미 화면에서 함께 노출됩니다.', 'neutral') +
    '</section>';

  return {
    html: html,
    bind: function (el) {
      var filterSel = el.querySelector('#ct-filter');
      if (filterSel) {
        filterSel.addEventListener('change', function () {
          window.location.hash = '#/admin/content' + (this.value ? '?cat=' + this.value : '');
        });
      }

      var submit = el.querySelector('#ct-submit');
      submit.addEventListener('click', async function () {
        var title = el.querySelector('#ct-title').value.trim();
        var body = el.querySelector('#ct-body').value.trim();
        if (!title || !body) { toast('제목과 내용을 입력해 주세요.'); return; }
        setBusy(submit, true, '게시 중');
        try {
          var post = await createPost({
            category: el.querySelector('#ct-cat').value,
            title: title,
            body: body,
            is_pinned: el.querySelector('#ct-pin').checked
          });
          await logAudit({ action: 'content_created', target_table: 'community_posts', target_id: post ? post.id : '', detail: { category: el.querySelector('#ct-cat').value } });
          toast('게시되었습니다.', 'success');
          window.location.hash = '#/admin/content?r=' + Date.now();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });

      function find(id) {
        for (var i = 0; i < posts.length; i++) if (String(posts[i].id) === String(id)) return posts[i];
        return null;
      }

      var editButtons = el.querySelectorAll('[data-edit]');
      for (var i = 0; i < editButtons.length; i++) {
        editButtons[i].addEventListener('click', function () {
          var target = find(this.getAttribute('data-edit'));
          if (!target) return;
          openEditor(target, categoryOptions);
        });
      }

      var pinButtons = el.querySelectorAll('[data-pin]');
      for (var p = 0; p < pinButtons.length; p++) {
        pinButtons[p].addEventListener('click', async function () {
          var target = find(this.getAttribute('data-pin'));
          if (!target) return;
          try {
            await updatePost(target.id, { is_pinned: !target.is_pinned });
            toast('고정 상태가 변경되었습니다.', 'success');
            window.location.hash = '#/admin/content?r=' + Date.now();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var hideButtons = el.querySelectorAll('[data-hide]');
      for (var h = 0; h < hideButtons.length; h++) {
        hideButtons[h].addEventListener('click', async function () {
          var target = find(this.getAttribute('data-hide'));
          if (!target) return;
          try {
            await updatePost(target.id, { is_hidden: !target.is_hidden });
            toast('숨김 상태가 변경되었습니다.', 'success');
            window.location.hash = '#/admin/content?r=' + Date.now();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }

      var delButtons = el.querySelectorAll('[data-del]');
      for (var d = 0; d < delButtons.length; d++) {
        delButtons[d].addEventListener('click', async function () {
          var id = this.getAttribute('data-del');
          var ok = await confirmDialog({ title: '게시글 삭제', message: '이 게시글과 댓글이 모두 삭제됩니다. 계속할까요?', confirmLabel: '삭제' });
          if (!ok) return;
          try {
            await deletePost(id);
            await logAudit({ action: 'content_deleted', target_table: 'community_posts', target_id: id, detail: {} });
            toast('삭제되었습니다.', 'success');
            window.location.hash = '#/admin/content?r=' + Date.now();
          } catch (err) { toast(friendlyError(err), 'error'); }
        });
      }
    }
  };
}

function openEditor(post, categoryOptions) {
  openSheet({
    title: '콘텐츠 수정',
    subtitle: categoryLabel(post.category),
    wide: true,
    content:
      '<label class="field"><span class="field-label">카테고리</span><select id="ec-cat">' +
        EDITOR_CATEGORIES.map(function (id) { return opt(id, categoryLabel(id), post.category); }).join('') + '</select></label>' +
      '<label class="field"><span class="field-label">제목</span><input type="text" id="ec-title" value="' + esc(post.title) + '"></label>' +
      '<label class="field"><span class="field-label">내용</span><textarea id="ec-body" rows="10">' + esc(post.body || '') + '</textarea></label>' +
      '<label class="field field-inline"><span class="field-label">상단 고정</span>' +
        '<label class="switch"><input type="checkbox" id="ec-pin"' + (post.is_pinned ? ' checked' : '') + '><span></span></label></label>',
    footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
      '<button type="button" class="btn btn-primary" id="ec-save">저장</button>',
    onMount: function (el) {
      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });
      var save = el.querySelector('#ec-save');
      save.addEventListener('click', async function () {
        var title = el.querySelector('#ec-title').value.trim();
        var body = el.querySelector('#ec-body').value.trim();
        if (!title || !body) { toast('제목과 내용을 입력해 주세요.'); return; }
        setBusy(save, true, '저장 중');
        try {
          await updatePost(post.id, {
            category: el.querySelector('#ec-cat').value,
            title: title,
            body: body,
            is_pinned: el.querySelector('#ec-pin').checked
          });
          await logAudit({ action: 'content_updated', target_table: 'community_posts', target_id: post.id, detail: {} });
          toast('저장되었습니다.', 'success');
          closeSheet();
          window.location.hash = '#/admin/content?r=' + Date.now();
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(save, false);
        }
      });
    }
  });
}
