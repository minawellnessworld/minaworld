/* =====================================================================
   MINA WORLD App — Runtime Configuration (v2.0.0)
   ---------------------------------------------------------------------
   Supabase 키는 아래 세 가지 방법 중 하나로 주입할 수 있습니다.
   1) index.html 의 <head> 안에서 window.__MINA_CONFIG__ 선언 (권장)
        <script>
          window.__MINA_CONFIG__ = {
            SUPABASE_URL: 'https://xxxx.supabase.co',
            SUPABASE_ANON_KEY: 'eyJ...'
          };
        </script>
   2) index.html 의 meta 태그
        <meta name="mina-supabase-url" content="https://xxxx.supabase.co">
        <meta name="mina-supabase-key" content="eyJ...">
   3) 빌드 시 이 파일의 값을 직접 수정

   키가 없으면 앱은 "로컬 체험 모드"로 동작합니다.
   (화면·기능 검토용. 실제 서버 저장/로그인은 되지 않으며 그 사실을 화면에 표시합니다.)
   ===================================================================== */

function readMeta(name) {
  if (typeof document === 'undefined') return '';
  var el = document.querySelector('meta[name="' + name + '"]');
  if (!el) return '';
  return (el.getAttribute('content') || '').trim();
}

var runtime = (typeof window !== 'undefined' && window.__MINA_CONFIG__) || {};

/* 2026-11-17 개통된 MINA WORLD Supabase 프로젝트 (ap-northeast-2 / Seoul)
   project ref: adoghzqnfspmxzvrftuo
   아래 키는 공개용 anon(publishable) 키입니다. service_role 키는 절대 넣지 않습니다.
   런타임에 window.__MINA_CONFIG__ / meta 태그로 덮어쓸 수 있습니다. */
var DEFAULT_SUPABASE_URL = 'https://adoghzqnfspmxzvrftuo.supabase.co';
var DEFAULT_SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkb2doenFuZnNwbXh6dnJmdHVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTQ4ODY4NzUsImV4cCI6MjExMDQ2Mjg3NX0.dCPjGiZkdZ0Ga8KOe7VRX6e7170l_elTnrkvW4guhTQ';

var SUPABASE_URL = String(runtime.SUPABASE_URL || readMeta('mina-supabase-url') || DEFAULT_SUPABASE_URL).trim();
var SUPABASE_ANON_KEY = String(runtime.SUPABASE_ANON_KEY || readMeta('mina-supabase-key') || DEFAULT_SUPABASE_ANON_KEY).trim();

export var CONFIG = {
  SUPABASE_URL: SUPABASE_URL,
  SUPABASE_ANON_KEY: SUPABASE_ANON_KEY,
  SUPABASE_SCHEMA: 'public',
  STORAGE_BUCKET: 'brain-results',
  GA_MEASUREMENT_ID: 'G-TTMVKBHNZM',
  APP_VERSION: '2.0.0',
  SCHEMA_VERSION: 'v2',
  SITE_URL: 'https://www.minaworld.co.kr',
  CONTACT_EMAIL: 'minawellnessworld@gmail.com',
  CONTACT_PHONE: '010-5424-0807',
  BOOKING_SLOT_TIMES: ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
  BOOKING_MAX_DAYS: 90,
  CONSENT_VERSION: '2026-11-17',
  DEFAULT_SLOT_MINUTES: 60,
  DEFAULT_ORG_ID: '11111111-1111-4111-8111-111111111111',
  DEFAULT_BRANCH_ID: '22222222-2222-4222-8222-222222222222'
};

export var IS_LIVE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export var CONSENT_VERSION = CONFIG.CONSENT_VERSION;

/* PART 7 — 샴페인 골드 프리미엄 팔레트 */
export var COLORS = {
  navy: '#070D1E',
  ivory: '#FAF7F2',
  white: '#FFFFFF',
  gold: '#C9A96E',
  goldSoft: '#F7F1E5',
  yellow: '#F5B82E',
  muted: '#4A5568'
};

