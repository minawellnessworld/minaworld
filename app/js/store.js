/* =====================================================================
   MINA WORLD App — 데이터 스토어
   ---------------------------------------------------------------------
   - Supabase 연결 시: 실제 DB / Auth / Storage 사용 (mode = 'live')
   - 키 미연결 시: 브라우저 localStorage 체험 모드 (mode = 'local')
     · 프로그램·기수·쿠폰·기본 게시글만 시드로 보관
     · 개인 측정 데이터는 절대 임의 생성하지 않음 (빈 상태 표시)
   ===================================================================== */
import { CONFIG, POINT_DEFAULTS } from './config.js?v=2.0.22';
import { ensureClient, clientSync, signedResultUrl } from './supabase.js?v=2.0.22';
import { FALLBACK_PROGRAMS, FALLBACK_COHORTS, FALLBACK_COUPONS, FALLBACK_POSTS } from './catalog.js?v=2.0.22';

export var state = {
  mode: 'local',
  session: null,
  profile: null,
  ready: false
};

var listeners = [];

export function subscribe(fn) {
  listeners.push(fn);
  return function () {
    listeners = listeners.filter(function (f) { return f !== fn; });
  };
}

export function emit() {
  for (var i = 0; i < listeners.length; i++) {
    try { listeners[i](state); } catch (err) { console.error(err); }
  }
}

/* 본점(플랫폼) 직원: 전체 관리자 · 최고 관리자 · 본점 상담사 */
export function isStaff() {
  var role = state.profile ? state.profile.role : 'member';
  return role === 'admin' || role === 'super_admin' || role === 'counselor';
}

export function isAdmin() {
  var role = state.profile ? state.profile.role : '';
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdmin() {
  return Boolean(state.profile && state.profile.role === 'super_admin');
}

/* 제휴 기관 근무자: 기관 관리자 · 기관 직원 */
export function isOrgWorker() {
  var role = state.profile ? state.profile.role : '';
  return role === 'partner_admin' || role === 'staff';
}

export function isOrgAdmin() {
  return Boolean(state.profile && state.profile.role === 'partner_admin');
}

export function myOrgId() {
  return state.profile && state.profile.org_id ? state.profile.org_id : null;
}

/* 로그인 직후 이동할 기본 화면 */
export function homeRouteForRole() {
  var role = state.profile ? state.profile.role : '';
  if (role === 'admin' || role === 'super_admin' || role === 'counselor') return '/admin';
  if (role === 'partner_admin' || role === 'staff') return '/partner';
  return '/home';
}

export function currentUser() {
  return state.session && state.session.user ? state.session.user : null;
}

export function requireUid() {
  var user = currentUser();
  if (!user) throw new Error('로그인 후 이용해 주세요.');
  return user.id;
}

/* ------------------------------------------------------- 비밀번호 정책 (v2.0.8)
   Supabase Auth 설정(password_min_length 8, 영문+숫자)과 동일한 기준을
   화면에서 먼저 검사해 서버 오류 없이 안내합니다. */
export var PASSWORD_MIN_LENGTH = 8;

export function passwordIssue(password) {
  var pw = String(password || '');
  if (!pw) return '비밀번호를 입력해 주세요.';
  if (pw.length < PASSWORD_MIN_LENGTH) return '비밀번호는 8자 이상으로 설정해 주세요.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return '비밀번호에 영문과 숫자를 모두 포함해 주세요.';
  return '';
}

/* ---------------------------------------------------------------- utils */
function uid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}

export function nowIso() { return new Date().toISOString(); }

/* 로컬 체험 모드 저장소 접근자 (다른 store 모듈에서 사용) */
export function localRows(name) { return table(name); }
export function localInsertRow(name, row) { return localInsert(name, row); }
export function localUpdateRow(name, id, patch) { return localUpdate(name, id, patch); }
export function localDeleteRow(name, id) { return localDelete(name, id); }
export function saveLocalNow() { saveLocal(); }

export function dateKey(date) {
  var d = date || new Date();
  var m = ('0' + (d.getMonth() + 1)).slice(-2);
  var day = ('0' + d.getDate()).slice(-2);
  return d.getFullYear() + '-' + m + '-' + day;
}

export function todayStr() {
  return dateKey(new Date());
}

function clone(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
}

function sortRows(rows, key, desc) {
  return rows.slice().sort(function (a, b) {
    var av = a[key] === null || a[key] === undefined ? '' : a[key];
    var bv = b[key] === null || b[key] === undefined ? '' : b[key];
    if (av === bv) return 0;
    var result = av < bv ? -1 : 1;
    return desc ? -result : result;
  });
}

