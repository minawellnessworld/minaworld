# MINA WORLD 모바일 앱 (PWA) — `website/app/`

MINA Wellness World의 모바일 우선 웹앱(PWA)입니다. 빌드 도구 없이 GitHub Pages에서 바로 실행되며, `minaworld.co.kr/app/` 경로로 배포되는 것을 전제로 만들었습니다. 동일 코드베이스를 Capacitor로 감싸면 iOS/Android 앱으로 패키징할 수 있습니다.

- 백엔드: Supabase (Postgres + Auth + Storage + RLS) — 프로젝트 `adoghzqnfspmxzvrftuo` (ap-northeast-2)
- 프런트: ES Module + 순수 CSS (프레임워크·번들러 없음)
- 외부 CDN: `@supabase/supabase-js@2`, `chart.js@4.4.1`, Pretendard, GA4 `G-TTMVKBHNZM`

## 실행 · 확인

로컬 확인 (ES Module은 `file://` 에서 동작하지 않습니다):

```bash
cd website
python3 -m http.server 8099
# 브라우저에서 http://127.0.0.1:8099/app/ 접속
```

배포는 기존 사이트와 동일하게 `website/` 폴더를 GitHub Pages로 올리면 `/app/` 경로에서 열립니다. 별도 빌드 과정은 없습니다.

## 시스템 키 설정

`js/config.js` 에 실제 Supabase URL과 **anon(publishable) 키**가 기본값으로 들어 있습니다. `service_role` 키는 절대 프런트엔드에 넣지 않습니다.

런타임에 덮어쓰려면 아래 두 방법 중 하나를 사용하세요.

1. `index.html`의 `<head>`에 스크립트 추가
```html
<script>
  window.__MINA_CONFIG__ = {
    SUPABASE_URL: 'https://xxxx.supabase.co',
    SUPABASE_ANON_KEY: 'eyJ...'
  };
</script>
```
2. meta 태그 (`index.html`)
```html
<meta name="mina-supabase-url" content="https://xxxx.supabase.co">
<meta name="mina-supabase-key" content="eyJ...">
```

키가 없으면 앱은 **로컬 체험 모드**로 열립니다(localStorage). 이때 상단에 "로컬 체험 모드 — 입력 내용이 이 기기에만 저장됩니다" 배너가 항상 표시됩니다.

## 폴더 구조

```
app/
├─ index.html          앱 셸 (GA4, Pretendard, Supabase/Chart.js CDN, 뷰포트)
├─ manifest.json       PWA 매니페스트 (standalone, 테마 #070D1E)
├─ sw.js               서비스 워커 (앱 셸 캐시 · Supabase/CDN 패스스루)
├─ icons/              icon-192/512, maskable, apple-touch, favicon
├─ css/app.css         디자인 시스템 (아이보리·화이트·딥네이비·옐로우)
└─ js/
   ├─ config.js        Supabase 키 · 브랜드 · 상태값 라벨
   ├─ catalog.js       Supabase 미연결 시 기본 카탈로그(시드와 동일)
   ├─ supabase.js      Supabase 클라이언트 · Signed URL
   ├─ store.js         인증 · 데이터 접근 (live/local 이중 백엔드)
   ├─ ui.js            아이콘 · 시트 · 토스트 · 포맷 · 차트 옵션
   ├─ booking.js       예약 플로우(날짜/시간/쿠폰/결제안내) 공용 모듈
   ├─ app.js           해시 라우터 · 헤더/탭바 · 알림함
   └─ views/           home · brain-check · neuro · my-brain · programs ·
                       academy · community · account · more · admin
```

## 화면 · 라우트