export var BRAND = {
  name: 'MINA WORLD',
  fullName: 'MINA Wellness World',
  slogan: '내 탓이 아니라 뇌 탓이다, 변화는 이미 나로부터',
  welcome: 'Welcome to MINA WORLD',
  question: '오늘의 뇌 컨디션은 어떠신가요?',
  greetingTagline: '오늘의 나를 이해하는 것부터 변화는 시작됩니다.',
  nonMedical:
    '본 서비스의 모든 측정·훈련 결과는 의료기관의 진단·치료를 대체하지 않는 참고용 웰니스 관리 데이터입니다.',
  academyNotice:
    '뇌교육상담사 과정 수료 후 응시하는 자격은 「민간자격 등록 및 관리에 관한 법률」에 따른 등록 민간자격입니다. 국가자격이 아닙니다.'
};

export var MINA_MEANING = [
  { letter: 'M', word: 'MIND', text: '스트레스·감정·번아웃 관리' },
  { letter: 'I', word: 'INTELLIGENCE', text: '집중력·학습·기억력 관리' },
  { letter: 'N', word: 'NEURO', text: '뇌과학·뇌기능·뇌 건강' },
  { letter: 'A', word: 'ALIGNMENT', text: '수면·운동·생활 균형' }
];

export var BOOKING_STATUS = {
  pending: '예약 대기',
  confirmed: '예약 확정',
  completed: '방문 완료',
  canceled: '예약 취소',
  noshow: '노쇼'
};

export var PAYMENT_STATUS = {
  integration_required: '결제 연동 대기',
  pending_deposit: '입금 확인 대기',
  paid: '결제 완료',
  refunded: '환불 완료'
};

export var BOOKING_PAYMENT_STATUS = {
  pending_pg: '결제 모듈 연동 대기',
  bank_transfer: '무통장 입금 대기',
  paid: '결제 완료',
  refunded: '환불 완료'
};

export var ROLES = {
  member: '일반 회원',
  counselor: '상담사(본점)',
  staff: '기관 직원',
  partner_admin: '제휴 기관 관리자',
  admin: '총괄 관리자',
  super_admin: '총괄 관리자(SUPER)'
};

/* role='admin' 과 role='super_admin' 은 완전히 동일한 총괄 관리자 권한입니다.
   (v1 트리거로 가입한 대표 계정은 'admin', v2 트리거 신규 가입은 'super_admin')
   권한 판단은 항상 store.js 의 isAdmin() / isStaff() 를 사용하세요. */
export var FULL_ADMIN_ROLES = ['admin', 'super_admin'];

export var ROLE_ORDER = ['member', 'staff', 'counselor', 'partner_admin', 'admin', 'super_admin'];

export var PROFILE_STATUS = {
  active: '이용 중',
  suspended: '이용 정지',
  withdrawn: '탈퇴'
};

export var GRADES = {
  Welcome: { label: 'Welcome', desc: '첫 방문 · 기본 웰컴 등급' },
  Mind: { label: 'Mind', desc: '마인드케어 프로그램 이용 회원' },
  Neuro: { label: 'Neuro', desc: '뉴로피드백 루틴 진행 회원' },
  Alignment: { label: 'Alignment', desc: '정기 관리 · 최상위 정렬 등급' }
};

export var COMMUNITY_CATEGORIES = [
  { id: 'notice', label: '공지사항', writable: false, adminOnly: true },
  { id: 'neuroscience', label: '뇌과학 정보', writable: false, adminOnly: true },
  { id: 'wellness', label: '웰니스 콘텐츠', writable: false, adminOnly: true },
  { id: 'event', label: '이벤트', writable: false, adminOnly: true },
  { id: 'review', label: '프로그램 후기', writable: true, adminOnly: false },
  { id: 'qna', label: '질문과 답변', writable: true, adminOnly: false },
  { id: 'column', label: '전문가 칼럼', writable: false, adminOnly: true },
  { id: 'faq', label: '자주 묻는 질문', writable: false, adminOnly: true },
  { id: 'academy_guide', label: '교육 안내', writable: false, adminOnly: true }
];

export var CONTENT_CATEGORIES = ['notice', 'event', 'neuroscience', 'wellness', 'faq', 'academy_guide'];

export var GOAL_OPTIONS = ['집중력 관리', '스트레스 관리', '수면 관리', '감정 관리', '기억력 관리'];

export var ORG_TYPES = {
  corporate: '기업',
  gym: '헬스장',
  pt_center: 'PT센터',
  pilates: '필라테스',
  yoga: '요가',
  hospital: '병원',
  hotel: '호텔',
  wellness: '웰니스센터',
  other: '기타'
};

export var ORG_STATUS = {
  pending: '승인 대기',
  active: '운영 중',
  paused: '운영 중지',
  ended: '계약 종료'
};