export function friendlyError(err) {
  var msg = (err && (err.message || err.error_description || err.hint)) || '';
  var code = err && err.code ? String(err.code) : '';
  if (/idx_bookings_no_overlap/i.test(msg)) return '이미 예약된 시간대입니다. 다른 시간을 선택해 주세요.';
  if (code === '23505' && /preferred_date|preferred_time/i.test(msg)) return '이미 예약된 시간대입니다. 다른 시간을 선택해 주세요.';
  if (/Invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (/Email not confirmed/i.test(msg)) return '이메일 인증이 필요합니다. 받은 편지함의 인증 메일을 확인해 주세요.';
  if (/User already registered|already been registered/i.test(msg)) return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if (/Password should be at least|password.*at least .* characters/i.test(msg)) return '비밀번호는 8자 이상이어야 합니다.';
  if (/Password should contain|password.*characters of each/i.test(msg)) return '비밀번호에 영문과 숫자를 모두 포함해 주세요.';
  if (/row-level security|new row violates|permission denied/i.test(msg)) return '이 작업을 수행할 권한이 없습니다. (관리자 권한 또는 정책 확인 필요)';
  if (/duplicate key/i.test(msg) || code === '23505') return '이미 등록된 값입니다.';
  if (/function .* does not exist|Could not find the function/i.test(msg)) return 'DB v2 마이그레이션(supabase_schema_v2.sql)이 아직 적용되지 않았습니다. 적용 후 다시 시도해 주세요.';
  if (/point_settings|point_transactions|admin_adjust_points/i.test(msg) && /does not exist|Could not find/i.test(msg)) return '포인트 기능 DB 마이그레이션(supabase_points_v4.sql)이 아직 적용되지 않았습니다. 적용 후 다시 시도해 주세요.';
  if (/보유 포인트가 부족합니다/.test(msg)) return msg;
  if (/최소 [0-9]+P 이상부터/.test(msg)) return msg;
  if (/관리자만 포인트를 조정할 수 있습니다/.test(msg)) return '포인트 조정은 총괄 관리자만 할 수 있습니다.';
  if (/relation .* does not exist/i.test(msg)) return 'DB v2 테이블이 아직 생성되지 않았습니다. supabase_schema_v2.sql 적용이 필요합니다.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return '네트워크 연결을 확인해 주세요.';
  return msg || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.';
}

/* --------------------------------------------------- local backend (체험) */
var LOCAL_KEY = 'mina.world.app.v1';
var LDB = null;

function seedLocal() {
  var db = {
    version: 1,
    accounts: [],
    profiles: [],
    programs: clone(FALLBACK_PROGRAMS),
    cohorts: clone(FALLBACK_COHORTS),
    coupons: clone(FALLBACK_COUPONS),
    community_posts: clone(FALLBACK_POSTS),
    community_comments: [],
    bookings: [],
    payments: [],
    brain_results: [],
    neuro_packages: [],
    neuro_sessions: [],
    wellness_logs: [],
    academy_enrollments: [],
    academy_materials: [],
    consultation_notes: [],
    notification_logs: [],
    organizations: [
      {
        id: '11111111-1111-4111-8111-111111111111', name: 'MINA WORLD 본점', org_type: 'wellness',
        ceo_name: '이미나', contact_name: '이미나 대표', contact_phone: '010-5424-0807',
        contact_email: 'minawellnessworld@gmail.com', address: '경기도 여주시 · 서울 송파구',
        status: 'active', commission_rate: 0, business_no: '', contract_start: null, contract_end: null,
        settlement_bank: '', settlement_account: '', notes: 'MINA Wellness World 직영 본점',
        created_at: nowIso()
      }
    ],
    branches: [
      {
        id: '22222222-2222-4222-8222-222222222222', org_id: '11111111-1111-4111-8111-111111111111',
        name: 'MINA WORLD 직영 본점', address: '예약 확정 후 상세 위치 안내', phone: '010-5424-0807',
        status: 'active', created_at: nowIso()
      }
    ],
    org_memberships: [],
    org_schedules: [1, 2, 3, 4, 5, 6].map(function (d) {
      return {
        id: 'sched-' + d,
        org_id: '11111111-1111-4111-8111-111111111111',
        branch_id: '22222222-2222-4222-8222-222222222222',
        counselor_id: null, weekday: d, open_time: '10:00', close_time: '19:00',
        slot_minutes: 60, is_active: true, created_at: nowIso()
      };
    }),
    settlements: [],
    consent_logs: [],
    audit_logs: [],
    account_pre_assignments: [],
    point_settings: [{
      id: 1,
      krw_per_point: POINT_DEFAULTS.krw_per_point,
      checkin_reward_points: POINT_DEFAULTS.checkin_reward_points,
      min_use_points: POINT_DEFAULTS.min_use_points,
      updated_at: nowIso()
    }],
    point_transactions: [],
    auth_session: null
  };
  return db;
}

function local() {
  if (LDB) return LDB;
  try {
    var raw = localStorage.getItem(LOCAL_KEY);
    if (raw) {
      LDB = JSON.parse(raw);
      if (!LDB || !LDB.programs) LDB = seedLocal();
    } else {
      LDB = seedLocal();
    }
  } catch (err) {
    console.warn('[MINA] 로컬 저장소를 읽지 못했습니다.', err);
    LDB = seedLocal();
  }
  return LDB;
}

function saveLocal() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(LDB));
  } catch (err) {
    console.warn('[MINA] 로컬 저장소에 기록하지 못했습니다.', err);
  }
}

function table(name) {
  var db = local();
  if (!db[name]) db[name] = [];
  return db[name];
}

function localInsert(name, row) {
  var db = local();
  if (!db[name]) db[name] = [];
  var record = Object.assign({}, row);
  if (!record.id) record.id = uid();
  if (!record.created_at) record.created_at = nowIso();
  db[name].push(record);
  saveLocal();
  return clone(record);
}

function localUpdate(name, id, patch) {
  var rows = table(name);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) {
      Object.assign(rows[i], patch, { updated_at: nowIso() });
      saveLocal();
      return clone(rows[i]);
    }
  }
  return null;
}

function localDelete(name, id) {
  var db = local();
  var rows = db[name] || [];
  db[name] = rows.filter(function (row) { return row.id !== id; });
  saveLocal();
}

async function hashPassword(password) {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle && typeof TextEncoder !== 'undefined') {
      var buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(password));
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    }
  } catch (err) { /* fall through */ }
  return 'plain:' + password;
}

/* ---------------------------------------------------------------- boot */
export async function boot() {
  var client = await ensureClient();
  state.mode = client ? 'live' : 'local';

  if (client) {
    try {
      var res = await client.auth.getSession();
      state.session = res && res.data ? res.data.session || null : null;
    } catch (err) {
      console.warn('[MINA] 세션 확인 실패', err);
      state.session = null;
    }
    client.auth.onAuthStateChange(function (event, session) {
      state.session = session || null;
      if (session) {
        refreshProfile().catch(function (err) { console.error(err); });
      } else {
        state.profile = null;
        emit();
      }
    });
    if (state.session) {
      try { await refreshProfile(); } catch (err) { console.warn(err); }
    }
  } else {
    var db = local();
    if (db.auth_session && db.auth_session.id) {
      state.session = { user: { id: db.auth_session.id, email: db.auth_session.email } };
      state.profile = findProfile(db.auth_session.id);
    }
  }

  state.ready = true;
  emit();
  return state;
}

function findProfile(id) {
  var rows = local().profiles;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return clone(rows[i]);
  }
  return null;
}

export async function refreshProfile() {
  if (!state.session || !state.session.user) {
    state.profile = null;
    emit();
    return null;
  }
  if (state.mode === 'live') {
    var client = clientSync();
    var res = await client.from('profiles').select('*').eq('id', state.session.user.id).maybeSingle();
    if (res.error) {
      console.warn('[MINA] 프로필 조회 실패', res.error);
      state.profile = null;
    } else {
      state.profile = res.data;
    }
  } else {
    state.profile = findProfile(state.session.user.id);
  }
  emit();
  return state.profile;
}

/* ---------------------------------------------------------------- auth */
export async function signIn(email, password) {
  var mail = String(email || '').trim().toLowerCase();
  if (!mail || !password) throw new Error('이메일과 비밀번호를 입력해 주세요.');

  if (state.mode === 'live') {
    var res = await clientSync().auth.signInWithPassword({ email: mail, password: password });
    if (res.error) throw new Error(friendlyError(res.error));
    state.session = res.data.session;
    await refreshProfile();
    var status = state.profile ? state.profile.status : 'active';
    if (status === 'suspended' || status === 'withdrawn') {
      try { await clientSync().auth.signOut(); } catch (err) { console.warn(err); }
      state.session = null;
      state.profile = null;
      emit();
      throw new Error(status === 'suspended'
        ? '이용이 정지된 계정입니다. MINA WORLD 대표 메일로 문의해 주세요.'
        : '탈퇴 처리된 계정입니다. 다시 이용하려면 회원가입이 필요합니다.');
    }
    return { ok: true };
  }

  var db = local();
  var account = null;
  for (var i = 0; i < db.accounts.length; i++) {
    if (db.accounts[i].email === mail) account = db.accounts[i];
  }
  if (!account) throw new Error('등록된 계정이 없습니다. 회원가입을 먼저 해 주세요. (로컬 체험 모드)');
  var hashed = await hashPassword(password);
  if (account.password_hash !== hashed) throw new Error('비밀번호가 올바르지 않습니다.');
  db.auth_session = { id: account.id, email: account.email };
  saveLocal();
  state.session = { user: { id: account.id, email: account.email } };
  state.profile = findProfile(account.id);
  emit();
  return { ok: true };
}

