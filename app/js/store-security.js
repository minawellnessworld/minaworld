/* =====================================================================
   MINA WORLD App — 보안 · 동의 · 감사 · 2단계 인증 · 기간별 지표
   ---------------------------------------------------------------------
   PART 2-1 / PART 6 계약:
   - consent_logs (consent_type: privacy_policy | sensitive_health | partner_share | marketing)
   - audit_logs (actor_id, actor_email, actor_role, org_id, action, target_table, target_id, detail)
   - supabase.auth.mfa TOTP 등록/검증/해제
   - withdraw_my_account() RPC
   ===================================================================== */
import { CONSENT_VERSION } from './config.js?v=2.0.18';
import {
  state, myOrgId, friendlyError, nowIso, todayStr,
  localRows, localInsertRow, refreshProfile, signOut, passwordIssue
} from './store.js?v=2.0.18';
import { clientSync, listTotpFactors, assuranceLevel } from './supabase.js?v=2.0.18';

function live() { return state.mode === 'live'; }

function userAgent() {
  try {
    if (typeof navigator === 'undefined') return '';
    return String(navigator.userAgent || '').slice(0, 240);
  } catch (err) { return ''; }
}

/* --------------------------------------------------------------- 동의 이력 */
export async function recordConsents(entries) {
  if (!state.session || !state.session.user) return [];
  var uidValue = state.session.user.id;
  var rows = (entries || []).map(function (entry) {
    return {
      user_id: uidValue,
      consent_type: entry.type,
      version: entry.version || CONSENT_VERSION,
      agreed: entry.agreed !== false,
      user_agent: userAgent()
    };
  });
  if (!rows.length) return [];
  if (live()) {
    var res = await clientSync().from('consent_logs').insert(rows).select();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return rows.map(function (row) { return localInsertRow('consent_logs', row); });
}

export async function listMyConsents() {
  if (!state.session) return [];
  var uidValue = state.session.user.id;
  if (live()) {
    var res = await clientSync().from('consent_logs').select('*').eq('user_id', uidValue).order('created_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return localRows('consent_logs').filter(function (c) { return String(c.user_id) === String(uidValue); });
}

export async function listConsentLogs(limit) {
  if (live()) {
    var res = await clientSync().from('consent_logs').select('*, profiles(full_name,email)').order('created_at', { ascending: false }).limit(limit || 200);
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return localRows('consent_logs').slice().reverse().slice(0, limit || 200);
}

/* --------------------------------------------------------------- 감사 로그 */
export async function logAudit(entry) {
  var profile = state.profile || {};
  var user = state.session && state.session.user ? state.session.user : null;
  var row = {
    actor_id: user ? user.id : null,
    actor_email: profile.email || (user ? user.email : '') || '',
    actor_role: profile.role || 'member',
    org_id: entry.org_id || myOrgId() || null,
    action: entry.action,
    target_table: entry.target_table || '',
    target_id: entry.target_id ? String(entry.target_id) : '',
    detail: entry.detail || {}
  };
  try {
    if (live()) {
      var res = await clientSync().from('audit_logs').insert(row);
      if (res.error) console.warn('[MINA] 감사 로그 기록 실패', res.error.message);
      return !res.error;
    }
    localInsertRow('audit_logs', row);
    return true;
  } catch (err) {
    console.warn('[MINA] 감사 로그 기록 실패', err);
    return false;
  }
}

export async function listAuditLogs(options) {
  options = options || {};
  var limit = options.limit || 200;
  if (live()) {
    var q = clientSync().from('audit_logs').select('*').order('created_at', { ascending: false }).limit(limit);
    if (options.orgId) q = q.eq('org_id', options.orgId);
    if (options.actorRole) q = q.eq('actor_role', options.actorRole);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    var rows = res.data || [];
    if (options.search) {
      var needle = String(options.search).toLowerCase();
      rows = rows.filter(function (r) {
        return (String(r.action || '') + ' ' + String(r.actor_email || '') + ' ' + String(r.target_table || '') + ' ' + String(r.target_id || '')).toLowerCase().indexOf(needle) >= 0;
      });
    }
    return rows;
  }
  var local = localRows('audit_logs').slice().reverse();
  if (options.orgId) local = local.filter(function (r) { return String(r.org_id) === String(options.orgId); });
  return local.slice(0, limit);
}

/* --------------------------------------------------------- 기간별 지표 */
export function rangeFor(key, customStart, customEnd) {
  var now = new Date();
  var start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (key === 'week') {
    var day = (now.getDay() + 6) % 7; /* 월요일 시작 */
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day);
  } else if (key === 'month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (key === 'year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else if (key === 'custom') {
    if (customStart) start = new Date(customStart + 'T00:00:00');
    if (customEnd) end = new Date(customEnd + 'T00:00:00');
  }
  var fmt = function (d) {
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  };
  return { key: key, start: fmt(start), end: fmt(end) };
}

function inRange(value, range) {
  var text = String(value || '').slice(0, 10);
  if (!text) return false;
  return text >= range.start && text <= range.end;
}

export async function fetchMetricSource() {
  var client = clientSync();
  var out = { profiles: [], bookings: [], payments: [], results: [], sessions: [], enrollments: [], orgs: [] };
  if (!live()) {
    out.profiles = localRows('profiles').slice();
    out.bookings = localRows('bookings').slice();
    out.payments = localRows('payments').slice();
    out.results = localRows('brain_results').slice();
    out.sessions = localRows('neuro_sessions').slice();
    out.enrollments = localRows('academy_enrollments').slice();
    out.orgs = localRows('organizations').slice();
    return out;
  }
  var jobs = [
    client.from('profiles').select('*').limit(5000),
    client.from('bookings').select('*').order('preferred_date', { ascending: false }).limit(5000),
    client.from('payments').select('*').order('created_at', { ascending: false }).limit(5000),
    client.from('brain_check_results').select('*').limit(3000),
    client.from('neuro_training_sessions').select('*').limit(3000),
    client.from('academy_enrollments').select('*').limit(2000),
    client.from('organizations').select('*')
  ];
  var settled = await Promise.all(jobs);
  var keys = ['profiles', 'bookings', 'payments', 'results', 'sessions', 'enrollments', 'orgs'];
  settled.forEach(function (res, index) {
    if (res.error) {
      console.warn('[MINA] 지표 조회 실패', keys[index], res.error.message);
      out[keys[index]] = [];
    } else {
      out[keys[index]] = res.data || [];
    }
  });
  return out;
}

export async function getPeriodMetrics(range, preloaded) {
  var source = preloaded || await fetchMetricSource();
  var today = todayStr();
  var activeProfiles = source.profiles.filter(function (p) { return p.status !== 'withdrawn'; });
  var members = activeProfiles.filter(function (p) { return (p.role || 'member') === 'member'; });

  var bookingsInRange = source.bookings.filter(function (b) { return inRange(b.created_at, range); });
  var paymentsInRange = source.payments.filter(function (p) { return inRange(p.created_at, range); });
  var paidInRange = paymentsInRange.filter(function (p) { return p.status === 'paid'; });

  var checkProgram = function (b) { return String(b.program_id || '').indexOf('brain_check') === 0; };

  var metrics = {
    totalMembers: members.length,
    newMembers: activeProfiles.filter(function (p) { return inRange(p.created_at, range); }).length,
    totalBookings: bookingsInRange.filter(function (b) { return b.status !== 'canceled'; }).length,
    todayBookings: source.bookings.filter(function (b) { return String(b.preferred_date) === today && b.status !== 'canceled'; }).length,
    checksInProgress: source.bookings.filter(function (b) {
      return checkProgram(b) && (b.status === 'pending' || b.status === 'confirmed');
    }).length,
    neuroUsed: source.sessions.filter(function (s) { return inRange(s.trained_at, range); }).length,
    programSales: bookingsInRange.filter(function (b) { return !checkProgram(b) && b.status !== 'canceled'; }).length,
    revenue: paidInRange.reduce(function (sum, p) { return sum + Number(p.amount || 0); }, 0),
    refund: paymentsInRange.filter(function (p) { return p.status === 'refunded'; })
      .reduce(function (sum, p) { return sum + Number(p.amount || 0); }, 0),
    partnerOrgs: source.orgs.filter(function (o) { return o.status === 'active'; }).length,
    academyApplicants: source.enrollments.filter(function (e) { return inRange(e.created_at, range); }).length,
    resultsCount: source.results.filter(function (r) { return inRange(r.measured_at, range); }).length,
    statusCounts: { pending: 0, confirmed: 0, completed: 0, canceled: 0, noshow: 0 }
  };

  source.bookings.forEach(function (b) {
    if (!inRange(b.preferred_date, range)) return;
    var key = b.status || 'pending';
    if (metrics.statusCounts[key] === undefined) metrics.statusCounts[key] = 0;
    metrics.statusCounts[key] += 1;
  });

  return metrics;
}

/* 최근 6개월 매출 (payments paid 기준) */
export function monthlyRevenue(source, months) {
  var count = months || 6;
  var labels = [];
  var totals = [];
  var now = new Date();
  for (var i = count - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var key = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
    labels.push((d.getMonth() + 1) + '월');
    var sum = 0;
    (source.payments || []).forEach(function (p) {
      if (p.status !== 'paid') return;
      if (String(p.created_at || '').slice(0, 7) === key) sum += Number(p.amount || 0);
    });
    totals.push(sum);
  }
  return { labels: labels, totals: totals };
}

/* ------------------------------------------------------- 계정 · 보안 */
export async function changeMyPassword(newPassword) {
  var issue = passwordIssue(newPassword);
  if (issue) throw new Error(issue);
  if (!live()) throw new Error('로컬 체험 모드에서는 비밀번호를 변경할 수 없습니다. 실서버 연결 후 이용해 주세요.');
  var res = await clientSync().auth.updateUser({ password: String(newPassword) });
  if (res.error) throw new Error(friendlyError(res.error));
  await logAudit({ action: 'password_changed', target_table: 'auth.users', detail: {} });
  return true;
}

export async function withdrawMyAccount() {
  if (!live()) throw new Error('로컬 체험 모드에서는 탈퇴 처리를 할 수 없습니다.');
  var client = clientSync();
  var res = await client.rpc('withdraw_my_account');
  if (res.error) throw new Error(friendlyError(res.error));
  try { await refreshProfile(); } catch (err) { console.warn(err); }
  try { await client.auth.signOut(); } catch (err) { console.warn(err); }
  await signOut().catch(function () {});
  return true;
}

/* TOTP 2단계 인증 */
export async function getMfaStatus() {
  if (!live()) {
    return { enabled: false, verified: false, factors: [], currentLevel: 'aal1', nextLevel: 'aal1', localOnly: true };
  }
  var factors = await listTotpFactors();
  var level = await assuranceLevel();
  var verified = factors.filter(function (f) { return f.status === 'verified'; });
  return {
    enabled: verified.length > 0,
    verified: verified,
    factors: factors,
    currentLevel: level.currentLevel,
    nextLevel: level.nextLevel
  };
}

export async function enrollTotp() {
  var client = clientSync();
  var res = await client.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'MINA ADMIN ' + new Date().toISOString().slice(0, 10) });
  if (res.error) throw new Error(friendlyError(res.error));
  var data = res.data || {};
  var totp = data.totp || {};
  return {
    factorId: data.id,
    qrCode: totp.qr_code || '',
    secret: totp.secret || '',
    uri: totp.uri || ''
  };
}

export async function verifyTotp(factorId, code) {
  var client = clientSync();
  var challenge = await client.auth.mfa.challenge({ factorId: factorId });
  if (challenge.error) throw new Error(friendlyError(challenge.error));
  var verify = await client.auth.mfa.verify({
    factorId: factorId,
    challengeId: challenge.data.id,
    code: String(code || '').replace(/\s/g, '')
  });
  if (verify.error) throw new Error(friendlyError(verify.error));
  await logAudit({ action: 'mfa_verified', target_table: 'auth.mfa_factors', target_id: factorId, detail: {} });
  return true;
}

export async function unenrollTotp(factorId) {
  var client = clientSync();
  var res = await client.auth.mfa.unenroll({ factorId: factorId });
  if (res.error) throw new Error(friendlyError(res.error));
  await logAudit({ action: 'mfa_unenrolled', target_table: 'auth.mfa_factors', target_id: factorId, detail: {} });
  return true;
}

/* 관리자 로그인 후 MFA 챌린지 필요 여부 */
export async function needsMfaChallenge() {
  if (!live()) return false;
  try {
    var status = await getMfaStatus();
    return status.nextLevel === 'aal2' && status.currentLevel !== 'aal2';
  } catch (err) {
    console.warn('[MINA] MFA 상태 확인 실패', err);
    return false;
  }
}

export function auditActionLabel(action) {
  var map = {
    member_status_changed: '회원 상태 변경',
    member_role_changed: '회원 권한 변경',
    booking_created_admin: '관리자 예약 등록',
    booking_status_changed: '예약 상태 변경',
    booking_payment_changed: '결제 상태 변경',
    result_created: '검사 결과 등록',
    result_updated: '검사 결과 수정',
    result_deleted: '검사 결과 삭제',
    result_visibility_changed: '결과 공개 여부 변경',
    org_created: '제휴 기관 등록',
    org_updated: '제휴 기관 수정',
    org_approved: '제휴 기관 승인',
    org_account_issued: '기관 계정 발급',
    staff_account_issued: '직원 계정 발급',
    staff_permissions_changed: '직원 권한 변경',
    member_org_added: '기관 회원 등록',
    membership_approved: '소속 승인',
    membership_requested: '기관 소속 요청',
    membership_rejected: '소속 거절',
    result_access_requested: '검사 결과 열람 요청',
    settlement_created: '정산 생성',
    settlement_paid: '정산 완료 처리',
    content_created: '콘텐츠 등록',
    content_updated: '콘텐츠 수정',
    content_deleted: '콘텐츠 삭제',
    schedule_updated: '운영시간 변경',
    program_updated: '프로그램 수정',
    password_changed: '비밀번호 변경',
    account_withdrawn: '회원 탈퇴',
    consent_recorded: '동의 이력 기록',
    mfa_enrolled: '2단계 인증 등록',
    mfa_verified: '2단계 인증 검증',
    mfa_unenrolled: '2단계 인증 해제'
  };
  return map[action] || action;
}
