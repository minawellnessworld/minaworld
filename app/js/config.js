/* =====================================================================
   MINA WORLD App — Runtime Configuration
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
  APP_VERSION: '1.0.0',
  SITE_URL: 'https://www.minaworld.co.kr',
  CONTACT_EMAIL: 'minawellnessworld@gmail.com',
  CONTACT_PHONE: '010-5424-0807',
  BOOKING_SLOT_TIMES: ['10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00'],
  BOOKING_MAX_DAYS: 90
};

export var IS_LIVE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export var BRAND = {
  name: 'MINA WORLD',
  fullName: 'MINA Wellness World',
  slogan: '내 탓이 아니라 뇌 탓이다, 변화는 이미 나로부터',
  welcome: 'Welcome to MINA WORLD',
  question: '오늘의 뇌 컨디션은 어떠신가요?',
  nonMedical:
    '본 서비스의 모든 측정·훈련 결과는 의료기관의 진단·치료를 대체하지 않는 참고용 웰니스 관리 데이터입니다.'
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
  completed: '이용 완료',
  canceled: '예약 취소'
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
  counselor: '상담사',
  partner_admin: '제휴 관리자',
  admin: '총괄 관리자'
};

export var GRADES = {
  Welcome: { label: 'Welcome', desc: '첫 방문 · 기본 웰컴 등급' },
  Mind: { label: 'Mind', desc: '마인드케어 프로그램 이용 회원' },
  Neuro: { label: 'Neuro', desc: '뉴로피드백 루틴 진행 회원' },
  Alignment: { label: 'Alignment', desc: '정기 관리 · 최상위 정렬 등급' }
};

export var COMMUNITY_CATEGORIES = [
  { id: 'notice', label: '공지사항', writable: false },
  { id: 'neuroscience', label: '뇌과학 정보', writable: false },
  { id: 'wellness', label: '웰니스 콘텐츠', writable: false },
  { id: 'event', label: '이벤트', writable: false },
  { id: 'review', label: '프로그램 후기', writable: true },
  { id: 'qna', label: '질문과 답변', writable: true },
  { id: 'column', label: '전문가 칼럼', writable: false }
];

export var GOAL_OPTIONS = ['집중력 관리', '스트레스 관리', '수면 관리', '감정 관리', '기억력 관리'];

export var ORG_TYPES = {
  corporate: '기업',
  gym: '헬스장',
  pilates: '필라테스',
  yoga: '요가',
  hospital: '병원',
  hotel: '호텔',
  wellness: '웰니스센터'
};

export var CHECK_TYPES = { simple: '간편검사 (결과지 2장)', full: '종합검사 (결과지 11장)' };

export var ENROLLMENT_STATUS = {
  applied: '접수 대기',
  enrolled: '수강 중',
  completed: '수료',
  canceled: '신청 취소'
};

export function categoryLabel(id) {
  for (var i = 0; i < COMMUNITY_CATEGORIES.length; i++) {
    if (COMMUNITY_CATEGORIES[i].id === id) return COMMUNITY_CATEGORIES[i].label;
  }
  return id || '';
}