export async function signUp(payload) {
  var mail = String(payload.email || '').trim().toLowerCase();
  var password = String(payload.password || '');
  var fullName = String(payload.fullName || '').trim();
  var phone = String(payload.phone || '').trim();
  if (!mail || !password) throw new Error('이메일과 비밀번호를 입력해 주세요.');
  var pwIssue = passwordIssue(password);
  if (pwIssue) throw new Error(pwIssue);
  if (!fullName) throw new Error('이름을 입력해 주세요.');

  if (state.mode === 'live') {
    var res = await clientSync().auth.signUp({
      email: mail,
      password: password,
      options: { data: { full_name: fullName, phone: phone } }
    });
    if (res.error) throw new Error(friendlyError(res.error));
    if (!res.data.session) {
      return { needsConfirmation: true, message: '가입 확인 메일을 발송했습니다. 메일의 인증 링크를 누른 뒤 로그인해 주세요.' };
    }
    state.session = res.data.session;
    await refreshProfile();
    return { ok: true };
  }

  var db = local();
  for (var i = 0; i < db.accounts.length; i++) {
    if (db.accounts[i].email === mail) throw new Error('이미 가입된 이메일입니다. 로그인해 주세요.');
  }
  var id = uid();
  var isOwner = mail === 'minawellnessworld@gmail.com';
  db.accounts.push({ id: id, email: mail, password_hash: await hashPassword(password), created_at: nowIso() });
  db.profiles.push({
    id: id,
    email: mail,
    full_name: fullName,
    phone: phone,
    role: isOwner ? 'admin' : 'member',
    member_grade: isOwner ? 'Alignment' : 'Welcome',
    goals: [],
    goal_note: '',
    org_id: null,
    branch_id: null,
    points_balance: 0,
    created_at: nowIso(),
    updated_at: nowIso()
  });
  db.auth_session = { id: id, email: mail };
  saveLocal();
  state.session = { user: { id: id, email: mail } };
  state.profile = findProfile(id);
  emit();
  return { ok: true };
}

export async function signOut() {
  if (state.mode === 'live') {
    try { await clientSync().auth.signOut(); } catch (err) { console.warn(err); }
  } else {
    var db = local();
    db.auth_session = null;
    saveLocal();
  }
  state.session = null;
  state.profile = null;
  emit();
}

/* ------------------------------------------------------------ profiles */
export async function updateProfile(patch) {
  var id = requireUid();
  if (state.mode === 'live') {
    var res = await clientSync().from('profiles').update(patch).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    state.profile = res.data;
  } else {
    var row = localUpdate('profiles', id, patch);
    state.profile = row;
  }
  emit();
  return state.profile;
}