export var CHECK_TYPES = { simple: '간편검사 (결과지 2장)', full: '종합검사 (결과지 11장)' };

export var CHECK_ITEM_LABELS = {
  focus_score: '집중 지수',
  stress_index: '스트레스 지수',
  balance_index: '좌우 균형',
  feedback_score: '자기 피드백',
  emotion_type: '감정 성향'
};

export var ENROLLMENT_STATUS = {
  applied: '접수 대기',
  enrolled: '수강 중',
  completed: '수료',
  canceled: '신청 취소'
};

export var MEMBERSHIP_STATUS = {
  pending: '승인 대기',
  approved: '소속 승인',
  rejected: '거절'
};

export var SETTLEMENT_STATUS = {
  scheduled: '정산 예정',
  paid: '정산 완료'
};

export var WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/* PART 4-4 — 직원 5개 역할 · 8개 세부 권한 */
export var STAFF_ROLE_OPTIONS = ['기관 관리자', '상담 담당자', '검사 담당자', '훈련 담당자', '예약 담당자'];

export var STAFF_PERMISSIONS = [
  { key: 'dashboard', label: '대시보드', desc: '기관 통계·실적 조회' },
  { key: 'members', label: '회원 관리', desc: '기관 회원 등록·소속 승인' },
  { key: 'bookings', label: '예약 관리', desc: '예약 조회·상태 변경·직접 등록' },
  { key: 'results_view', label: '검사 결과 조회', desc: '동의 회원의 결과 열람' },
  { key: 'results_write', label: '검사 결과 등록', desc: '결과지·지표 입력' },
  { key: 'neuro', label: '뉴로피드백', desc: '이용권·회차 기록 관리' },
  { key: 'programs', label: '상품·운영시간', desc: '기관 상품·운영시간 설정' },
  { key: 'settlements', label: '정산', desc: '기관 매출·정산 조회' }
];

export var ALL_STAFF_PERMISSIONS = STAFF_PERMISSIONS.map(function (p) { return p.key; });

/* PART 2-1 / PART 6 — 동의 항목 */
export var CONSENT_ITEMS = [
  {
    key: 'privacy_policy',
    required: true,
    label: '개인정보 수집·이용 동의 (필수)',
    summary: '이름·연락처·이메일, 예약·검사·훈련 기록 / 목적: 서비스 제공 및 회원 관리 / 보유: 회원 탈퇴 시까지'
  },
  {
    key: 'sensitive_health',
    required: true,
    label: '민감정보(뇌파 측정·상담 기록) 처리 동의 (필수)',
    summary: '뇌파 측정값·훈련 로그·상담 메모 / 목적: 웰니스 리포트 제공 / 비의료 데이터로 진단·치료에 사용하지 않음'
  },
  {
    key: 'marketing',
    required: false,
    label: '마케팅 정보 수신 동의 (선택)',
    summary: '공지·이벤트·프로그램 안내 / 언제든 마이페이지에서 철회 가능'
  }
];

export var CONSENT_LABELS = {
  privacy_policy: '개인정보 수집·이용',
  sensitive_health: '민감정보(뇌파·상담)',
  partner_share: '제휴 기관 결과 공유',
  marketing: '마케팅 수신'
};

export function categoryLabel(id) {
  for (var i = 0; i < COMMUNITY_CATEGORIES.length; i++) {
    if (COMMUNITY_CATEGORIES[i].id === id) return COMMUNITY_CATEGORIES[i].label;
  }
  return id || '';
}

export function staffPermissionLabels(perms) {
  var keys = perms && typeof perms === 'object' ? Object.keys(perms).filter(function (k) { return perms[k]; }) : [];
  if (!keys.length) return '권한 없음';
  return keys.map(function (k) {
    for (var i = 0; i < STAFF_PERMISSIONS.length; i++) {
      if (STAFF_PERMISSIONS[i].key === k) return STAFF_PERMISSIONS[i].label;
    }
    return k;
  }).join(' · ');
}

export function hasPermission(profile, key) {
  if (!profile) return false;
  if (profile.role === 'admin' || profile.role === 'super_admin') return true;
  if (profile.role === 'partner_admin') return true;
  if (profile.role === 'staff') {
    var perms = profile.staff_permissions || {};
    return Boolean(perms[key]);
  }
  return false;
}
