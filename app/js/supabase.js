/* Supabase JS v2 클라이언트 초기화 (CDN UMD 빌드 사용)
   - 기본 클라이언트: 현재 로그인 세션 유지
   - 보조 클라이언트: 계정 즉시 발급(관리자/기관 관리자) 전용.
     persistSession:false 라서 현재 관리자 세션을 절대 덮어쓰지 않습니다. */
import { CONFIG, IS_LIVE } from './config.js?v=2.0.5';

var client = null;
var booted = false;

function waitForSdk(ms) {
  return new Promise(function (resolve) {
    var lib = typeof window !== 'undefined' ? window.supabase : null;
    if (lib && lib.createClient) return resolve(lib);
    var started = Date.now();
    var timer = setInterval(function () {
      var again = typeof window !== 'undefined' ? window.supabase : null;
      if (again && again.createClient) {
        clearInterval(timer);
        resolve(again);
      } else if (Date.now() - started > ms) {
        clearInterval(timer);
        resolve(null);
      }
    }, 120);
  });
}

export async function ensureClient() {
  if (booted) return client;
  booted = true;
  if (!IS_LIVE) return null;
  var lib = await waitForSdk(5000);
  if (!lib) {
    console.error('[MINA] Supabase SDK를 불러오지 못했습니다. CDN 차단 여부를 확인하세요.');
    return null;
  }
  try {
    client = lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      db: { schema: CONFIG.SUPABASE_SCHEMA }
    });
  } catch (err) {
    console.error('[MINA] Supabase 클라이언트 생성 실패', err);
    client = null;
  }
  return client;
}

export function clientSync() {
  return client;
}

/* 관리자 세션을 건드리지 않는 보조 클라이언트 (계정 즉시 발급용)
   - persistSession:false → localStorage 에 세션을 쓰지 않음
   - 별도 storageKey → 혹시 모를 세션 키 충돌 방지 */
export async function createSecondaryClient() {
  if (!IS_LIVE) return null;
  var lib = await waitForSdk(5000);
  if (!lib) return null;
  try {
    return lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: 'mina.secondary.auth.' + Math.random().toString(36).slice(2, 8)
      },
      db: { schema: CONFIG.SUPABASE_SCHEMA }
    });
  } catch (err) {
    console.error('[MINA] 보조 클라이언트 생성 실패', err);
    return null;
  }
}

export function signedResultUrl(path, seconds) {
  if (!client || !path) return Promise.resolve('');
  return client.storage
    .from(CONFIG.STORAGE_BUCKET)
    .createSignedUrl(path, seconds || 600)
    .then(function (res) {
      if (res.error) throw res.error;
      return res.data && res.data.signedUrl ? res.data.signedUrl : '';
    });
}

/* 로그인 사용자 TOTP 팩터 조회 (2단계 인증 상태) */
export async function listTotpFactors() {
  if (!client) return [];
  var res = await client.auth.mfa.listFactors();
  if (res.error) throw res.error;
  var all = (res.data && res.data.all) || [];
  return all.filter(function (f) { return f.factor_type === 'totp' || f.factorType === 'totp'; });
}

export async function assuranceLevel() {
  if (!client) return { currentLevel: 'aal1', nextLevel: 'aal1' };
  var res = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (res.error) throw res.error;
  return {
    currentLevel: (res.data && res.data.currentLevel) || 'aal1',
    nextLevel: (res.data && res.data.nextLevel) || 'aal1'
  };
}
