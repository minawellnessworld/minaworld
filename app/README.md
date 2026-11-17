# MINA WORLD 통합 플랫폼 앱 (PWA) — `website/app/` · v2.0.6

MINA Wellness World의 **통합 웰니스 플랫폼**입니다. B2C 회원 앱 + 전체 관리자 콘솔 + 제휴 기관(파트너) 대시보드 + 기관 직원 권한이 하나의 코드베이스에서 동작합니다. 빌드 도구 없이 GitHub Pages에서 바로 실행되며 `minaworld.co.kr/app/` 경로 배포를 전제로 합니다.

- 백엔드: Supabase (Postgres + Auth + Storage + RLS) — 프로젝트 `adoghzqnfspmxzvrftuo` (ap-northeast-2)
- DB 계약: `scratch/app/supabase_schema.sql` + **`scratch/app/supabase_schema_v2.sql`** (v2 적용 완료 2026-11-17)
- 프런트: ES Module + 순수 CSS (프레임워크·번들러 없음)
- 외부 CDN: `@supabase/supabase-js@2`, `chart.js@4.4.1`, Pretendard, GA4 `G-TTMVKBHNZM`

## 실행 · 확인

```bash
cd website
python3 -m http.server 8099
# 브라우저에서 http://127.0.0.1:8099/app/ 접속
```

## 화면 · 라우트

| 라우트 | 화면 | 접근 |
| --- | --- | --- |
| `#/home` | 회원 홈 · 개인 대시보드(최근 검사·다음 예약·이용 프로그램·뉴로피드백 잔여·최근 웰니스·공지/이벤트·기관 결과 공유 요청 배너) + 오늘의 뇌 컨디션 체크인 | 전체 |
| `#/brain-check` | BRAIN CHECK 예약·결과 | 전체 |
| `#/neuro` | NEURO TRAINING · 이용권 | 전체 |
| `#/my-brain` | MY BRAIN (검사 기록·항목별 설명·이전 vs 현재·상담사 안내·다음 재검사 권장일) | 로그인 |
| `#/programs` `#/academy` `#/community` | 프로그램 10종 · 아카데미 · 커뮤니티/FAQ | 전체 |
| `#/community?c=neuroscience` | MINA COMMUNITY — **하루 한 스푼, 뇌과학** 연재 9편 + 카테고리 게시글 | 전체 |
| `#/community/spoon/{id}` | 연재 아티클 리더(요일 배지 · 30초 핵심 요약 · 본문 01~04 · 원문 링크 · BRAIN CHECK 예약) | 전체 |
| `#/account` | 로그인·회원가입(3종 동의)·마이페이지·기관 결과 공유 토글·비밀번호 변경·회원 탈퇴 | 전체 |
| `#/admin-login` | **관리자 · 기관 담당자 공용 로그인 포털** (+ TOTP 2단계 인증) | 전체 |
| `#/admin` | **전체 관리자 콘솔** (15탭 · PC 풀와이드) | `admin` · `super_admin` · `counselor`(조회) |
| `#/partner` | **제휴 기관 대시보드** (권한별 탭 · 자기 기관만) | `partner_admin` · `staff` |

### 관리자 콘솔 탭
운영 요약(기간 필터 + 10대 지표 + 월별 매출 차트) · 예약 관리(일/주/월 달력 + 지점·담당자 필터 + 상태 5종 + 직접 등록) · 회원 관리(통합 상세 + 상태) · 검사 결과(공개 토글·항목 설명·PDF) · 뉴로피드백 · 결제·매출 · 프로그램 · 아카데미 · 콘텐츠(공지/이벤트/뇌과학/웰니스/FAQ/교육 안내) · 쿠폰 · 상담 기록 · 제휴 기관(8종 유형·계약·수수료·정산계좌·승인·계정 즉시 발급·운영시간) · 기관 정산(생성·완료·CSV) · 감사 로그 · 보안(2FA·동의 이력)

### 기관 대시보드 탭
대시보드(기관 회원/예약/검사/뉴로/매출/담당자별 실적) · 회원 관리(즉시 발급·소속 승인·결과 열람 요청) · 예약 관리 · 검사 결과(동의 회원만) · 직원·권한(8개 세부 권한) · 상품·운영시간 · 정산(조회·CSV)

## 계정 · 권한

| role | 의미 | 화면 |
| --- | --- | --- |
| `member` | 일반 회원 | B2C |
| `counselor` | 본점 상담사 | `#/admin` 조회 |
| `staff` | 기관 직원 | `#/partner` — `staff_permissions` 에 허용된 탭만 |
| `partner_admin` | 제휴 기관 관리자 | `#/partner` 전체(자기 기관) |
| `admin` / `super_admin` | **동일한 총괄 관리자** | `#/admin` 전체 |

- `minawellnessworld@gmail.com` 은 v1 트리거 가입 시 `admin`, v2 트리거 신규 가입 시 `super_admin` 입니다. 두 값은 앱 전체에서 `isAdmin()` 하나로 동일하게 취급합니다.
- 기관 관리자·직원 계정은 `account_pre_assignments` 저장 → `persistSession:false` 보조 클라이언트 `auth.signUp()` → `handle_new_user` 트리거가 역할·기관을 바인딩하는 방식으로 **현재 관리자 세션을 끊지 않고 즉시 발급**됩니다. 임시 비밀번호는 발급 직후 한 번만 표시됩니다.

## 실제 작동 / 외부 연동 대기

