/* =====================================================================
   MINA WORLD App — 제휴 기관(B2B) · 계정 발급 · 정산 데이터 계층
   ---------------------------------------------------------------------
   supabase_schema_v2.sql 계약을 정확히 따릅니다.
   - organizations / branches / org_schedules / org_memberships
   - account_pre_assignments + persistSession:false 보조 클라이언트로
     "현재 관리자 세션을 끊지 않고" 실제 로그인 가능한 계정을 즉시 발급
   - settlements (payments paid/refunded + commission_rate 기반 계산)
   ===================================================================== */
import {
  state, isAdmin, isOrgWorker, myOrgId, friendlyError, nowIso, todayStr,
  localRows, localInsertRow, localUpdateRow, localDeleteRow, saveLocalNow, currentUser,
  listPublicDirectory, shapePublicDirectory, passwordIssue
} from './store.js?v=2.0.29';
import { clientSync, createSecondaryClient } from './supabase.js?v=2.0.29';
import { CONFIG } from './config.js?v=2.0.29';

function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

function sortDesc(rows, key) {
  return rows.slice().sort(function (a, b) {
    var av = a[key] || '';
    var bv = b[key] || '';
    if (av === bv) return 0;
    return av < bv ? 1 : -1;
  });
}

function live() { return state.mode === 'live'; }

function orgScope() {
  return myOrgId() || null;
}

/* --------------------------------------------------------- 기관 · 지점 */
export { listPublicDirectory };

/* 지금 사용자가 기관 테이블 전체를 볼 수 있는가?
   총괄 관리자 · 제휴 기관 근무자만 true. 비로그인·일반회원은 공개 디렉터리만. */
function canReadOrgTable() {
  return isAdmin() || isOrgWorker();
}

