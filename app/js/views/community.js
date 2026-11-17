/* S07. MINA COMMUNITY — 7개 카테고리 · 게시글 · 댓글 */
import { COMMUNITY_CATEGORIES, categoryLabel } from '../config.js?v=2.0.4';
import {
  state, listPosts, getPost, createPost, updatePost, deletePost,
  listComments, addComment, deleteComment, isStaff, isAdmin, friendlyError
} from '../store.js?v=2.0.4';
import {
  icon, esc, timeAgo, fmtDateTime, toast, emptyState, noticeBox, sectionHead,
  badge, openSheet, closeSheet, setBusy, confirmDialog, go
} from '../ui.js?v=2.0.4';

function postRow(post) {
  return '<a class="post-row" href="#/community/post/' + esc(post.id) + '">' +
    '<div class="post-top">' +
      '<span class="pill pill-soft">' + esc(categoryLabel(post.category)) + '</span>' +
      (post.is_pinned ? '<span class="pin-mark">' + icon('pin', 14) + '고정</span>' : '') +
      (post.is_hidden ? '<span class="badge badge-red">숨김</span>' : '') +
    '</div>' +
    '<h3 class="post-title">' + esc(post.title) + '</h3>' +
    '<p class="post-preview">' + esc(String(post.body || '').replace(/\n/g, ' ').slice(0, 70)) + '</p>' +
    '<div class="post-meta"><span>' + esc(post.author_name || 'MINA WORLD') + '</span><span>' + timeAgo(post.created_at) + '</span></div>' +
  '</a>';
}

function writeSheet(ctx, defaultCategory) {
  if (!state.session) {
    openSheet({
      title: '로그인이 필요합니다',
      content: '<p class="sheet-help">후기와 Q&A 글쓰기는 로그인 후 이용할 수 있습니다.</p>',
      footer: '<button type="button" class="btn btn-ghost" data-close>닫기</button>' +
        '<button type="button" class="btn btn-primary" data-login>로그인</button>',
      onMount: function (el) {
        var c = el.querySelector('[data-close]');
        if (c) c.addEventListener('click', function () { closeSheet(); });
        var l = el.querySelector('[data-login]');
        if (l) l.addEventListener('click', function () { closeSheet(); go('/account'); });
      }
    });
    return;
  }

  var allowed = COMMUNITY_CATEGORIES.filter(function (cat) {
    return isStaff() || cat.writable;
  });
  var options = allowed.map(function (cat) {
    var selected = (defaultCategory && cat.id === defaultCategory) || (!defaultCategory && cat.id === 'review');
    return '<option value="' + cat.id + '"' + (selected ? ' selected' : '') + '>' + esc(cat.label) + '</option>';
  }).join('');

  openSheet({
    title: '글쓰기',
    subtitle: isStaff() ? '관리자 · 상담사는 전체 카테고리에 작성할 수 있습니다.' : '후기 · Q&A 카테고리에 작성할 수 있습니다.',
    content:
      '<label class="field"><span class="field-label">카테고리</span><select id="post-cat">' + options + '</select></label>' +
      '<label class="field"><span class="field-label">제목</span><input type="text" id="post-title" maxlength="80" placeholder="제목을 입력해 주세요"></label>' +
      '<label class="field"><span class="field-label">내용</span><textarea id="post-body" rows="7" maxlength="4000" placeholder="내용을 입력해 주세요"></textarea></label>' +
      noticeBox('개인정보(연락처·주민등록번호 등)는 게시글에 남기지 않는 것을 권장합니다.', 'neutral'),
    footer: '<button type="button" class="btn btn-ghost" data-close>취소</button>' +
      '<button type="button" class="btn btn-primary btn-grow" id="post-submit">등록</button>',
    onMount: function (el) {
      var close = el.querySelector('[data-close]');
      if (close) close.addEventListener('click', function () { closeSheet(); });
      var submit = el.querySelector('#post-submit');
      submit.addEventListener('click', async function () {
        var category = el.querySelector('#post-cat').value;
        var title = el.querySelector('#post-title').value.trim();
        var body = el.querySelector('#post-body').value.trim();
        if (!title) { toast('제목을 입력해 주세요.'); return; }
        if (!body) { toast('내용을 입력해 주세요.'); return; }
        setBusy(submit, true, '등록 중');
        try {
          var post = await createPost({ category: category, title: title, body: body });
          closeSheet();
          toast('게시글이 등록되었습니다.', 'success');
          go('/community/post/' + post.id);
        } catch (err) {
          toast(friendlyError(err), 'error');
          setBusy(submit, false);
        }
      });
    }
  });
}

