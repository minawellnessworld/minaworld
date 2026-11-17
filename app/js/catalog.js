/* =====================================================================
   MINA WORLD App — 기본 카탈로그 (Supabase 미연결 시 사용)
   ---------------------------------------------------------------------
   scratch/app/supabase_schema.sql 의 시드 데이터와 동일한 값입니다.
   Supabase 가 연결되면 이 파일 대신 DB(programs / academy_cohorts /
   coupons / community_posts)에서 실제 값을 읽습니다.
   ※ 개인 측정 데이터(검사 결과·훈련 기록)는 여기에 절대 넣지 않습니다.
      데이터가 없으면 화면은 "빈 상태"로 표시됩니다.
   ===================================================================== */

export var FALLBACK_PROGRAMS = [
  {
    id: 'brain_check_simple', category: 'brain_check', sub_category: '간편검사',
    title: 'BRAIN CHECK 간편검사', subtitle: '결과지 2장 · 핵심 뇌 컨디션 점검',
    description: '뇌파 기반 집중·주의 상태, 좌우 뇌 활성 균형, 신체적·정신적 스트레스, 행동 및 감정 성향 지표를 한눈에 확인하는 비의료 웰니스 점검입니다.',
    target_audience: '처음 뇌파 측정을 경험하는 분, 빠른 컨디션 체크가 필요한 분',
    format_method: '2채널 무선 EEG 측정 + 결과지 2장 안내', duration_text: '약 20~30분',
    price_krw: 50000, price_label: '50,000원', badge: '결과지 2장', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 10
  },
  {
    id: 'brain_check_full', category: 'brain_check', sub_category: '종합검사',
    title: 'BRAIN CHECK 종합검사', subtitle: '결과지 11장 · 심층 분석 + 뉴로피드백 1회 포함',
    description: '간편검사 항목 전체에 자기 피드백 능력 지표를 더해 11장 결과지로 상세 분석·상담을 진행하며 뉴로피드백 1회 체험이 포함됩니다.',
    target_audience: '수면·번아웃·집중력 정밀 점검과 1:1 상담을 원하는 분',
    format_method: '정밀 2채널 EEG 측정 + 11장 심층 리딩 + 뉴로피드백 1회', duration_text: '약 60분',
    price_krw: 150000, price_label: '150,000원', badge: '뉴로피드백 1회 포함', session_count: 1,
    includes_neurofeedback: true, active: true, sort_order: 20
  },
  {
    id: 'neuro_1', category: 'neuro_training', sub_category: '단회',
    title: '뉴로피드백 1회 훈련', subtitle: '실시간 뇌파 피드백 자기조절 훈련',
    description: '실시간 뇌파 피드백을 보며 과각성·피로 패턴을 이완과 몰입 상태로 조율하는 1:1 맞춤형 뇌 훈련입니다.',
    target_audience: '시험 전·발표 전 집중 및 이완 리셋이 필요한 분',
    format_method: '1:1 뇌파 센서 착용 + 맞춤형 프로토콜 훈련 + 상담사 메모', duration_text: '약 40분',
    price_krw: 50000, price_label: '50,000원', badge: '1회', session_count: 1,
    includes_neurofeedback: true, active: true, sort_order: 30
  },
  {
    id: 'neuro_10', category: 'neuro_training', sub_category: '패키지',
    title: '뉴로피드백 10회 패키지', subtitle: '기본 집중 관리 코스 · 주 1~2회 집중 루틴',
    description: '10회 연속 훈련으로 회차별 변화 그래프와 담당 상담사 피드백을 누적 관리합니다.',
    target_audience: '기초 자기조절력·스트레스 회복 탄력성을 세우고 싶은 분',
    format_method: '10회 맞춤 훈련 + 회차별 비교 리포트', duration_text: '회당 40분 · 총 10회',
    price_krw: 450000, price_label: '450,000원 (정가 500,000원 · 5만원 할인)', badge: '10회', session_count: 10,
    includes_neurofeedback: true, active: true, sort_order: 31
  },
  {
    id: 'neuro_20', category: 'neuro_training', sub_category: '패키지',
    title: '뉴로피드백 20회 패키지', subtitle: '지속적인 뇌 컨디션 관리 코스 · 2~3개월',
    description: '수면·집중·감정 균형을 안정적으로 다지는 20회 정규 패키지입니다.',
    target_audience: '수험생, 만성 번아웃 직장인, 집중력 관리 회원',
    format_method: '20회 맞춤 훈련 + 중간·최종 비교 상담', duration_text: '회당 40분 · 총 20회',
    price_krw: 850000, price_label: '850,000원 (정가 1,000,000원 · 15만원 할인)', badge: '20회', session_count: 20,
    includes_neurofeedback: true, active: true, sort_order: 32
  },
  {
    id: 'neuro_30', category: 'neuro_training', sub_category: '패키지',
    title: '뉴로피드백 30회 패키지', subtitle: '장기 집중 훈련 코스 · 마스터 과정',
    description: '장기적인 인지·정서 밸런스 관리를 위한 30회 집중 패키지입니다.',
    target_audience: '장기 관리가 필요한 아동·청소년, 성인, 시니어',
    format_method: '30회 맞춤 훈련 + 전담 상담사 누적 관리', duration_text: '회당 40분 · 총 30회',
    price_krw: 1200000, price_label: '1,200,000원 (정가 1,500,000원 · 30만원 할인)', badge: '30회', session_count: 30,
    includes_neurofeedback: true, active: true, sort_order: 33
  },
  {
    id: 'care_stress', category: 'mind_care', sub_category: 'MIND CARE',
    title: '스트레스 관리', subtitle: '신경계 과부하 진정 · HRV & 뇌파 밸런스',
    description: '일상 스트레스로 높아진 교감신경 긴장을 낮추고 스스로 회복 브레이크를 밟는 법을 익힙니다.',
    target_audience: '만성 긴장, 잦은 피로, 감정 소진이 잦은 성인·직장인',
    format_method: '1:1 뇌파 점검 + 호흡·자율신경 이완 코칭', duration_text: '50분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'MIND', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 40
  },
  {
    id: 'care_burnout', category: 'mind_care', sub_category: 'MIND CARE',
    title: '번아웃 관리', subtitle: '전두엽 피로 회복 & 에너지 리셋',
    description: '의욕 저하와 집중력 고갈 상태에서 뇌의 휴식 회로를 회복하도록 돕는 프로그램입니다.',
    target_audience: '쉬어도 피로가 풀리지 않는 직장인·프리랜서·창업자',
    format_method: '컨디션 체크 + 회복 루틴 설계 + 이완 트레이닝', duration_text: '50분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'MIND', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 41
  },
  {
    id: 'care_emotion', category: 'mind_care', sub_category: 'MIND CARE',
    title: '감정 관리', subtitle: '편도체 과반응 조절 & 정서 안정',
    description: '감정 기복과 예민함을 뇌과학적으로 이해하고 안정 반응을 키우는 프로그램입니다.',
    target_audience: '감정 조절이 버겁거나 대인 스트레스가 큰 분',
    format_method: '정서 성향 점검 + 뇌과학 피드백 상담', duration_text: '50분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'MIND', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 42
  },
  {
    id: 'well_focus', category: 'brain_wellness', sub_category: 'BRAIN WELLNESS',
    title: '집중력 향상 훈련', subtitle: '몰입 회로(세타/SMR) 트레이닝',
    description: '산만함을 줄이고 필요한 순간 빠르게 몰입으로 전환하는 주의력 훈련입니다.',
    target_audience: '업무 몰입·학습 효율을 높이고 싶은 학생 및 성인',
    format_method: '주의력 점검 + 집중 프로토콜 훈련', duration_text: '50분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'INTELLIGENCE', session_count: 1,
    includes_neurofeedback: true, active: true, sort_order: 50
  },
  {
    id: 'well_memory', category: 'brain_wellness', sub_category: 'BRAIN WELLNESS',
    title: '기억력 관리', subtitle: '작업 기억 · 인지 탄력성 훈련',
    description: '정보 처리 속도와 기억 인출 효율을 높이는 두뇌 활성화 루틴입니다.',
    target_audience: '건망증이 늘어난 성인 및 인지 관리가 필요한 분',
    format_method: '인지 리포트 + 두뇌 자극 & 퀴즈 루틴', duration_text: '50분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'INTELLIGENCE', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 51
  },
  {
    id: 'well_sleep', category: 'brain_wellness', sub_category: 'BRAIN WELLNESS',
    title: '수면 및 이완 프로그램', subtitle: '입면 지연 완화 · 깊은 휴식 루틴',
    description: '잠들기 전 각성된 뇌파를 차분히 낮추는 비약물 수면 위생·이완 프로그램입니다.',
    target_audience: '잠들기 어렵거나 새벽에 자주 깨는 분',
    format_method: '수면 패턴 체크 + 이완 호흡·사운드 루틴', duration_text: '50분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'ALIGNMENT', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 52
  },
  {
    id: 'well_meditation', category: 'brain_wellness', sub_category: 'BRAIN WELLNESS',
    title: '뉴로 명상', subtitle: '뇌파로 확인하며 익히는 과학적 명상',
    description: '막연한 명상이 아니라 뇌파 변화를 기준으로 이완과 알아차림을 익힙니다.',
    target_audience: '명상을 시작하고 싶지만 잡념이 많은 분',
    format_method: '뇌파 모니터링 기반 가이드 명상', duration_text: '45분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'NEURO', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 53
  },
  {
    id: 'well_youth', category: 'brain_wellness', sub_category: '생애주기별',
    title: '아동·청소년 브레인 케어', subtitle: '학습 집중력 · 자기조절 · 정서 균형',
    description: '아동과 청소년의 주의 산만, 시험 불안, 정서 조절을 즐겁게 훈련하는 성장기 케어입니다.',
    target_audience: '초·중·고 학생 및 수험생, 학부모 상담 포함',
    format_method: '연령 맞춤 뇌파 체크 + 자기조절 훈련 + 부모 피드백', duration_text: '50분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'KIDS/TEENS', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 54
  },
  {
    id: 'well_adult', category: 'brain_wellness', sub_category: '생애주기별',
    title: '성인 브레인 케어', subtitle: '커리어 퍼포먼스 & 라이프 밸런스',
    description: '일과 회복의 균형을 맞추고 최상의 컨디션을 유지하려는 성인 맞춤 케어입니다.',
    target_audience: '직장인, 전문직, 양육자, 자기관리 성인',
    format_method: '종합 컨디션 점검 + 맞춤 웰니스 플랜', duration_text: '50분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'ADULT', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 55
  },
  {
    id: 'well_senior', category: 'brain_wellness', sub_category: '생애주기별',
    title: '시니어 브레인 케어', subtitle: '활기찬 노년 · 두뇌 인지 예방 관리',
    description: '기억력 유지와 정서적 활력을 돕는 비의료 시니어 두뇌 웰니스 케어입니다.',
    target_audience: '인지 활력을 지키고 싶은 60대 이상 시니어 및 가족',
    format_method: '시니어 맞춤 두뇌 체크 + 인지·정서 훈련', duration_text: '50분',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: 'SENIOR', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 56
  },
  {
    id: 'academy_counselor_40h', category: 'academy', sub_category: '전문가 과정',
    title: '뇌교육상담사 전문가 과정', subtitle: '총 40시간 이론 교육 · 5주 과정(주 8시간)',
    description: '뇌과학 기반 상담 이론부터 2채널 뇌파 데이터 리딩, 웰니스 프로그램 설계까지 배우는 전문가 양성 과정입니다. (본 자격증은 등록 민간자격증입니다.)',
    target_audience: '웰니스 강사, 상담사, 보육·교육 종사자, 헬스케어 예비 창업자',
    format_method: '총 40시간 이론(5주 · 주 8시간) + 자격 시험 응시', duration_text: '5주 (총 40시간)',
    price_krw: null, price_label: '상담 확정 · 관리자 설정가', badge: '민간자격과정', session_count: 1,
    includes_neurofeedback: false, active: true, sort_order: 60
  }
];