| 라우트 | 화면 | 비고 |
| --- | --- | --- |
| `#/home` | S01 홈 | 오늘의 뇌 컨디션 체크인, M-I-N-A, 6대 메뉴, 최신 공지 |
| `#/brain-check` | S02 BRAIN CHECK | 간편 5만·종합 15만, 예약/변경/취소, 결과지 Signed URL, 재검사일 |
| `#/neuro` | S03 NEURO TRAINING | 패키지 신청, 잔여 횟수, 회차 기록·변화 그래프(2회 이상) |
| `#/my-brain` | S04 MY BRAIN | 목표 저장, 요약 타일, 변화 그래프, 예약/구매/웰니스 탭 |
| `#/programs` | S05 프로그램 10종 | 카테고리 필터, 상세 시트, 바로 예약 |
| `#/academy` | S06 MINA ACADEMY | 40시간·5주, 커리큘럼, 기수, 수강 신청, 수강생 자료실 |
| `#/community` | S07 커뮤니티 | 7개 카테고리, 상세, 댓글, 관리자 고정/숨김/삭제 |
| `#/account` | S08 로그인·마이페이지 | 이메일 가입/로그인, 예약·결제·쿠폰·알림·등급 |
| `#/more` | 더보기 | 커뮤니티·아카데미·마이페이지·앱 설치 안내 |
| `#/admin` | S09 관리자 콘솔 | `admin`/`counselor` 전용, 12개 탭 |

## 실제 작동 / 외부 키 연동 대기 (화면에서 구분 표시)

실제 작동
- 이메일 회원가입·로그인·세션 유지 (Supabase Auth, 현재 프로젝트는 메일 인증 없이 즉시 로그인)
- 뇌 컨디션 체크인 → `wellness_logs`
- 검사·뉴로피드백·프로그램·아카데미 예약/신청 → `bookings`, `payments`, `academy_enrollments`
- 검사 결과지 Storage 업로드 → 회원 MY BRAIN에서 Signed URL 열람
- 커뮤니티 글/댓글, 관리자 콘솔 전 기능(회원·결제·프로그램·쿠폰·상담기록·B2B)
- 예약·결과 등록 알림 → `notification_logs`(앱 내 알림함)

외부 키 연동 필요 (완료된 척하지 않고 상태로 표시)
- 카카오 로그인: 버튼·안내 모달 구현, "카카오 디벨로퍼스 앱 키 등록 후 활성화 (현재 이메일 로그인 이용)"
- 온라인 카드결제(PG): 주문/금액/쿠폰 계산·payment 레코드 생성까지 구현, "결제 모듈 연동 대기 · 예약 접수(무통장/현장 확인)"
- 카카오 알림톡·앱 푸시: 알림 저장·표시 구현, "앱 내 알림 저장(외부 발송 연동 필요)"

데이터 원칙
- 검사 결과·훈련 기록 등 개인 측정값은 **실데이터만** 표시합니다. 없으면 "아직 등록된 …이 없습니다" 빈 상태이며 임의 수치·더미 그래프를 그리지 않습니다.
- 프로그램 가격은 `programs.price_krw`/`price_label` 값을 그대로 사용합니다. 미확정 상품은 "상담 확정 · 관리자 설정가"로 표시됩니다.

## 관리자 계정

- `minawellnessworld@gmail.com` 으로 가입하면 DB 트리거(`handle_new_user`)가 자동으로 `role='admin'`, `member_grade='Alignment'`로 승격합니다.
- 그 외 계정은 `member`. 역할 변경은 관리자 콘솔 → 회원 관리에서 가능합니다.
- `#/admin` 은 `admin`/`counselor` 가 아니면 메뉴에 나타나지 않고, 주소로 직접 들어와도 차단됩니다.

## Supabase 쪽 준비물 체크리스트

1. `scratch/app/supabase_schema.sql` 적용 (테이블·RLS·시드·트리거) — 완료된 것으로 확인
2. Storage 비공개 버킷 **`brain-results`** 생성 — **미완료 상태(2026-11-17 확인)**
   ```sql
   insert into storage.buckets (id, name, public)
   values ('brain-results', 'brain-results', false)
   on conflict (id) do nothing;
   ```
   버킷이 없으면 결과지 업로드/열람이 되지 않으며, 화면에 안내 문구가 표시됩니다.
3. (선택) 카카오 로그인: Supabase Auth → Providers → Kakao 활성화 + 카카오 디벨로퍼스 앱 키/Redirect URI 등록
4. (선택) PG·알림톡: 토스페이먼츠/포트원 가맹점 키, 알림톡 발신 프로필, FCM 키

## 검증 스크립트

```bash
python3 tools/app-checks/check_js.py     # 18개 모듈 문법 검사(esprima)
```