실제 작동
- 이메일 가입·로그인·세션 유지, 비밀번호 변경, 회원 탈퇴(`withdraw_my_account` RPC)
- 동의 3종(개인정보·민감정보·마케팅) → `consent_logs` 즉시 기록, 동의 이력 조회, 기관 결과 공유 동의/철회
- 회원이 직접 제휴 기관 소속 요청 → 기관 관리자 승인(`org_memberships` pending→approved)
- 지점·담당자·운영시간(`org_schedules`) 기반 예약 + `get_booked_slots` RPC 로 예약된 시간대 비활성 + DB 유니크 인덱스 중복 차단(한국어 안내)
- 관리자 직접 예약 등록, 예약 상태 5종(대기/확정/방문 완료/취소/노쇼)
- 결제 완료 → `sync_neuro_package_on_payment` 트리거가 이용권 자동 등록 / 환불 → 만료 처리
- 검사 결과 등록·수정·삭제, `is_public` 공개 토글, `item_details` 항목 설명, 결과지 Storage Signed URL
- 제휴 기관 등록·승인·계정 발급·요일별 운영시간, 기관 회원 즉시 발급·소속 승인
- 기관 정산(실제 `payments` paid/refunded + `commission_rate`) 생성·완료·CSV, 관리자 전 기관 정산
- 감사 로그(`audit_logs`) 주요 관리자 액션 자동 기록, 2단계 인증(TOTP) 등록·검증·로그인 챌린지

외부 키 연동 필요 (완료된 척하지 않고 상태로 표시)
- 카카오 로그인: 버튼·안내만, "디벨로퍼스 앱 키 등록 후 활성화"
- 휴대폰 본인인증: 통신사 인증 연동 전 → 화면에 미제공으로 표시
- 온라인 카드결제(PG): 주문·금액·쿠폰 계산과 payment 레코드까지, 결제 승인은 연동 대기
- 카카오 알림톡·앱 푸시: 앱 내 알림 저장까지만

데이터 원칙
- 검사 결과·훈련 기록은 **실데이터만** 표시. 없으면 빈 상태이며 임의 수치·더미 그래프를 만들지 않습니다.
- 매출·정산·지표는 실제 DB 값만 집계합니다.
- 직원 권한 수정은 현재 DB 정책상 `profiles` UPDATE 가 본인/전체 관리자만 허용됩니다. 기관 관리자의 수정 시도는 **반영 여부를 재조회로 확인해 실패를 숨기지 않고** 전체 관리자 콘솔 안내를 표시합니다.

## 폴더 구조

```
app/
├─ index.html
├─ manifest.json
├─ sw.js                     v2.0.0 — PRECACHE_ASSETS 에 모든 모듈 등록
├─ icons/
├─ css/app.css               디자인 시스템 v2 (샴페인 골드 · 데스크톱 대시보드)
└─ js/
   ├─ config.js              키·브랜드·역할·동의·권한·상태 라벨
   ├─ catalog.js             Supabase 미연결 시 기본 카탈로그
   ├─ supabase.js            클라이언트 · 보조 클라이언트(계정 발급) · MFA 헬퍼
   ├─ store.js               인증·회원·예약·결제·결과·뉴로·커뮤니티 (live/local)
   ├─ store-org.js           기관·지점·운영시간·소속·계정 발급·정산
   ├─ store-security.js      동의·감사 로그·기간 지표·비밀번호/탈퇴·TOTP
   ├─ spoon.js              '하루 한 스푼, 뇌과학' 피드 로더 (spoon-feed.json + articles.json 병합)
   ├─ ui.js                  아이콘·시트·토스트·포맷·차트·CSV
   ├─ booking.js             통합 예약 플로우·예약 상태·관리자 예약 등록
   ├─ app.js                 해시 라우터·헤더/탭바·권한 분기
   └─ views/
      ├─ home · brain-check · neuro · my-brain · programs · academy ·
      │  community · account · more
      ├─ admin.js            관리자 콘솔 셸 + 뉴로/결제/프로그램/아카데미/쿠폰/상담
      ├─ admin/              overview · bookings · members · results ·
      │                      content · orgs · settlements · audit · security
      ├─ admin-login.js      관리자·기관 로그인 포털 + MFA
      └─ partner.js          제휴 기관 대시보드
```

## 하루 한 스푼, 뇌과학 연재 연동 (v2.0.5 ~)

- 데이터: `website/data/spoon-feed.json` (매일 08:30 스케줄이 새 아티클을 index 0에 추가) + `website/data/articles.json`(`/admin.html` 직접 작성 글)을 앱이 `cache: 'no-store'`로 읽어 `id` 중복 제거 후 `date` 최신순으로 병합합니다.
- 생성 스크립트: `python3 scratch/spoon/build_spoon_feed.py` — `website/article-*.html` 9편의 제목·날짜·요일 배지·리드·30초 요약·본문 섹션을 파싱하고 `community.html` 카드와 교차 검수합니다. (`articles.json`은 읽지도 쓰지도 않습니다.)
- 서비스워커: `/data/*.json` 요청은 캐시하지 않고 네트워크 직통으로 통과합니다.
- 홈: `오늘의 하루 한 스푼, 뇌과학` 카드가 가장 최신 글을 보여주고 `#/community/spoon/{id}`로 연결됩니다.

## 검증 스크립트

```bash
python3 tools/app-checks/check_js.py      # 모든 JS 모듈 문법 (esprima)
python3 tools/app-checks/check_idents.py  # 미정의 식별자
python3 tools/app-checks/check_app.py     # import/export 정합성 · HTML · CSS 괄호 ·
                                          # SW 버전(≥2.0.0) 및 선캐시 누락 · admin/super_admin 동등 취급
```