export var FALLBACK_COHORTS = [
  {
    id: 'cohort-2027-1',
    title: '2027년 1기 뇌교육상담사 전문가 과정',
    schedule_text: '매주 토요일 09:00~18:00 (일정 협의 가능)',
    hours_text: '총 40시간 이론 교육 (5주 과정 · 주 8시간)',
    fee_label: '교육비 상담 안내 (관리자에서 금액 확정 반영)',
    exam_info: '수료 기준 충족 후 민간자격 시험 응시 · 합격 시 뇌교육상담사(등록 민간자격) 발급',
    capacity: 20, status: 'recruiting'
  }
];

export var FALLBACK_COUPONS = [
  {
    code: 'MINAWELCOME', title: '첫 방문 뇌파검사 10% 웰컴 할인',
    discount_type: 'percent', discount_value: 10, min_amount: 50000, active: true, expires_at: null
  }
];

export var FALLBACK_POSTS = [
  {
    id: 'seed-notice-1', category: 'notice',
    title: 'MINA WORLD 모바일 웰니스 플랫폼 오픈 안내',
    body: '안녕하세요, MINA Wellness World 대표 이미나입니다.\n\n뇌파측정 예약부터 뉴로피드백 이력, MY BRAIN 대시보드, 마인드케어·브레인 웰니스 프로그램, 뇌교육상담사 아카데미까지 한곳에서 이용하실 수 있도록 통합 플랫폼을 준비했습니다.\n\n※ 본 서비스의 모든 측정·훈련 데이터는 의학적 진단이나 치료를 대체하지 않는 비의료 웰니스 관리 참고 자료입니다.',
    author_name: 'MINA WORLD', is_pinned: true, is_hidden: false, created_at: '2026-11-17T09:00:00+09:00'
  },
  {
    id: 'seed-column-1', category: 'column',
    title: '내 탓이 아니라 뇌 탓이다 — 자율신경이 먼저 보내는 신호',
    body: '해야 할 일을 미루고 쉽게 지치는 날, 스스로의 의지를 탓하기 쉽습니다. 하지만 많은 경우 전두엽의 피로와 자율신경계 과각성이 원인입니다.\n\n자신의 현재 상태를 숫자와 리포트로 객관적으로 확인하는 순간, 비로소 나에게 맞는 회복 루틴이 시작됩니다.',
    author_name: '이미나 대표', is_pinned: false, is_hidden: false, created_at: '2026-11-17T09:10:00+09:00'
  }
];

export var FALLBACK_ACADEMY_CURRICULUM = [
  { week: '1주차', title: '뇌과학 기초와 뇌교육의 이해', detail: '뇌 구조·신경가소성·자율신경계, 웰니스 관점의 뇌 건강 개념 정리' },
  { week: '2주차', title: '2채널 뇌파 측정과 데이터 리딩', detail: '뇌파 종류(알파·베타·세타 등)와 집중·스트레스 지표 읽는 법, 결과지 해석 실습' },
  { week: '3주차', title: '뇌교육 상담 프로토콜', detail: '상담 구조화, 라포 형성, 컨디션 체크인 질문 설계, 비의료 경계와 고지' },
  { week: '4주차', title: '뉴로피드백·웰니스 프로그램 설계', detail: '대상별(아동·성인·시니어) 훈련 설계, 5주 루틴 구성, 기록·피드백 방법' },
  { week: '5주차', title: '실습 · 사례 슈퍼비전 · 자격 시험', detail: '모의 상담·결과지 리딩 실습, 사례 발표, 민간자격 시험 응시' }
];