async function renderDetail(ctx, postId) {
  var post = null;
  var comments = [];
  var error = '';
  try {
    post = await getPost(postId);
    if (post) comments = await listComments(postId);
  } catch (err) {
    error = friendlyError(err);
  }

  if (!post) {
    return {
      title: '커뮤니티',
      html: '<div class="page-head"><span class="page-eyebrow">' + icon('chat', 16) + ' COMMUNITY</span></div>' +
        (error ? noticeBox(esc(error), 'warn') : emptyState({
          icon: 'search',
          title: '게시글을 찾을 수 없습니다',
          desc: '삭제되었거나 비공개 처리된 글입니다.',
          action: '<a class="btn btn-ghost btn-sm" href="#/community">목록으로</a>'
        }))
    };
  }

  var commentHtml = comments.length
    ? comments.map(function (c) {
        return '<div class="comment-row">' +
          '<div class="comment-head"><strong>' + esc(c.author_name) + '</strong><span class="muted small">' + timeAgo(c.created_at) + '</span></div>' +
          '<p class="comment-body">' + esc(c.body) + '</p>' +
          (isAdmin() ? '<button type="button" class="comment-del" data-del-comment="' + esc(c.id) + '">삭제</button>' : '') +
        '</div>';
      }).join('')
    : '<p class="muted small comment-empty">첫 댓글을 남겨 보세요.</p>';

  var adminBar = isStaff()
    ? '<div class="admin-inline-bar">' +
        '<span class="badge badge-navy">관리자</span>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-admin="pin">' + (post.is_pinned ? '고정 해제' : '고정') + '</button>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-admin="hide">' + (post.is_hidden ? '숨김 해제' : '숨김') + '</button>' +
        '<button type="button" class="btn btn-ghost btn-xs btn-quiet-danger" data-admin="delete">삭제</button>' +
      '</div>'
    : '';

  var html =
    '<div class="detail-nav">' +
      '<a class="btn btn-ghost btn-xs" href="#/community?c=' + esc(post.category) + '">' + icon('chevronLeft', 15) + '목록</a>' +
      '<span class="muted small">' + esc(categoryLabel(post.category)) + '</span>' +
    '</div>' +
    '<article class="post-detail">' +
      '<div class="post-detail-head">' +
        '<span class="pill pill-soft">' + esc(categoryLabel(post.category)) + '</span>' +
        (post.is_pinned ? '<span class="pin-mark">' + icon('pin', 14) + '고정</span>' : '') +
        (post.is_hidden ? '<span class="badge badge-red">숨김 상태</span>' : '') +
      '</div>' +
      '<h1 class="post-detail-title">' + esc(post.title) + '</h1>' +
      '<div class="post-meta"><span>' + esc(post.author_name || 'MINA WORLD') + '</span><span>' + fmtDateTime(post.created_at) + '</span></div>' +
      adminBar +
      '<div class="post-body">' + esc(post.body).replace(/\n/g, '<br>') + '</div>' +
    '</article>' +

    '<section class="section">' +
      sectionHead('댓글', '<span class="muted small">' + comments.length + '개</span>') +
      '<div class="comment-list">' + commentHtml + '</div>' +
      (state.session
        ? '<div class="comment-form">' +
            '<textarea id="comment-input" rows="2" maxlength="500" placeholder="댓글을 입력해 주세요"></textarea>' +
            '<button type="button" class="btn btn-primary btn-sm" id="comment-submit">등록</button>' +
          '</div>'
        : '<p class="muted small">댓글 작성은 로그인 후 이용할 수 있습니다.</p>') +
    '</section>' +

    '<footer class="app-footer"><p class="footer-note">커뮤니티 글은 회원 간 정보 공유용이며, 의료적 진단·치료를 대체하지 않습니다.</p></footer>';

  return {
    title: post.title,
    html: html,
    mount: function (el) {
      var submit = el.querySelector('#comment-submit');
      if (submit) {
        submit.addEventListener('click', async function () {
          var input = el.querySelector('#comment-input');
          var body = input ? input.value.trim() : '';
          if (!body) { toast('댓글 내용을 입력해 주세요.'); return; }
          setBusy(submit, true, '등록 중');
          try {
            await addComment(post.id, body);
            toast('댓글이 등록되었습니다.', 'success');
            ctx.rerender();
          } catch (err) {
            toast(friendlyError(err), 'error');
            setBusy(submit, false);
          }
        });
      }

      var commentDels = el.querySelectorAll('[data-del-comment]');
      for (var d = 0; d < commentDels.length; d++) {
        commentDels[d].addEventListener('click', async function () {
          var id = this.getAttribute('data-del-comment');
          var ok = await confirmDialog({ title: '댓글 삭제', message: '이 댓글을 삭제할까요?', confirmLabel: '삭제' });
          if (!ok) return;
          try {
            await deleteComment(id);
            toast('댓글이 삭제되었습니다.', 'success');
            ctx.rerender();
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
        });
      }

      var adminButtons = el.querySelectorAll('[data-admin]');
      for (var a = 0; a < adminButtons.length; a++) {
        adminButtons[a].addEventListener('click', async function () {
          var action = this.getAttribute('data-admin');
          try {
            if (action === 'pin') {
              await updatePost(post.id, { is_pinned: !post.is_pinned });
              toast(post.is_pinned ? '고정을 해제했습니다.' : '고정했습니다.', 'success');
              ctx.rerender();
            } else if (action === 'hide') {
              await updatePost(post.id, { is_hidden: !post.is_hidden });
              toast(post.is_hidden ? '숨김을 해제했습니다.' : '숨김 처리했습니다.', 'success');
              ctx.rerender();
            } else if (action === 'delete') {
              var ok = await confirmDialog({ title: '게시글 삭제', message: '이 게시글과 댓글이 삭제됩니다. 계속할까요?', confirmLabel: '삭제' });
              if (!ok) return;
              await deletePost(post.id);
              toast('게시글이 삭제되었습니다.', 'success');
              go('/community?c=' + post.category);
            }
          } catch (err) {
            toast(friendlyError(err), 'error');
          }
        });
      }
    }
  };
}

export async function render(ctx) {
  if (ctx.segments[1] === 'post' && ctx.segments[2]) {
    return renderDetail(ctx, ctx.segments[2]);
  }

  var category = ctx.query.get('c') || 'notice';
  var valid = COMMUNITY_CATEGORIES.filter(function (c) { return c.id === category; });
  if (!valid.length) category = 'notice';

  var posts = [];
  var error = '';
  try {
    posts = await listPosts({ category: category });
  } catch (err) {
    error = friendlyError(err);
  }

  var tabs = COMMUNITY_CATEGORIES.map(function (cat) {
    return '<a class="chip' + (cat.id === category ? ' is-on' : '') + '" href="#/community?c=' + cat.id + '">' + esc(cat.label) + '</a>';
  }).join('');

  var writable = isStaff() || (state.session && COMMUNITY_CATEGORIES.filter(function (c) { return c.id === category && c.writable; }).length > 0);

  return {
    title: 'MINA COMMUNITY',
    html:
      '<header class="page-head">' +
        '<span class="page-eyebrow">' + icon('chat', 16) + ' MINA COMMUNITY</span>' +
        '<h1 class="page-title">함께 관리하는<br>뇌 웰니스</h1>' +
        '<p class="page-desc">공지 · 뇌과학 정보 · 웰니스 콘텐츠 · 이벤트 · 후기 · Q&A · 전문가 칼럼</p>' +
      '</header>' +

      '<section class="section">' +
        '<div class="chip-scroll">' + tabs + '</div>' +
        (error ? noticeBox(esc(error), 'warn') : '') +
        '<div class="list-toolbar">' +
          '<span class="muted small">' + esc(categoryLabel(category)) + ' · ' + posts.length + '건</span>' +
          (writable ? '<button type="button" class="btn btn-primary btn-xs" id="write-btn">글쓰기</button>' : '') +
        '</div>' +
        (posts.length
          ? posts.map(postRow).join('')
          : emptyState({
              icon: 'chat',
              title: '아직 등록된 글이 없습니다',
              desc: isStaff() ? '관리자로서 첫 글을 작성할 수 있습니다.' : '곧 새로운 소식이 올라옵니다.',
              action: writable ? '<button type="button" class="btn btn-ghost btn-sm" id="write-btn-empty">글쓰기</button>' : ''
            })) +
      '</section>' +

      '<footer class="app-footer"><p class="footer-note">커뮤니티의 모든 정보는 웰니스 참고 자료이며 의료적 진단을 대체하지 않습니다.</p></footer>',
    mount: function (el) {
      var writeBtn = el.querySelector('#write-btn');
      if (writeBtn) writeBtn.addEventListener('click', function () { writeSheet(ctx, category); });
      var emptyWrite = el.querySelector('#write-btn-empty');
      if (emptyWrite) emptyWrite.addEventListener('click', function () { writeSheet(ctx, category); });
    }
  };
}