export async function listOrganizationsFiltered(status) {
  if (live()) {
    if (!canReadOrgTable()) {
      var directory = shapePublicDirectory(await listPublicDirectory());
      if (status) directory = directory.filter(function (o) { return o.status === status; });
      return directory;
    }
    var q = clientSync().from('organizations').select('*').order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = localRows('organizations').slice();
  if (status) rows = rows.filter(function (o) { return o.status === status; });
  return sortDesc(rows, 'created_at');
}

export async function getOrganization(id) {
  if (!id) return null;
  if (live()) {
    var res = await clientSync().from('organizations').select('*').eq('id', id).maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  var rows = localRows('organizations');
  for (var i = 0; i < rows.length; i++) if (rows[i].id === id) return Object.assign({}, rows[i]);
  return null;
}

export async function saveOrganization(payload, id) {
  var row = {
    name: payload.name,
    org_type: payload.org_type,
    business_no: payload.business_no || '',
    ceo_name: payload.ceo_name || '',
    contact_name: payload.contact_name || '',
    contact_phone: payload.contact_phone || '',
    contact_email: payload.contact_email || '',
    address: payload.address || '',
    contract_start: payload.contract_start || null,
    contract_end: payload.contract_end || null,
    commission_rate: payload.commission_rate === '' || payload.commission_rate === undefined || payload.commission_rate === null
      ? 15 : Number(payload.commission_rate),
    settlement_bank: payload.settlement_bank || '',
    settlement_account: payload.settlement_account || '',
    status: payload.status || 'pending',
    notes: payload.notes || ''
  };
  if (live()) {
    if (id) {
      var res = await clientSync().from('organizations').update(row).eq('id', id).select().maybeSingle();
      if (res.error) throw new Error(friendlyError(res.error));
      return res.data;
    }
    var ins = await clientSync().from('organizations').insert(row).select().maybeSingle();
    if (ins.error) throw new Error(friendlyError(ins.error));
    return ins.data;
  }
  if (id) return localUpdateRow('organizations', id, row);
  return localInsertRow('organizations', row);
}

export async function listBranchesForOrg(orgId) {
  if (live()) {
    if (!canReadOrgTable()) {
      var orgs = shapePublicDirectory(await listPublicDirectory());
      var out = [];
      orgs.forEach(function (org) {
        if (orgId && String(org.id) !== String(orgId)) return;
        org.branches.forEach(function (branch) { out.push(branch); });
      });
      return out;
    }
    var q = clientSync().from('branches').select('*').order('created_at', { ascending: true });
    if (orgId) q = q.eq('org_id', orgId);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = localRows('branches').slice();
  if (orgId) rows = rows.filter(function (b) { return String(b.org_id) === String(orgId); });
  return rows;
}

export async function saveBranch(payload, id) {
  var row = {
    org_id: payload.org_id || null,
    name: payload.name,
    address: payload.address || '',
    phone: payload.phone || '',
    status: payload.status || 'active'
  };
  if (live()) {
    if (id) {
      var res = await clientSync().from('branches').update(row).eq('id', id).select().maybeSingle();
      if (res.error) throw new Error(friendlyError(res.error));
      return res.data;
    }
    var ins = await clientSync().from('branches').insert(row).select().maybeSingle();
    if (ins.error) throw new Error(friendlyError(ins.error));
    return ins.data;
  }
  if (id) return localUpdateRow('branches', id, row);
  return localInsertRow('branches', row);
}

/* ------------------------------------------------------ 운영 시간(스케줄) */
export async function listOrgSchedules(orgId) {
  if (live()) {
    var q = clientSync().from('org_schedules').select('*').order('weekday', { ascending: true });
    if (orgId) q = q.eq('org_id', orgId);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = localRows('org_schedules').slice();
  if (orgId) rows = rows.filter(function (s) { return String(s.org_id) === String(orgId); });
  return rows.sort(function (a, b) { return Number(a.weekday) - Number(b.weekday); });
}

export async function saveSchedule(payload, id) {
  var row = {
    org_id: payload.org_id,
    branch_id: payload.branch_id || null,
    counselor_id: payload.counselor_id || null,
    weekday: Number(payload.weekday),
    open_time: payload.open_time || '10:00',
    close_time: payload.close_time || '19:00',
    slot_minutes: Number(payload.slot_minutes) || CONFIG.DEFAULT_SLOT_MINUTES,
    is_active: payload.is_active !== false
  };
  if (live()) {
    if (id) {
      var res = await clientSync().from('org_schedules').update(row).eq('id', id).select().maybeSingle();
      if (res.error) throw new Error(friendlyError(res.error));
      return res.data;
    }
    var ins = await clientSync().from('org_schedules').insert(row).select().maybeSingle();
    if (ins.error) throw new Error(friendlyError(ins.error));
    return ins.data;
  }
  if (id) return localUpdateRow('org_schedules', id, row);
  return localInsertRow('org_schedules', row);
}

export async function deleteSchedule(id) {
  if (live()) {
    var res = await clientSync().from('org_schedules').delete().eq('id', id);
    if (res.error) throw new Error(friendlyError(res.error));
    return true;
  }
  localDeleteRow('org_schedules', id);
  return true;
}

/* 요일별 운영시간에서 예약 가능한 시간 문자열 생성 */
export function buildSlotsFromSchedules(schedules, weekday) {
  var out = [];
  (schedules || []).forEach(function (s) {
    if (Number(s.weekday) !== Number(weekday)) return;
    if (s.is_active === false) return;
    var start = String(s.open_time || '10:00').slice(0, 5);
    var end = String(s.close_time || '19:00').slice(0, 5);
    var step = Number(s.slot_minutes) || CONFIG.DEFAULT_SLOT_MINUTES;
    var toMin = function (t) {
      var parts = String(t).split(':');
      return Number(parts[0]) * 60 + Number(parts[1] || 0);
    };
    var cursor = toMin(start);
    var limit = toMin(end);
    var guard = 0;
    while (cursor + step <= limit && guard < 96) {
      var hh = Math.floor(cursor / 60);
      var mm = cursor % 60;
      var label = ('0' + hh).slice(-2) + ':' + ('0' + mm).slice(-2);
      if (out.indexOf(label) < 0) out.push(label);
      cursor += step;
      guard++;
    }
  });
  return out.sort();
}

/* 해당 기관/지점/담당자 운영 요일 여부 */
export function isOpenOn(schedules, weekday, branchId, counselorId) {
  var matched = (schedules || []).filter(function (s) {
    if (s.is_active === false) return false;
    if (Number(s.weekday) !== Number(weekday)) return false;
    if (branchId && s.branch_id && String(s.branch_id) !== String(branchId)) return false;
    if (counselorId) {
      if (s.counselor_id && String(s.counselor_id) !== String(counselorId)) return false;
      if (!s.counselor_id) return false;
    }
    return true;
  });
  return matched;
}

/* ---------------------------------------------------- 기관 소속(멤버십) */
/* organizations 테이블이 관리자·기관 근무자에게만 열려 있으므로,
   일반 회원의 소속 행에는 기관명이 비어 내려옵니다. 그 빈 칸만
   공개 디렉터리의 기관명·유형으로 채워 화면 표시를 유지합니다. */
async function attachOrgDirectory(rows) {
  var list = rows || [];
  var missing = false;
  for (var i = 0; i < list.length; i++) {
    if (!list[i].organizations && list[i].org_id) { missing = true; break; }
  }
  if (!missing) return list;
  var map = {};
  try {
    var directory = shapePublicDirectory(await listPublicDirectory());
    directory.forEach(function (org) { map[org.id] = org; });
  } catch (err) {
    console.warn('[MINA] 기관 디렉터리 조회 실패', err);
    return list;
  }
  return list.map(function (row) {
    if (row.organizations || !row.org_id || !map[row.org_id]) return row;
    var org = map[row.org_id];
    return Object.assign({}, row, {
      organizations: { id: org.id, name: org.name, org_type: org.org_type, status: org.status }
    });
  });
}

export async function listMyMemberships() {
  if (!state.session) return [];
  var uidValue = state.session.user.id;
  if (live()) {
    var res = await clientSync()
      .from('org_memberships')
      .select('*, organizations(id,name,org_type,status)')
      .eq('user_id', uidValue);
    if (res.error) throw new Error(friendlyError(res.error));
    return attachOrgDirectory(res.data || []);
  }
  var rows = localRows('org_memberships').filter(function (m) { return String(m.user_id) === String(uidValue); });
  var orgs = localRows('organizations');
  return rows.map(function (m) {
    var org = null;
    for (var i = 0; i < orgs.length; i++) if (String(orgs[i].id) === String(m.org_id)) org = orgs[i];
    return Object.assign({}, m, { organizations: org ? { id: org.id, name: org.name, org_type: org.org_type, status: org.status } : null });
  });
}

export async function listOrgMemberships(orgId) {
  var target = orgId || orgScope();
  if (!target) return [];
  if (live()) {
    var res = await clientSync()
      .from('org_memberships')
      .select('*, profiles(id,full_name,email,phone,status)')
      .eq('org_id', target)
      .order('created_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var profiles = localRows('profiles');
  return localRows('org_memberships')
    .filter(function (m) { return String(m.org_id) === String(target); })
    .map(function (m) {
      var p = null;
      for (var i = 0; i < profiles.length; i++) if (String(profiles[i].id) === String(m.user_id)) p = profiles[i];
      return Object.assign({}, m, { profiles: p ? { id: p.id, full_name: p.full_name, email: p.email, phone: p.phone, status: p.status } : null });
    });
}

/* 특정 회원의 기관 소속 목록 (전체 관리자·본인 조회용) */
export async function listMembershipsForUser(userId) {
  if (!userId) return [];
  if (live()) {
    var res = await clientSync()
      .from('org_memberships')
      .select('*, organizations(id,name,org_type,status)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return attachOrgDirectory(res.data || []);
  }
  var orgs = localRows('organizations');
  return localRows('org_memberships')
    .filter(function (m) { return String(m.user_id) === String(userId); })
    .map(function (m) {
      var org = null;
      for (var i = 0; i < orgs.length; i++) if (String(orgs[i].id) === String(m.org_id)) org = orgs[i];
      return Object.assign({}, m, { organizations: org ? { id: org.id, name: org.name, org_type: org.org_type, status: org.status } : null });
    });
}

export async function updateMembership(id, patch) {
  var payload = Object.assign({}, patch);
  if (payload.status === 'approved') payload.approved_at = nowIso();
  if (live()) {
    var res = await clientSync().from('org_memberships').update(payload).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdateRow('org_memberships', id, payload);
}

export async function requestResultAccess(id) {
  return updateMembership(id, { result_access_requested: true });
}

/* 회원 본인의 결과 공유 동의 토글 */
export async function setShareBrainResults(id, share) {
  return updateMembership(id, { share_brain_results: Boolean(share) });
}

/* 회원 본인이 제휴 기관 소속을 요청 (기관 관리자가 승인) */
export async function requestOrgMembership(orgId) {
  if (!state.session || !state.session.user) throw new Error('로그인 후 이용해 주세요.');
  if (!orgId) throw new Error('기관을 선택해 주세요.');
  var uidValue = state.session.user.id;
  var existing = await listMembershipsForUser(uidValue);
  for (var i = 0; i < existing.length; i++) {
    if (String(existing[i].org_id) === String(orgId)) {
      throw new Error('이미 이 기관에 소속 요청 또는 소속 상태가 있습니다.');
    }
  }
  var row = {
    org_id: orgId,
    user_id: uidValue,
    status: 'pending',
    share_brain_results: false,
    result_access_requested: false
  };
  if (live()) {
    var res = await clientSync().from('org_memberships').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsertRow('org_memberships', row);
}

/* ------------------------------------------------------- 계정 사전 배정 */
export async function listPreAssignments(orgId) {
  if (live()) {
    var q = clientSync().from('account_pre_assignments').select('*').order('created_at', { ascending: false });
    if (orgId) q = q.eq('org_id', orgId);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = localRows('account_pre_assignments').slice();
  if (orgId) rows = rows.filter(function (a) { return String(a.org_id) === String(orgId); });
  return sortDesc(rows, 'created_at');
}

export async function deletePreAssignment(email) {
  if (live()) {
    var res = await clientSync().from('account_pre_assignments').delete().eq('email', email);
    if (res.error) throw new Error(friendlyError(res.error));
    return true;
  }
  var rows = localRows('account_pre_assignments');
  var next = rows.filter(function (a) { return a.email !== email; });
  rows.length = 0;
  next.forEach(function (a) { rows.push(a); });
  saveLocalNow();
  return true;
}

/* 임시 비밀번호: 앱 비밀번호 정책(8자 이상 · 영문+숫자)을 반드시 통과해야 합니다.
   헷갈리는 글자(0/O, 1/l/I)는 제외하고 영문·숫자를 각각 최소 1자씩 넣습니다. */
function makePassword() {
  var letters = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  var digits = '23456789';
  var alphabet = letters + digits;
  var out = letters.charAt(Math.floor(Math.random() * letters.length)) +
            digits.charAt(Math.floor(Math.random() * digits.length));
  while (out.length < 10) {
    out += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return out + '!';
}

/* 관리자/기관 관리자 → 실제 로그인 가능한 계정 즉시 발급
   1) account_pre_assignments 에 (email, role, org_id, ...) 저장  ← handle_new_user 트리거가 읽음
   2) persistSession:false 보조 클라이언트로 auth.signUp → 현재 관리자 세션 유지
   3) profiles 반영 확인 후 결과 반환 (임시 비밀번호 포함) */
export async function issueAccount(payload) {
  var email = String(payload.email || '').trim().toLowerCase();
  if (!email || email.indexOf('@') < 0) throw new Error('올바른 이메일을 입력해 주세요.');
  var password = makePassword();
  if (payload.password && String(payload.password).length) {
    var issuedIssue = passwordIssue(payload.password);
    if (issuedIssue) throw new Error(issuedIssue);
    password = String(payload.password);
  }
  var role = payload.role || 'member';
  var orgId = payload.org_id || orgScope() || null;
  var perms = payload.staff_permissions || {};

  if (!live()) {
    var existing = localRows('profiles').filter(function (p) { return String(p.email).toLowerCase() === email; });
    if (existing.length) throw new Error('이미 가입된 이메일입니다.');
    var id = uid();
    localRows('accounts').push({ id: id, email: email, password_hash: 'plain:' + password, created_at: nowIso() });
    localRows('profiles').push({
      id: id, email: email, full_name: payload.full_name || email.split('@')[0], phone: payload.phone || '',
      role: role, member_grade: 'Welcome', goals: [], goal_note: '', org_id: orgId, branch_id: payload.branch_id || null,
      status: 'active', staff_role: payload.staff_role || '', staff_permissions: perms,
      created_at: nowIso(), updated_at: nowIso()
    });
    if (role === 'member' && orgId) {
      localRows('org_memberships').push({
        id: uid(), org_id: orgId, user_id: id, status: 'approved',
        share_brain_results: Boolean(payload.share_brain_results), result_access_requested: false,
        approved_at: nowIso(), created_at: nowIso()
      });
    }
    saveLocalNow();
    return { ok: true, email: email, tempPassword: password, localOnly: true };
  }

  var client = clientSync();
  var preRow = {
    email: email,
    role: role,
    org_id: orgId,
    branch_id: payload.branch_id || null,
    staff_role: payload.staff_role || '',
    staff_permissions: perms,
    full_name: payload.full_name || '',
    phone: payload.phone || '',
    share_brain_results: Boolean(payload.share_brain_results),
    created_by: currentUser() ? currentUser().id : null
  };

  var preRes = await client.from('account_pre_assignments').upsert(preRow, { onConflict: 'email' });
  if (preRes.error) throw new Error(friendlyError(preRes.error));

  var secondary = await createSecondaryClient();
  if (!secondary) {
    await deletePreAssignment(email).catch(function () {});
    throw new Error('계정 발급용 클라이언트를 준비하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  var signRes = await secondary.auth.signUp({
    email: email,
    password: password,
    options: { data: { full_name: payload.full_name || '', phone: payload.phone || '' } }
  });
  if (signRes.error) {
    await deletePreAssignment(email).catch(function () {});
    throw new Error(friendlyError(signRes.error));
  }

  /* 트리거 반영 확인 (즉시 반영되지만, 네트워크 지연을 몇 차례 재확인) */
  var profile = null;
  for (var attempt = 0; attempt < 4; attempt++) {
    var look = await client.from('profiles').select('*').eq('email', email).maybeSingle();
    if (!look.error && look.data) { profile = look.data; break; }
    await new Promise(function (resolve) { setTimeout(resolve, 400); });
  }

  return {
    ok: true,
    email: email,
    tempPassword: password,
    profile: profile,
    needsEmailConfirmation: !signRes.data.session,
    note: !signRes.data.session
      ? 'Supabase Auth 이메일 인증이 켜져 있어, 첫 로그인 전에 확인 메일 인증이 필요합니다.'
      : '',
    message: profile
      ? '계정이 발급되었습니다.'
      : '계정은 생성되었으나 프로필 반영을 확인하지 못했습니다. 잠시 후 회원 목록에서 확인해 주세요.'
  };
}

/* ------------------------------------------------------------ 정산 */
function monthRange(month) {
  /* month: 'YYYY-MM' */
  var start = month + '-01';
  var parts = month.split('-');
  var endDate = new Date(Number(parts[0]), Number(parts[1]), 1);
  return { start: start, end: endDate.toISOString().slice(0, 10) };
}

export async function listOrgPayments(orgId, month) {
  var target = orgId || orgScope();
  if (!target) return [];
  var rows;
  if (live()) {
    var q = clientSync().from('payments').select('*').eq('org_id', target).order('created_at', { ascending: false });
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    rows = res.data || [];
  } else {
    rows = localRows('payments').filter(function (p) { return String(p.org_id) === String(target); }).slice();
  }
  if (month) {
    rows = rows.filter(function (p) { return String(p.created_at || '').slice(0, 7) === month; });
  }
  return rows;
}

export async function listOrgResults(orgId) {
  var target = orgId || orgScope();
  if (!target) return [];
  if (live()) {
    var res = await clientSync().from('brain_check_results').select('*').eq('org_id', target).order('measured_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return localRows('brain_results').filter(function (r) { return String(r.org_id) === String(target); });
}

export async function listOrgBookings(orgId) {
  var target = orgId || orgScope();
  if (!target) return [];
  if (live()) {
    var res = await clientSync().from('bookings').select('*').eq('org_id', target).order('preferred_date', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return localRows('bookings').filter(function (b) { return String(b.org_id) === String(target); });
}

export function settlementTotals(payments, commissionRate) {
  var paid = 0;
  var refunded = 0;
  (payments || []).forEach(function (p) {
    if (p.status === 'paid') paid += Number(p.amount || 0);
    else if (p.status === 'refunded') refunded += Number(p.amount || 0);
  });
  var rate = Number(commissionRate || 0);
  var commission = Math.round(paid * rate / 100);
  return {
    gross: paid,
    refund: refunded,
    commission_rate: rate,
    commission: commission,
    net: Math.max(0, paid - refunded - commission),
    count: (payments || []).filter(function (p) { return p.status === 'paid'; }).length
  };
}

export async function listSettlements(orgId) {
  var target = orgId || orgScope();
  if (live()) {
    var q = clientSync().from('settlements').select('*').order('period_month', { ascending: false });
    if (target) q = q.eq('org_id', target);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = localRows('settlements').slice();
  if (target) rows = rows.filter(function (s) { return String(s.org_id) === String(target); });
  return sortDesc(rows, 'period_month');
}

export async function createSettlement(orgId, month, commissionRate, note) {
  var target = orgId || orgScope();
  if (!target) throw new Error('기관 정보가 없습니다.');
  var payments = await listOrgPayments(target, month);
  var totals = settlementTotals(payments, commissionRate);
  var row = {
    org_id: target,
    period_month: month,
    gross_amount: totals.gross,
    refund_amount: totals.refund,
    commission_rate: totals.commission_rate,
    commission_amount: totals.commission,
    net_payout: totals.net,
    status: 'scheduled',
    note: note || ''
  };
  if (live()) {
    var res = await clientSync().from('settlements').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsertRow('settlements', row);
}

export async function markSettlementPaid(id) {
  var patch = { status: 'paid', paid_at: nowIso() };
  if (live()) {
    var res = await clientSync().from('settlements').update(patch).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdateRow('settlements', id, patch);
}

/* ------------------------------------------------- 제휴 대시보드 집계 */
export async function getPartnerMetrics(orgId) {
  var target = orgId || orgScope();
  var empty = {
    org_id: target, members: 0, newMembers: 0, bookings: 0, todayBookings: 0,
    checkBookings: 0, checkCompleted: 0, neuroSessions: 0, programUses: 0,
    revenue: 0, refund: 0, staffStats: [], resultReady: 0
  };
  if (!target) return empty;

  var memberships = [];
  var bookings = [];
  var payments = [];
  var results = [];
  var sessions = [];
  var profiles = [];

  if (live()) {
    var client = clientSync();
    var memberRes = await client.from('org_memberships').select('*').eq('org_id', target);
    if (memberRes.error) throw new Error(friendlyError(memberRes.error));
    memberships = memberRes.data || [];
    var ids = memberships.map(function (m) { return m.user_id; });

    var profileRes = await client.from('profiles').select('id,full_name,email,role,status,created_at,staff_role').eq('org_id', target);
    profiles = profileRes.error ? [] : (profileRes.data || []);

    if (ids.length) {
      var profRes2 = await client.from('profiles').select('id,full_name,email,role,status,created_at,staff_role').in('id', ids);
      if (!profRes2.error && profRes2.data) profiles = profiles.concat(profRes2.data);
    }

    var bookRes = await client.from('bookings').select('*').eq('org_id', target).order('preferred_date', { ascending: false });
    bookings = bookRes.error ? [] : (bookRes.data || []);

    var payRes = await client.from('payments').select('*').eq('org_id', target);
    payments = payRes.error ? [] : (payRes.data || []);

    var resRes = await client.from('brain_check_results').select('*').eq('org_id', target);
    results = resRes.error ? [] : (resRes.data || []);

    var sesRes = await client.from('neuro_training_sessions').select('*').eq('org_id', target);
    sessions = sesRes.error ? [] : (sesRes.data || []);
  } else {
    memberships = localRows('org_memberships').filter(function (m) { return String(m.org_id) === String(target); });
    profiles = localRows('profiles').filter(function (p) { return String(p.org_id) === String(target); });
    bookings = localRows('bookings').filter(function (b) { return String(b.org_id) === String(target); });
    payments = localRows('payments').filter(function (p) { return String(p.org_id) === String(target); });
    results = localRows('brain_results').filter(function (r) { return String(r.org_id) === String(target); });
    sessions = localRows('neuro_sessions').filter(function (s) { return String(s.org_id) === String(target); });
  }

  var approved = memberships.filter(function (m) { return m.status === 'approved'; });
  var today = todayStr();
  var monthAgo = new Date(Date.now() - 86400000 * 30).toISOString().slice(0, 10);
  var memberProfiles = profiles.filter(function (p) { return p.role === 'member'; });

  var revenue = payments.reduce(function (sum, p) { return p.status === 'paid' ? sum + Number(p.amount || 0) : sum; }, 0);
  var refund = payments.reduce(function (sum, p) { return p.status === 'refunded' ? sum + Number(p.amount || 0) : sum; }, 0);

  var staffMap = {};
  bookings.forEach(function (b) {
    if (b.status === 'canceled') return;
    var key = b.counselor_name || b.counselor_id || '미지정';
    if (!staffMap[key]) staffMap[key] = { name: key, bookings: 0, completed: 0 };
    staffMap[key].bookings += 1;
    if (b.status === 'completed') staffMap[key].completed += 1;
  });
  var staffStats = Object.keys(staffMap).map(function (k) { return staffMap[k]; })
    .sort(function (a, b) { return b.bookings - a.bookings; });

  return {
    org_id: target,
    members: memberProfiles.length || approved.length,
    newMembers: memberProfiles.filter(function (p) { return String(p.created_at || '').slice(0, 10) >= monthAgo; }).length,
    bookings: bookings.filter(function (b) { return b.status !== 'canceled'; }).length,
    todayBookings: bookings.filter(function (b) { return String(b.preferred_date) === today && b.status !== 'canceled'; }).length,
    checkBookings: bookings.filter(function (b) {
      var pid = String(b.program_id || '');
      return (pid.indexOf('brain_check') === 0) && (b.status === 'pending' || b.status === 'confirmed');
    }).length,
    checkCompleted: bookings.filter(function (b) {
      var pid = String(b.program_id || '');
      return pid.indexOf('brain_check') === 0 && b.status === 'completed';
    }).length,
    neuroSessions: sessions.length,
    programUses: bookings.filter(function (b) {
      var pid = String(b.program_id || '');
      return pid.indexOf('neuro') !== 0 && pid.indexOf('brain_check') !== 0 && b.status !== 'canceled';
    }).length,
    revenue: revenue,
    refund: refund,
    staffStats: staffStats,
    resultReady: results.filter(function (r) { return Boolean(r.file_path); }).length
  };
}

/* 기관 전용 상품: org_id가 지정된 프로그램 + 공용 프로그램 */
export async function listOrgPrograms(orgId) {
  var target = orgId || orgScope();
  var rows;
  if (live()) {
    var res = await clientSync().from('programs').select('*').order('sort_order', { ascending: true });
    if (res.error) throw new Error(friendlyError(res.error));
    rows = res.data || [];
  } else {
    rows = localRows('programs').slice();
  }
  return {
    own: rows.filter(function (p) { return String(p.org_id || '') === String(target); }),
    shared: rows.filter(function (p) { return !p.org_id; }),
    all: rows
  };
}

export async function saveOrgProgram(payload, id) {
  var row = {
    category: payload.category || 'brain_wellness',
    sub_category: payload.sub_category || '',
    title: payload.title,
    subtitle: payload.subtitle || '',
    description: payload.description || '',
    target_audience: payload.target_audience || '',
    format_method: payload.format_method || '',
    duration_text: payload.duration_text || '',
    price_krw: payload.price_krw === '' || payload.price_krw === null || payload.price_krw === undefined ? null : Number(payload.price_krw),
    price_label: payload.price_label || '상담 확정 · 관리자 설정가',
    session_count: Number(payload.session_count) || 1,
    includes_neurofeedback: Boolean(payload.includes_neurofeedback),
    org_id: payload.org_id || orgScope(),
    active: payload.active !== false,
    sort_order: Number(payload.sort_order) || 100,
    updated_at: nowIso()
  };
  if (live()) {
    if (id) {
      var res = await clientSync().from('programs').update(row).eq('id', id).select().maybeSingle();
      if (res.error) throw new Error(friendlyError(res.error));
      return res.data;
    }
    var newId = payload.id || (String(row.org_id).slice(0, 8) + '_' + Date.now().toString(36));
    var ins = await clientSync().from('programs').insert(Object.assign({ id: newId }, row)).select().maybeSingle();
    if (ins.error) throw new Error(friendlyError(ins.error));
    return ins.data;
  }
  if (id) return localUpdateRow('programs', id, row);
  return localInsertRow('programs', Object.assign({ id: 'local_' + Date.now().toString(36) }, row));
}

export async function setOrgProgramActive(id, active) {
  if (live()) {
    var res = await clientSync().from('programs').update({ active: Boolean(active), updated_at: nowIso() }).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdateRow('programs', id, { active: Boolean(active) });
}

/* 기관 관리자가 자기 기관 직원/회원 계정을 발급할 때 사용하는 위임 래퍼 */
export async function issueOrgMemberAccount(payload) {
  return issueAccount(Object.assign({}, payload, { role: 'member', org_id: payload.org_id || orgScope() }));
}

export async function issueStaffAccount(payload) {
  return issueAccount(Object.assign({}, payload, {
    role: 'staff',
    org_id: payload.org_id || orgScope()
  }));
}

export function canManageOrg(profile) {
  if (!profile) return false;
  return profile.role === 'admin' || profile.role === 'super_admin' || profile.role === 'partner_admin';
}

export function isGlobalAdmin(profile) {
  return Boolean(profile && (profile.role === 'admin' || profile.role === 'super_admin'));
}

export { isAdmin, isOrgWorker };
