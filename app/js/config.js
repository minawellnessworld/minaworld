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
  APP_VERSION: '2.0.8',
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
  slogan: '내 탓이 아니라 뇌 탓이다, 변화의 시작은 이미 나로부터',
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

/* 검사 항목 기본 템플릿 — 실제 발행 리포트(간편 2장 · 종합 11장) 기준.
   관리자·기관 결과 등록 폼의 '항목별 설명' 칸에 이 항목들이 자동으로 세팅되고,
   화면의 '현재 항목을 기본값으로 저장' 으로 유형별 기본값을 직접 바꿀 수 있습니다.
   hint 는 입력칸 안내문(placeholder)으로만 쓰이고 결과지에는 저장되지 않습니다. */
export var CHECK_ITEM_TEMPLATES = {
  simple: [
    { name: '뇌 활용 능력', hint: '좌뇌/우뇌 우세 주파수 · 평가' },
    { name: '뇌파의 안정성', hint: '좌뇌/우뇌 α평균진폭 · 진폭 편차 · 평가' },
    { name: '뇌 산만도', hint: '좌뇌/우뇌 산만도 · 평가' },
    { name: '좌우뇌 균형', hint: '좌우동조 · 진폭대칭 · 평가' },
    { name: '육체적 스트레스', hint: '좌/우 신체 긴장 · 피로도' },
    { name: '정신적 스트레스', hint: '좌/우 심리 · 정신 긴장' },
    { name: '행동성향', hint: '좌뇌/우뇌 α/β · 차이비율 · 평가' },
    { name: '정서성향', hint: '좌뇌/우뇌 α평균 · 차이비율 · 평가' }
  ],
  full: [
    { name: '주파수 출현빈도 및 평균 진폭', hint: '' },
    { name: '알파파 파형의 변화', hint: '' },
    { name: '개안·폐안 뇌파의 변화', hint: '' },
    { name: '뇌 산만비율(Θ/SMR)', hint: '' },
    { name: '좌우뇌 균형', hint: '' },
    { name: '육체적 긴장과 스트레스', hint: '' },
    { name: '정신적 산만과 스트레스', hint: '' },
    { name: '행동 성향(α/β)', hint: '' },
    { name: '정서 성향(Lα·Rα)', hint: '' },
    { name: '자기 피드백 능력', hint: '' }
  ]
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

/* =====================================================================
   정식 「개인정보 처리방침」 · 「민감정보 처리 안내」
   - 회원가입 동의(consent_logs)와 짝을 이루는 전문 고지입니다.
   - 앱 안(회원가입 · 더보기)에서 시트로 바로 열람할 수 있습니다.
   - 문구를 고칠 때는 PRIVACY_POLICY.version 도 함께 올려 주세요.
   ===================================================================== */
export var PRIVACY_POLICY = {
  version: '2026-11-17',
  effective: '2026-11-17',
  controller: {
    company: 'MINA Wellness World (미나월드)',
    ceo: '이미나',
    email: CONFIG.CONTACT_EMAIL,
    phone: CONFIG.CONTACT_PHONE
  },
  sections: [
    {
      title: '1. 총칙 및 적용 범위',
      body: [
        'MINA Wellness World(이하 "회사")는 「개인정보 보호법」 등 관계 법령을 준수하며, 미나월드 앱과 웹사이트(minaworld.co.kr) 이용자의 개인정보와 민감정보를 보호하기 위해 본 처리방침을 수립·공개합니다.',
        '본 방침은 회원가입, 예약, 결제, 뇌파 검사 및 뉴로피드백 훈련 기록, 제휴 기관 서비스 이용 등 회사가 제공하는 모든 서비스에 적용됩니다.'
      ]
    },
    {
      title: '2. 수집하는 개인정보 항목',
      body: [
        '[필수] 이름, 이메일, 비밀번호(단방향 암호화 저장), 휴대폰 번호, 동의 기록(동의 항목·시각·버전·접속 기기 정보)',
        '[선택] 생년월일, 관심 관리 목표, 제휴 기관 소속 정보',
        '[서비스 이용 과정에서 생성] 예약 정보(프로그램·지점·담당자·희망 일시·요청 사항), 결제 기록(금액·결제 상태·수단 — 카드번호 등 결제수단 정보는 회사가 저장하지 않습니다), 알림 발송 기록, 서비스 이용 기록',
        '[민감정보 — 별도 동의] 뇌파 측정값, 검사 결과지, 뉴로피드백 훈련 로그, 상담 메모. 이는 의료기관의 진단·치료를 대체하지 않는 웰니스 참고 데이터입니다.'
      ]
    },
    {
      title: '3. 개인정보의 수집·이용 목적',
      body: [
        '회원 식별 및 가입·탈퇴 관리',
        '예약 접수·확인·변경·취소 안내',
        '검사 결과지와 훈련 기록의 보관 및 본인 제공',
        '결제·환불·정산 처리와 이용 내역 확인',
        '제휴 기관 소속 승인, 그리고 이용자가 동의한 경우에 한한 결과 공유',
        '문의 대응, 공지 사항 및 서비스 안내 전달',
        '개인을 식별할 수 없는 형태의 통계 분석을 통한 서비스 개선',
        '부정 이용 방지, 권한 관리, 보안 감사 및 사고 대응'
      ]
    },
    {
      title: '4. 보유 및 이용 기간',
      body: [
        '원칙: 회원 탈퇴 시 개인정보를 즉시 파기합니다. 앱의 [마이페이지 → 회원 탈퇴]를 실행하면 이름·연락처가 비식별화되고 계정이 비활성화되며, 제휴 기관 결과 공유도 즉시 중단됩니다.',
        '법령에 따라 아래 기록은 해당 기간 동안 분리 보관하며, 보관 목적 외로는 이용하지 않습니다.',
        '· 계약 또는 청약철회 등에 관한 기록: 5년 (전자상거래 등에서의 소비자보호에 관한 법률)',
        '· 대금 결제 및 재화 등의 공급에 관한 기록: 5년 (같은 법)',
        '· 소비자의 불만 또는 분쟁 처리에 관한 기록: 3년 (같은 법)',
        '· 표시·광고에 관한 기록: 6개월 (같은 법)',
        '· 세법상 장부와 증빙 서류: 5년 (국세기본법)',
        '· 웹사이트 접속 기록: 3개월 (통신비밀보호법)'
      ]
    },
    {
      title: '5. 민감정보(뇌파·상담 기록) 처리 안내',
      body: [
        '뇌파 측정값·검사 결과지·훈련 로그·상담 메모는 별도 동의를 받은 경우에만 수집하며, 웰니스 리포트 제공 목적으로만 사용합니다. 의료 진단·치료에 사용하지 않습니다.',
        '검사 결과지는 비공개 저장소에 보관하고, 본인에게는 제한 시간이 설정된 서명 주소로만 열람을 제공합니다.',
        '제휴 기관에는 이용자가 [마이페이지 → 제휴 기관 소속·결과 공유]에서 공유에 동의한 경우에만 결과가 표시됩니다. 동의를 끄면 즉시 조회가 차단됩니다.',
        '결과를 열람할 수 있는 사람은 본인, 결과를 등록·관리하는 총괄 관리자, 그리고 결과 공유에 동의한 소속 기관의 권한 보유 담당자로 한정됩니다.'
      ]
    },
    {
      title: '6. 개인정보의 제3자 제공',
      body: [
        '회사는 원칙적으로 개인정보를 제3자에게 제공하지 않습니다.',
        '다만 이용자가 사전에 동의한 제휴 기관에 한해 동의 범위의 검사 결과가 표시되며, 이는 이용자가 언제든 철회할 수 있습니다.',
        '법령에 따라 수사기관 등이 적법한 절차로 요구하는 경우에는 해당 범위에서 제공할 수 있습니다.'
      ]
    },
    {
      title: '7. 개인정보 처리 위탁 및 국외 이전',
      body: [
        '회사는 서비스 운영을 위해 아래 업체에 처리를 위탁하며, 위탁 목적 외 이용 금지와 안전성 확보를 계약과 정기 점검으로 관리합니다.'
      ],
      processors: [
        { name: 'Supabase Inc.', role: '회원 인증, 데이터베이스, 검사 결과 파일 저장', place: '서울 리전 (ap-northeast-2)' },
        { name: 'GitHub, Inc. (GitHub Pages)', role: '앱·웹사이트 정적 페이지 호스팅', place: '미국' },
        { name: 'Cloudflare, Inc.', role: '도메인 네임 서버(DNS), 콘텐츠 전송·보안', place: '미국' }
      ],
      after: [
        '국외 이전 항목: 서비스 제공에 필요한 계정·예약·검사 기록 데이터 / 이전 시기·방법: 서비스 이용 시점의 암호화된 네트워크 전송(HTTPS)'
      ]
    },
    {
      title: '8. 이용자의 권리와 행사 방법',
      body: [
        '이용자와 법정대리인은 언제든 개인정보 열람, 정정, 삭제, 처리 정지, 동의 철회를 요구할 수 있습니다.',
        '앱에서 직접: [마이페이지] → 회원 정보 수정 / 동의 이력 확인 / 제휴 기관 결과 공유 토글 / 회원 탈퇴',
        '이메일로: minawellnessworld@gmail.com 으로 요청하면 본인 확인 후 지체 없이(늦어도 10일 이내) 처리 결과를 회신합니다.',
        '만 14세 미만 아동의 회원가입은 받지 않습니다.',
        '권리 행사로 서비스 제공에 반드시 필요한 정보를 삭제하는 경우 서비스 이용이 제한될 수 있습니다.'
      ]
    },
    {
      title: '9. 개인정보의 안전성 확보 조치',
      body: [
        '비밀번호는 8자 이상 영문·숫자 조합을 요구하며, 단방향 암호화하여 저장합니다.',
        '데이터베이스 행 수준 보안(RLS)을 적용해 회원은 본인 데이터만, 제휴 기관은 소속 기관의 동의 회원 데이터만 조회할 수 있습니다.',
        '공개 기관 디렉터리는 기관명·유형·지점명·주소 등 최소 정보만 제공하며, 연락처·사업자등록번호·정산 계좌·수수료율은 공개하지 않습니다.',
        '예약 금액·결제 상태·회원 권한은 서버에서 다시 검증하여 위변조를 차단하고, 주요 행위는 감사 로그로 기록합니다.',
        '모든 통신 구간은 HTTPS로 암호화하며, 업무상 필요한 최소 인원에게만 접근 권한을 부여합니다.'
      ]
    },
    {
      title: '10. 개인정보 보호책임자 및 문의처',
      body: [
        '개인정보 보호책임자: 대표 이미나',
        '이메일: minawellnessworld@gmail.com / 전화: 010-5424-0807',
        '개인정보 관련 문의·불만·권리 행사는 위 연락처로 접수해 주세요. 접수 후 신속히 안내드립니다.'
      ]
    },
    {
      title: '11. 고지의 의무',
      body: [
        '본 방침이 변경되는 경우 시행 7일 전부터 앱 내 공지로 알립니다. 이용자 권리에 중요한 변경은 30일 전에 알립니다.',
        '시행일: 2026년 11월 17일 (버전 2026-11-17)'
      ]
    }
  ]
};

function policyEsc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/* 처리방침 전문 HTML (시트 본문용) */
export function privacyPolicyHtml() {
  var out = '';
  out += '<div class="policy-block">' +
    '<p>「개인정보 보호법」에 따라 ' + policyEsc(PRIVACY_POLICY.controller.company) + '가 이용자의 개인정보와 민감정보를 어떻게 수집·이용·보관·파기하는지 안내합니다. (시행일 ' + policyEsc(PRIVACY_POLICY.effective) + ' · 버전 ' + policyEsc(PRIVACY_POLICY.version) + ')</p>' +
    '</div>';
  (PRIVACY_POLICY.sections || []).forEach(function (section) {
    var items = (section.body || []).map(function (line) {
      return '<li>' + policyEsc(line) + '</li>';
    }).join('');
    var table = '';
    if (section.processors && section.processors.length) {
      table = '<div class="policy-table">' + section.processors.map(function (p) {
        return '<div class="policy-table-row">' +
          '<strong>' + policyEsc(p.name) + '</strong>' +
          '<span>' + policyEsc(p.role) + '</span>' +
          '<em>' + policyEsc(p.place) + '</em>' +
        '</div>';
      }).join('') + '</div>';
    }
    var after = (section.after || []).map(function (line) {
      return '<li>' + policyEsc(line) + '</li>';
    }).join('');
    out += '<div class="policy-block">' +
      '<h3>' + policyEsc(section.title) + '</h3>' +
      '<ul>' + items + '</ul>' + table + (after ? '<ul>' + after + '</ul>' : '') +
    '</div>';
  });
  out += '<div class="policy-block">' +
    '<h3>민감정보 처리 요약</h3>' +
    '<ul>' +
      '<li>수집 항목: 뇌파 측정값 · 검사 결과지 · 훈련 로그 · 상담 메모</li>' +
      '<li>처리 목적: 웰니스 리포트와 훈련 기록 제공 (진단·치료 목적 아님)</li>' +
      '<li>보관: 비공개 저장소, 본인 열람은 제한 시간 서명 주소</li>' +
      '<li>공유: 이용자가 동의한 소속 기관에 한함 · 동의 철회 시 즉시 차단</li>' +
      '<li>동의 철회: 앱 [마이페이지 → 동의 이력] 또는 대표 메일로 요청</li>' +
    '</ul>' +
  '</div>';
  return out;
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