export async function listProfiles() {
  if (state.mode === 'live') {
    var res = await clientSync().from('profiles').select('*').order('created_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return sortRows(clone(local().profiles), 'created_at', true);
}

export async function adminUpdateProfile(id, patch) {
  if (state.mode === 'live') {
    var res = await clientSync().from('profiles').update(patch).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdate('profiles', id, patch);
}

/* ------------------------------------------------------------ programs */
export async function getPrograms(category) {
  if (state.mode === 'live') {
    var q = clientSync().from('programs').select('*').eq('active', true).order('sort_order', { ascending: true });
    if (category) q = q.eq('category', category);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = local().programs.filter(function (p) {
    return p.active !== false && (!category || p.category === category);
  });
  return sortRows(clone(rows), 'sort_order', false);
}

export async function getProgram(id) {
  if (!id) return null;
  if (state.mode === 'live') {
    var res = await clientSync().from('programs').select('*').eq('id', id).maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  var rows = local().programs;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return clone(rows[i]);
  }
  return null;
}

export async function listAllPrograms() {
  if (state.mode === 'live') {
    var res = await clientSync().from('programs').select('*').order('sort_order', { ascending: true });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return sortRows(clone(local().programs), 'sort_order', false);
}

export async function adminUpdateProgram(id, patch) {
  var payload = Object.assign({}, patch, { updated_at: nowIso() });
  if (state.mode === 'live') {
    var res = await clientSync().from('programs').update(payload).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdate('programs', id, payload);
}

/* -------------------------------------------------------------- coupons */
export async function listCoupons() {
  if (state.mode === 'live') {
    var res = await clientSync().from('coupons').select('*').order('created_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return sortRows(clone(local().coupons), 'created_at', true);
}

export async function validateCoupon(code, amount) {
  var normalized = String(code || '').trim().toUpperCase();
  if (!normalized) return { ok: false, message: '쿠폰 코드를 입력해 주세요.' };
  var list = await listCoupons();
  var coupon = null;
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].code).toUpperCase() === normalized) coupon = list[i];
  }
  if (!coupon || coupon.active === false) return { ok: false, message: '사용할 수 없는 쿠폰 코드입니다.' };
  if (coupon.expires_at && coupon.expires_at < todayStr()) return { ok: false, message: '유효기간이 지난 쿠폰입니다.' };
  if (amount < (coupon.min_amount || 0)) {
    return { ok: false, message: '최소 결제 금액 ' + Number(coupon.min_amount).toLocaleString('ko-KR') + '원 이상일 때 사용할 수 있습니다.' };
  }
  var discount = 0;
  if (coupon.discount_type === 'percent') discount = Math.floor(amount * Number(coupon.discount_value) / 100);
  else discount = Number(coupon.discount_value);
  discount = Math.max(0, Math.min(amount, discount));
  return { ok: true, coupon: coupon, discount: discount, message: coupon.title + ' 적용 (' + discount.toLocaleString('ko-KR') + '원 할인)' };
}

export async function adminCreateCoupon(payload) {
  var row = Object.assign({}, payload, { code: String(payload.code || '').trim().toUpperCase(), created_at: nowIso() });
  if (state.mode === 'live') {
    var res = await clientSync().from('coupons').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  var existing = local().coupons.filter(function (c) { return c.code === row.code; });
  if (existing.length) throw new Error('이미 존재하는 쿠폰 코드입니다.');
  return localInsert('coupons', row);
}

export async function adminUpdateCoupon(code, patch) {
  if (state.mode === 'live') {
    var res = await clientSync().from('coupons').update(patch).eq('code', code).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  var db = local();
  for (var i = 0; i < db.coupons.length; i++) {
    if (db.coupons[i].code === code) {
      Object.assign(db.coupons[i], patch);
      saveLocal();
      return clone(db.coupons[i]);
    }
  }
  return null;
}

/* -------------------------------------------------------------- bookings */
export async function listBookings(userId) {
  if (state.mode === 'live') {
    var q = clientSync().from('bookings').select('*').order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    else if (!isStaff()) q = q.eq('user_id', requireUid());
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = clone(local().bookings);
  if (userId) rows = rows.filter(function (b) { return b.user_id === userId; });
  else if (!isStaff()) rows = rows.filter(function (b) { return b.user_id === requireUid(); });
  return sortRows(rows, 'created_at', true);
}

export async function createBooking(payload) {
  var id = payload.user_id && (isAdmin() || isOrgWorker()) ? payload.user_id : requireUid();
  var profile = state.profile || {};
  var method = payload.payment_method || 'pg_integration_required';
  var isBank = method === 'bank_transfer';
  var isOnsite = method === 'onsite';
  var row = {
    user_id: id,
    program_id: payload.program_id,
    program_title: payload.program_title,
    preferred_date: payload.preferred_date,
    preferred_time: payload.preferred_time,
    booker_name: payload.booker_name || profile.full_name || '',
    booker_phone: payload.booker_phone || profile.phone || '',
    note: payload.note || '',
    coupon_code: payload.coupon_code || null,
    original_amount: payload.original_amount || 0,
    discount_amount: payload.discount_amount || 0,
    final_amount: payload.final_amount || 0,
    points_used: Math.max(0, Math.round(Number(payload.points_used || 0))),
    points_discount_amount: 0,
    status: payload.status || 'pending',
    payment_status: isBank ? 'bank_transfer' : isOnsite ? 'pending_pg' : 'pending_pg',
    counselor_id: payload.counselor_id || null,
    counselor_name: payload.counselor_name || '',
    branch_name: payload.branch_name || '',
    org_id: payload.org_id || profile.org_id || null,
    branch_id: payload.branch_id || null
  };

  var booking;
  if (state.mode === 'live') {
    var res = await clientSync().from('bookings').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    booking = res.data;
  } else {
    var localRows = table('bookings');
    for (var q = 0; q < localRows.length; q++) {
      var b = localRows[q];
      if (b.preferred_date === row.preferred_date && b.preferred_time === row.preferred_time &&
        String(b.branch_id || '') === String(row.branch_id || '') &&
        String(b.counselor_id || '') === String(row.counselor_id || '') &&
        (b.status === 'pending' || b.status === 'confirmed')) {
        throw new Error('이미 예약된 시간대입니다. 다른 시간을 선택해 주세요.');
      }
    }
    /* 로컬 체험 모드: DB 트리거 대신 같은 규칙(쿠폰 후 금액 기준 · 잔액 검증)으로 계산 */
    var localRow = Object.assign({}, row);
    var settings = localPointSettings();
    var reqPts = Math.max(0, Number(localRow.points_used || 0));
    var afterCoupon = Math.max(0, Number(localRow.original_amount || 0) - Number(localRow.discount_amount || 0));
    if (reqPts > 0) {
      var me = findProfile(id) || {};
      var bal = Number(me.points_balance || 0);
      if (reqPts > bal) throw new Error('보유 포인트가 부족합니다. (보유 ' + bal + 'P)');
      if (Number(settings.min_use_points || 0) > 0 && reqPts < Number(settings.min_use_points)) {
        throw new Error('최소 ' + settings.min_use_points + 'P 이상부터 사용할 수 있습니다.');
      }
      var krw = Math.max(1, Number(settings.krw_per_point || 1));
      var usedPts = Math.min(reqPts, Math.max(0, Math.floor(afterCoupon / krw)));
      localRow.points_used = usedPts;
      localRow.points_discount_amount = usedPts * krw;
      localRow.final_amount = Math.max(0, afterCoupon - localRow.points_discount_amount);
    }
    booking = localInsert('bookings', localRow);
    if (Number(localRow.points_used || 0) > 0) {
      localAddPointsLog(id, -Number(localRow.points_used), 'booking_use',
        (localRow.program_title || '예약') + ' 예약 포인트 사용 (' + localRow.points_used + 'P)',
        { booking_id: booking.id, org_id: localRow.org_id || null });
      try { state.profile = findProfile(id); emit(); } catch (err) { console.warn(err); }
    }
  }

  var paymentRow = {
    booking_id: booking.id,
    user_id: id,
    org_id: booking.org_id || null,
    title: booking.program_title + ' · ' + booking.preferred_date + ' ' + booking.preferred_time,
    amount: booking.final_amount,
    method: method,
    status: isBank ? 'pending_deposit' : 'integration_required',
    receipt_note: isBank
      ? '무통장 입금 대기 · 입금 확인 후 예약 확정'
      : (isOnsite
        ? '현장 결제 예정 · 방문 시 결제 확인'
        : '온라인 PG 결제 키 연동 전 · 예약 접수 및 계좌/현장 확인 대기')
  };

  if (state.mode === 'live') {
    var payRes = await clientSync().from('payments').insert(paymentRow).select().maybeSingle();
    if (payRes.error) console.warn('[MINA] 결제 기록 생성 실패', payRes.error);
  } else {
    localInsert('payments', paymentRow);
  }

  try {
    await createNotification({
      user_id: id,
      title: '예약이 접수되었습니다',
      body: booking.program_title + ' · ' + booking.preferred_date + ' ' + booking.preferred_time +
        ' (결제 모듈 연동 대기 · 예약 접수 상태)',
      channel: 'in_app',
      delivery_status: 'saved_in_app'
    });
  } catch (err) {
    console.warn('[MINA] 알림 기록 실패', err);
  }

  /* 포인트 사용·적립이 반영되었으니 잔액을 다시 읽습니다. */
  try { await refreshProfile(); } catch (err) { console.warn('[MINA] 포인트 잔액 갱신 실패', err); }

  return booking;
}

/* 예약 가능 시간대 조회 — 중복 예약 시간대를 비활성화하기 위한 RPC
   get_booked_slots(date, branch_id, counselor_id) → text[] (시간 문자열만 반환, 타인 정보 없음) */
export async function getBookedSlots(date, branchId, counselorId) {
  if (!date) return [];
  if (state.mode === 'live') {
    var res = await clientSync().rpc('get_booked_slots', {
      p_date: date,
      p_branch_id: branchId || null,
      p_counselor_id: counselorId || null
    });
    if (res.error) throw new Error(friendlyError(res.error));
    return Array.isArray(res.data) ? res.data : [];
  }
  var rows = local().bookings.filter(function (b) {
    return String(b.preferred_date) === String(date) &&
      (b.status === 'pending' || b.status === 'confirmed') &&
      String(b.branch_id || '22222222-2222-4222-8222-222222222222') === String(branchId || '22222222-2222-4222-8222-222222222222') &&
      String(b.counselor_id || '00000000-0000-0000-0000-000000000000') === String(counselorId || '00000000-0000-0000-0000-000000000000');
  });
  return rows.map(function (b) { return b.preferred_time; });
}

export async function updateBooking(id, patch) {
  var payload = Object.assign({}, patch, { updated_at: nowIso() });
  var updated;
  if (state.mode === 'live') {
    var res = await clientSync().from('bookings').update(payload).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    updated = res.data;
  } else {
    updated = localUpdate('bookings', id, payload);
  }
  /* 취소 시 포인트 복구가 일어나므로 잔액을 다시 읽습니다. */
  try { await refreshProfile(); } catch (err) { console.warn('[MINA] 포인트 잔액 갱신 실패', err); }
  return updated;
}

export async function cancelBooking(id) {
  return updateBooking(id, { status: 'canceled' });
}

export async function adminSetBookingStatus(id, status) {
  var booking = await updateBooking(id, { status: status });
  if (booking && state.mode === 'live') {
    // 예약 상태에 맞춰 결제 상태도 함께 안내 (입금확인/완료)
    if (status === 'completed') {
      try { await adminSetBookingPayment(id, 'paid'); } catch (err) { console.warn(err); }
    }
  }
  return booking;
}

export async function adminSetBookingPayment(bookingId, status) {
  var patch = { status: status };
  if (state.mode === 'live') {
    var res = await clientSync().from('bookings').update({ payment_status: status === 'paid' ? 'paid' : status === 'pending_deposit' ? 'bank_transfer' : status === 'refunded' ? 'refunded' : 'pending_pg' }).eq('id', bookingId).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    var payRes = await clientSync().from('payments').update(patch).eq('booking_id', bookingId).select();
    if (payRes.error) console.warn('[MINA] 결제 상태 변경 실패', payRes.error);
    try { await refreshProfile(); } catch (err) { console.warn('[MINA] 포인트 잔액 갱신 실패', err); }
    return res.data;
  }
  var booking = localUpdate('bookings', bookingId, {
    payment_status: status === 'paid' ? 'paid' : status === 'pending_deposit' ? 'bank_transfer' : status === 'refunded' ? 'refunded' : 'pending_pg'
  });
  var rows = table('payments');
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].booking_id === bookingId) rows[i].status = status;
  }
  saveLocal();
  return booking;
}

/* -------------------------------------------------------------- payments */
export async function listPayments(userId) {
  if (state.mode === 'live') {
    var q = clientSync().from('payments').select('*').order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    else if (!isAdmin()) q = q.eq('user_id', requireUid());
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = clone(local().payments);
  if (userId) rows = rows.filter(function (p) { return p.user_id === userId; });
  else if (!isAdmin()) rows = rows.filter(function (p) { return p.user_id === requireUid(); });
  return sortRows(rows, 'created_at', true);
}

export async function adminSetPaymentStatus(id, status) {
  if (state.mode === 'live') {
    var res = await clientSync().from('payments').update({ status: status }).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdate('payments', id, { status: status });
}

/* ------------------------------------------------------- brain results */
export async function listResults(userId) {
  if (state.mode === 'live') {
    var q = clientSync().from('brain_check_results').select('*').order('measured_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    else if (!isStaff()) q = q.eq('user_id', requireUid());
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = clone(local().brain_results);
  if (userId) rows = rows.filter(function (r) { return r.user_id === userId; });
  else if (!isStaff()) rows = rows.filter(function (r) { return r.user_id === requireUid(); });
  return sortRows(rows, 'measured_at', true);
}

export async function uploadResultFile(userId, file) {
  if (!file) return { file_path: '', file_name: '' };
  var safeName = String(file.name || 'result').replace(/[^A-Za-z0-9._-]/g, '_');
  var path = userId + '/' + Date.now() + '_' + safeName;
  if (state.mode === 'live') {
    var res = await clientSync().storage.from(CONFIG.STORAGE_BUCKET).upload(path, file, { upsert: true, contentType: file.type || 'application/octet-stream' });
    if (res.error) {
      var detail = String(res.error.message || '');
      if (/bucket not found|NoSuchBucket/i.test(detail)) {
        throw new Error('결과지 저장소(Storage 버킷 brain-results)가 아직 생성되지 않았습니다. Supabase Storage에서 비공개 버킷 brain-results를 만든 뒤 다시 시도해 주세요.');
      }
      throw new Error('결과지 파일 업로드 실패: ' + friendlyError(res.error));
    }
    return { file_path: path, file_name: file.name };
  }
  return { file_path: 'local/' + path, file_name: file.name, localOnly: true };
}

export async function adminSaveResult(payload) {
  var row = Object.assign({}, payload, { created_by: currentUser() ? currentUser().id : null, created_at: nowIso() });
  if (state.mode === 'live') {
    var res = await clientSync().from('brain_check_results').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('brain_results', row);
}

export async function adminUpdateResult(id, patch) {
  if (state.mode === 'live') {
    var res = await clientSync().from('brain_check_results').update(patch).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdate('brain_results', id, patch);
}

export async function adminDeleteResult(id) {
  if (state.mode === 'live') {
    var res = await clientSync().from('brain_check_results').delete().eq('id', id);
    if (res.error) throw new Error(friendlyError(res.error));
    return true;
  }
  localDelete('brain_results', id);
  return true;
}

export async function getSignedResultUrl(path) {
  if (state.mode === 'live') return signedResultUrl(path, 600);
  return '';
}

/* --------------------------------------------------- neuro packages etc. */
export async function listPackages(userId) {
  if (state.mode === 'live') {
    var q = clientSync().from('neuro_packages').select('*').order('purchased_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    else if (!isStaff()) q = q.eq('user_id', requireUid());
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = clone(local().neuro_packages);
  if (userId) rows = rows.filter(function (p) { return p.user_id === userId; });
  else if (!isStaff()) rows = rows.filter(function (p) { return p.user_id === requireUid(); });
  return sortRows(rows, 'purchased_at', true);
}

export async function listSessions(userId, packageId) {
  if (state.mode === 'live') {
    var q = clientSync().from('neuro_training_sessions').select('*').order('trained_at', { ascending: true });
    if (userId) q = q.eq('user_id', userId);
    else if (!isStaff()) q = q.eq('user_id', requireUid());
    if (packageId) q = q.eq('package_id', packageId);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = clone(local().neuro_sessions);
  if (userId) rows = rows.filter(function (s) { return s.user_id === userId; });
  else if (!isStaff()) rows = rows.filter(function (s) { return s.user_id === requireUid(); });
  if (packageId) rows = rows.filter(function (s) { return s.package_id === packageId; });
  return sortRows(rows, 'session_no', false);
}

export async function adminSavePackage(payload) {
  var row = Object.assign({ used_sessions: 0, status: 'active', purchased_at: nowIso() }, payload);
  if (state.mode === 'live') {
    var res = await clientSync().from('neuro_packages').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('neuro_packages', row);
}

export async function adminUpdatePackage(id, patch) {
  if (state.mode === 'live') {
    var res = await clientSync().from('neuro_packages').update(patch).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdate('neuro_packages', id, patch);
}

export async function adminSaveSession(payload, options) {
  var opts = options || {};
  var row = Object.assign({ created_by: currentUser() ? currentUser().id : null, created_at: nowIso() }, payload);
  var saved;
  if (state.mode === 'live') {
    var res = await clientSync().from('neuro_training_sessions').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    saved = res.data;
  } else {
    saved = localInsert('neuro_sessions', row);
  }
  if (row.package_id && opts.decrement_package !== false) {
    var packages = await listPackages(row.user_id);
    var target = null;
    for (var i = 0; i < packages.length; i++) {
      if (packages[i].id === row.package_id) target = packages[i];
    }
    if (target) {
      var used = Math.min(Number(target.total_sessions), Number(target.used_sessions || 0) + 1);
      await adminUpdatePackage(target.id, {
        used_sessions: used,
        status: used >= Number(target.total_sessions) ? 'completed' : 'active'
      });
    }
  }
  return saved;
}

/* --------------------------------------------------------------- points */
/* 포인트 정책(1P당 원 · 체크인 적립 P · 최소 사용 P) — DB point_settings 단일 행 */
function localPointSettings() {
  var rows = table('point_settings');
  var row = rows && rows.length ? rows[0] : {};
  var krw = Number(row.krw_per_point);
  var reward = Number(row.checkin_reward_points);
  var minUse = Number(row.min_use_points);
  return {
    id: 1,
    krw_per_point: isFinite(krw) && krw >= 1 ? krw : POINT_DEFAULTS.krw_per_point,
    checkin_reward_points: isFinite(reward) && reward >= 0 ? reward : POINT_DEFAULTS.checkin_reward_points,
    min_use_points: isFinite(minUse) && minUse >= 0 ? minUse : POINT_DEFAULTS.min_use_points,
    updated_at: row.updated_at || nowIso()
  };
}

function localPointTransactionsOf(userId) {
  return clone(table('point_transactions')).filter(function (tx) {
    return String(tx.user_id) === String(userId);
  });
}

/* 로컬 체험 모드 전용: 잔액 반영 + 원장 기록 (서버 트리거 역할) */
function localAddPointsLog(userId, delta, reason, description, extra) {
  var db = local();
  var prof = null;
  for (var i = 0; i < db.profiles.length; i++) {
    if (String(db.profiles[i].id) === String(userId)) prof = db.profiles[i];
  }
  if (!prof) throw new Error('회원 정보를 찾지 못했습니다.');
  var next = Number(prof.points_balance || 0) + Number(delta);
  if (next < 0) throw new Error('보유 포인트가 부족합니다.');
  prof.points_balance = next;
  saveLocal();
  return localInsert('point_transactions', Object.assign({
    user_id: userId,
    delta: Number(delta),
    balance_after: next,
    reason: reason,
    description: description || ''
  }, extra || {}));
}

export async function getPointSettings() {
  if (state.mode === 'live') {
    try {
      var res = await clientSync().from('point_settings').select('*').eq('id', 1).maybeSingle();
      if (res.error || !res.data) return Object.assign({ id: 1 }, POINT_DEFAULTS);
      return res.data;
    } catch (err) {
      console.warn('[MINA] 포인트 설정 조회 실패', err);
      return Object.assign({ id: 1 }, POINT_DEFAULTS);
    }
  }
  return localPointSettings();
}

export async function listPointTransactions(userId, limit) {
  var uidValue = userId || (state.session && state.session.user ? state.session.user.id : '');
  if (state.mode === 'live') {
    var q = clientSync().from('point_transactions').select('*').order('created_at', { ascending: false });
    if (uidValue) q = q.eq('user_id', uidValue);
    var res = await q.limit(limit || 20);
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = uidValue ? localPointTransactionsOf(uidValue) : [];
  rows = sortRows(rows, 'created_at', true);
  return limit ? rows.slice(0, limit) : rows;
}

/* 관리자: 전체 회원 포인트 내역 */
export async function listAllPointTransactions(limit) {
  if (state.mode === 'live') {
    var res = await clientSync().from('point_transactions').select('*').order('created_at', { ascending: false }).limit(limit || 50);
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return sortRows(clone(table('point_transactions')), 'created_at', true).slice(0, limit || 50);
}

export async function adminUpdatePointSettings(patch) {
  var payload = {
    krw_per_point: Math.max(1, Math.round(Number(patch.krw_per_point || POINT_DEFAULTS.krw_per_point))),
    checkin_reward_points: Math.max(0, Math.round(Number(patch.checkin_reward_points || 0))),
    min_use_points: Math.max(0, Math.round(Number(patch.min_use_points || 0))),
    updated_at: nowIso()
  };
  if (state.mode === 'live') {
    var res = await clientSync().from('point_settings').update(payload).eq('id', 1).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    if (!res.data) {
      var ins = await clientSync().from('point_settings').insert(Object.assign({ id: 1 }, payload)).select().maybeSingle();
      if (ins.error) throw new Error(friendlyError(ins.error));
      return ins.data;
    }
    return res.data;
  }
  var rows = table('point_settings');
  if (!rows.length) return localInsert('point_settings', Object.assign({ id: 1 }, payload));
  Object.assign(rows[0], payload);
  saveLocal();
  return clone(rows[0]);
}

/* 관리자 수동 지급(+)/차감(-) — 서버 RPC admin_adjust_points 가 잔액과 원장을 함께 기록 */
export async function adminAdjustPoints(userId, delta, description) {
  var amount = Math.round(Number(delta));
  if (!userId) throw new Error('포인트를 조정할 회원을 선택해 주세요.');
  if (!isFinite(amount) || amount === 0) throw new Error('조정할 포인트를 입력해 주세요. (지급은 +, 차감은 -)');
  var desc = String(description || '').trim() || '관리자 포인트 조정';
  if (state.mode === 'live') {
    var res = await clientSync().rpc('admin_adjust_points', {
      p_user_id: userId,
      p_delta: amount,
      p_description: desc
    });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  var tx = localAddPointsLog(userId, amount, 'admin_adjust', desc, { created_by: state.session ? state.session.user.id : null });
  return tx.balance_after;
}

/* ------------------------------------------------------------- wellness */
export async function listWellness(userId, limit) {
  var rows;
  if (state.mode === 'live') {
    var q = clientSync().from('wellness_logs').select('*').order('logged_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    else if (!isStaff()) q = q.eq('user_id', requireUid());
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    rows = res.data || [];
  } else {
    rows = clone(local().wellness_logs);
    if (userId) rows = rows.filter(function (w) { return w.user_id === userId; });
    else if (!isStaff()) rows = rows.filter(function (w) { return w.user_id === requireUid(); });
    rows = sortRows(rows, 'logged_at', true);
  }
  if (limit) rows = rows.slice(0, limit);
  return rows;
}

/* 오늘의 뇌 컨디션 체크인 저장
   서버(wellness_logs AFTER INSERT 트리거)가 하루 1회 포인트를 적립합니다.
   반환: { log, awardedPoints, pointsBalance } — 이번 저장으로 실제 적립된 P 와 현재 잔액 */
export async function addWellness(payload) {
  var id = requireUid();
  var beforeBalance = state.profile && state.profile.points_balance !== undefined && state.profile.points_balance !== null
    ? Number(state.profile.points_balance) : null;
  var row = {
    user_id: id,
    logged_at: payload.logged_at || todayStr(),
    condition_label: payload.condition_label || '일일 체크인',
    focus_level: payload.focus_level,
    stress_level: payload.stress_level,
    sleep_level: payload.sleep_level,
    memo: payload.memo || ''
  };
  var saved = null;
  var awardedPoints = 0;

  if (state.mode === 'live') {
    var res = await clientSync().from('wellness_logs').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    saved = res.data;
    try {
      await refreshProfile();
      var afterBalance = state.profile && state.profile.points_balance !== undefined && state.profile.points_balance !== null
        ? Number(state.profile.points_balance) : null;
      if (beforeBalance !== null && afterBalance !== null) awardedPoints = Math.max(0, afterBalance - beforeBalance);
    } catch (err) {
      console.warn('[MINA] 포인트 적립 확인 실패', err);
    }
  } else {
    saved = localInsert('wellness_logs', row);
    var settings = localPointSettings();
    var reward = Math.max(0, Number(settings.checkin_reward_points || 0));
    var already = localPointTransactionsOf(id).filter(function (tx) {
      return tx.reason === 'wellness_checkin' && String(tx.ref_date) === String(row.logged_at);
    });
    if (reward > 0 && !already.length) {
      localAddPointsLog(id, reward, 'wellness_checkin', '오늘의 뇌 컨디션 체크인 적립', { ref_date: row.logged_at });
      awardedPoints = reward;
    }
    state.profile = findProfile(id);
    emit();
  }

  var pointsBalance = state.profile && state.profile.points_balance !== undefined && state.profile.points_balance !== null
    ? Number(state.profile.points_balance) : 0;
  return { log: saved, awardedPoints: awardedPoints, pointsBalance: pointsBalance };
}

/* 웰니스 체크 기록 삭제 (본인 기록 · 관리자) — 같은 날 중복 기록 정리용 */
export async function deleteWellness(id) {
  if (!id) throw new Error('삭제할 기록을 찾지 못했습니다.');
  if (state.mode === 'live') {
    var res = await clientSync().from('wellness_logs').delete().eq('id', id);
    if (res.error) throw new Error(friendlyError(res.error));
    return true;
  }
  var rows = table('wellness_logs');
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].id) === String(id)) {
      rows.splice(i, 1);
      saveLocal();
      return true;
    }
  }
  throw new Error('삭제할 기록을 찾지 못했습니다.');
}

/* ------------------------------------------------------------ community */
export async function listPosts(options) {
  options = options || {};
  var rows;
  if (state.mode === 'live') {
    var q = clientSync().from('community_posts').select('*').order('is_pinned', { ascending: false }).order('created_at', { ascending: false });
    if (options.category) q = q.eq('category', options.category);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    rows = res.data || [];
  } else {
    rows = clone(local().community_posts);
    if (options.category) rows = rows.filter(function (p) { return p.category === options.category; });
    if (!isStaff()) rows = rows.filter(function (p) { return !p.is_hidden; });
    rows.sort(function (a, b) {
      if (Boolean(b.is_pinned) !== Boolean(a.is_pinned)) return Boolean(b.is_pinned) ? 1 : -1;
      return a.created_at < b.created_at ? 1 : -1;
    });
  }
  if (options.search) {
    var needle = String(options.search).toLowerCase();
    rows = rows.filter(function (p) {
      return String(p.title).toLowerCase().indexOf(needle) >= 0 || String(p.body).toLowerCase().indexOf(needle) >= 0;
    });
  }
  return rows;
}

export async function getPost(id) {
  if (state.mode === 'live') {
    var res = await clientSync().from('community_posts').select('*').eq('id', id).maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  var rows = local().community_posts;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) return clone(rows[i]);
  }
  return null;
}

export async function createPost(payload) {
  var id = requireUid();
  var profile = state.profile || {};
  var row = {
    category: payload.category,
    title: payload.title,
    body: payload.body,
    author_id: id,
    author_name: profile.full_name || (profile.email ? String(profile.email).split('@')[0] : '회원'),
    is_pinned: Boolean(payload.is_pinned) && isAdmin(),
    is_hidden: false
  };
  if (state.mode === 'live') {
    var res = await clientSync().from('community_posts').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('community_posts', row);
}

export async function updatePost(id, patch) {
  if (state.mode === 'live') {
    var res = await clientSync().from('community_posts').update(patch).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdate('community_posts', id, patch);
}

export async function deletePost(id) {
  if (state.mode === 'live') {
    var res = await clientSync().from('community_posts').delete().eq('id', id);
    if (res.error) throw new Error(friendlyError(res.error));
    return true;
  }
  localDelete('community_posts', id);
  return true;
}

export async function listComments(postId) {
  if (state.mode === 'live') {
    var res = await clientSync().from('community_comments').select('*').eq('post_id', postId).order('created_at', { ascending: true });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = clone(local().community_comments).filter(function (c) { return c.post_id === postId; });
  return sortRows(rows, 'created_at', false);
}

export async function addComment(postId, body) {
  var id = requireUid();
  var profile = state.profile || {};
  var row = {
    post_id: postId,
    author_id: id,
    author_name: profile.full_name || '회원',
    body: body
  };
  if (state.mode === 'live') {
    var res = await clientSync().from('community_comments').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('community_comments', row);
}

export async function deleteComment(id) {
  if (state.mode === 'live') {
    var res = await clientSync().from('community_comments').delete().eq('id', id);
    if (res.error) throw new Error(friendlyError(res.error));
    return true;
  }
  localDelete('community_comments', id);
  return true;
}

/* -------------------------------------------------------------- academy */
export async function listCohorts() {
  if (state.mode === 'live') {
    var res = await clientSync().from('academy_cohorts').select('*').order('created_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return sortRows(clone(local().cohorts), 'created_at', true);
}

export async function adminCreateCohort(payload) {
  var row = Object.assign({ hours_text: '총 40시간 이론 교육 (5주 · 주 8시간)', fee_label: '상담 후 확정 (관리자 수정 가능)', capacity: 20, status: 'recruiting', created_at: nowIso() }, payload);
  if (state.mode === 'live') {
    var res = await clientSync().from('academy_cohorts').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('cohorts', row);
}

export async function adminUpdateCohort(id, patch) {
  if (state.mode === 'live') {
    var res = await clientSync().from('academy_cohorts').update(patch).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdate('cohorts', id, patch);
}

export async function listEnrollments(userId) {
  if (state.mode === 'live') {
    var q = clientSync().from('academy_enrollments').select('*').order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    else if (!isStaff()) q = q.eq('user_id', requireUid());
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = clone(local().academy_enrollments);
  if (userId) rows = rows.filter(function (e) { return e.user_id === userId; });
  else if (!isStaff()) rows = rows.filter(function (e) { return e.user_id === requireUid(); });
  return sortRows(rows, 'created_at', true);
}

export async function createEnrollment(payload) {
  var id = requireUid();
  var row = {
    cohort_id: payload.cohort_id,
    user_id: id,
    applicant_name: payload.applicant_name,
    applicant_phone: payload.applicant_phone,
    motivation: payload.motivation || '',
    status: 'applied',
    progress_hours: 0,
    exam_status: 'pending',
    payment_status: 'integration_required'
  };
  if (state.mode === 'live') {
    var res = await clientSync().from('academy_enrollments').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('academy_enrollments', row);
}

export async function adminUpdateEnrollment(id, patch) {
  if (state.mode === 'live') {
    var res = await clientSync().from('academy_enrollments').update(patch).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdate('academy_enrollments', id, patch);
}

export async function listMaterials() {
  if (state.mode === 'live') {
    var res = await clientSync().from('academy_materials').select('*').order('created_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return sortRows(clone(local().academy_materials), 'created_at', true);
}

export async function adminCreateMaterial(payload) {
  var row = Object.assign({ body: '', file_url: '', is_notice: false, created_at: nowIso() }, payload);
  if (state.mode === 'live') {
    var res = await clientSync().from('academy_materials').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('academy_materials', row);
}

/* --------------------------------------------------------- notifications */
export async function listNotifications() {
  var id = requireUid();
  if (state.mode === 'live') {
    var res = await clientSync().from('notification_logs').select('*').eq('user_id', id).order('created_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = clone(local().notification_logs).filter(function (n) { return n.user_id === id; });
  return sortRows(rows, 'created_at', true);
}

export async function createNotification(payload) {
  var row = Object.assign({ channel: 'in_app', delivery_status: 'saved_in_app', is_read: false }, payload);
  if (state.mode === 'live') {
    var res = await clientSync().from('notification_logs').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('notification_logs', row);
}

export async function markNotificationRead(id) {
  if (state.mode === 'live') {
    var res = await clientSync().from('notification_logs').update({ is_read: true }).eq('id', id);
    if (res.error) throw new Error(friendlyError(res.error));
    return true;
  }
  return localUpdate('notification_logs', id, { is_read: true });
}

/* ----------------------------------------------------- consultation notes */
export async function listNotes(userId) {
  if (state.mode === 'live') {
    var q = clientSync().from('consultation_notes').select('*').order('created_at', { ascending: false });
    if (userId) q = q.eq('user_id', userId);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var rows = clone(local().consultation_notes);
  if (userId) rows = rows.filter(function (n) { return n.user_id === userId; });
  return sortRows(rows, 'created_at', true);
}

export async function adminCreateNote(userId, memo) {
  var row = { user_id: userId, author_id: currentUser() ? currentUser().id : null, memo: memo };
  if (state.mode === 'live') {
    var res = await clientSync().from('consultation_notes').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('consultation_notes', row);
}

/* -------------------------------------------------------------- B2B 기관 */
/* 공개 기관 디렉터리 — 비로그인·일반회원은 organizations/branches 테이블을
   직접 읽지 않고 이 RPC 결과(기관명·유형·지점명·지점주소)만 사용합니다. */
var _publicDirectory = { at: 0, rows: null };

export async function listPublicDirectory(force) {
  if (!force && _publicDirectory.rows && (Date.now() - _publicDirectory.at) < 30000) {
    return _publicDirectory.rows;
  }
  var res = await clientSync().rpc('get_public_directory');
  if (res.error) throw new Error(friendlyError(res.error));
  _publicDirectory = { at: Date.now(), rows: res.data || [] };
  return _publicDirectory.rows;
}

/* RPC 행(평평한 목록) → 기관 { id, name, org_type, branches[] } 로 묶기 */
export function shapePublicDirectory(rows) {
  var orgs = [];
  var index = {};
  (rows || []).forEach(function (row) {
    if (!row || !row.org_id) return;
    var org = index[row.org_id];
    if (!org) {
      org = { id: row.org_id, name: row.org_name, org_type: row.org_type, status: 'active', branches: [] };
      index[row.org_id] = org;
      orgs.push(org);
    }
    if (row.branch_id) {
      org.branches.push({
        id: row.branch_id,
        name: row.branch_name,
        address: row.branch_address || '',
        org_id: row.org_id,
        status: 'active'
      });
    }
  });
  return orgs;
}

export async function listOrganizations() {
  if (state.mode === 'live') {
    /* 총괄 관리자·제휴 기관 근무자는 전체 필드를 읽고,
       그 외(비로그인·일반회원)는 최소 필드 공개 디렉터리만 받습니다. */
    if (!isAdmin() && !isOrgWorker()) {
      return shapePublicDirectory(await listPublicDirectory());
    }
    var res = await clientSync().from('organizations').select('*').order('created_at', { ascending: false });
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  return sortRows(clone(local().organizations), 'created_at', true);
}

export async function adminCreateOrganization(payload) {
  var row = Object.assign({ status: 'active' }, payload);
  if (state.mode === 'live') {
    var res = await clientSync().from('organizations').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('organizations', row);
}

export async function adminUpdateOrganization(id, patch) {
  if (state.mode === 'live') {
    var res = await clientSync().from('organizations').update(patch).eq('id', id).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localUpdate('organizations', id, patch);
}

export async function listBranches(orgId) {
  if (state.mode === 'live') {
    if (!isAdmin() && !isOrgWorker()) {
      var orgs = shapePublicDirectory(await listPublicDirectory());
      var rowsOut = [];
      orgs.forEach(function (org) {
        if (orgId && String(org.id) !== String(orgId)) return;
        org.branches.forEach(function (branch) { rowsOut.push(branch); });
      });
      return rowsOut;
    }
    var q = clientSync().from('branches').select('*').order('created_at', { ascending: false });
    if (orgId) q = q.eq('org_id', orgId);
    var res = await q;
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data || [];
  }
  var localRowsOut = clone(local().branches);
  if (orgId) localRowsOut = localRowsOut.filter(function (b) { return String(b.org_id) === String(orgId); });
  return sortRows(localRowsOut, 'created_at', true);
}

export async function adminCreateBranch(payload) {
  var row = Object.assign({ status: 'active' }, payload);
  if (state.mode === 'live') {
    var res = await clientSync().from('branches').insert(row).select().maybeSingle();
    if (res.error) throw new Error(friendlyError(res.error));
    return res.data;
  }
  return localInsert('branches', row);
}

/* ------------------------------------------------------------ dashboard */
export async function getDashboard() {
  var results = await Promise.all([listProfiles(), listBookings(), listPayments(), listResults()]);
  var profiles = results[0];
  var bookings = results[1];
  var payments = results[2];
  var brainResults = results[3];
  var today = todayStr();
  var monthPrefix = today.slice(0, 7);

  var todayBookings = bookings.filter(function (b) {
    return String(b.preferred_date) === today && b.status !== 'canceled';
  });
  var pendingChecks = bookings.filter(function (b) {
    return String(b.program_id || '').indexOf('brain_check') === 0 && (b.status === 'pending' || b.status === 'confirmed');
  });
  var revenue = payments.reduce(function (sum, p) { return p.status === 'paid' ? sum + Number(p.amount || 0) : sum; }, 0);
  var monthRevenue = payments.reduce(function (sum, p) {
    if (p.status !== 'paid') return sum;
    var created = String(p.created_at || '').slice(0, 7);
    return created === monthPrefix ? sum + Number(p.amount || 0) : sum;
  }, 0);
  var bookedAmount = bookings.reduce(function (sum, b) {
    return b.status === 'canceled' ? sum : sum + Number(b.final_amount || 0);
  }, 0);

  return {
    members: profiles.length,
    bookings: bookings,
    payments: payments,
    results: brainResults,
    todayBookings: todayBookings,
    pendingChecks: pendingChecks,
    revenue: revenue,
    monthRevenue: monthRevenue,
    bookedAmount: bookedAmount,
    recentBookings: bookings.slice(0, 6),
    recentMembers: profiles.slice(0, 6)
  };
}
