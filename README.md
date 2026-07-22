# QR 안내 및 방문 통계 관리 서비스

웹 주소나 안내 문자를 QR 코드로 만들고, QR을 통해 접속한 횟수를 Supabase에 기록하는 학습용 MVP입니다.

## 구현된 기능

- `/`에서 링크 또는 안내 문자를 입력해 QR 코드를 생성합니다.
- QR 정보는 Supabase의 `qr_codes` 표에 저장됩니다.
- 생성 직후 QR 이미지를 확인하고 PNG 파일로 내려받을 수 있습니다.
- 방문자가 `/r/고유코드` 주소를 열면 방문 횟수가 1 증가합니다.
- 웹 주소 QR은 집계 후 원래 사이트로 이동합니다.
- 안내 문자 QR은 집계 후 안내 내용을 웹 화면으로 보여줍니다.
- `/admin`에서 QR별 누적 방문 횟수와 최근 방문 시각을 확인합니다.

## 폴더 구조

```text
qr-visit-manager-starter/
├─ public/
│  ├─ index.html             # QR 생성 화면
│  ├─ admin.html             # 관리자 통계 화면
│  ├─ css/
│  │  └─ style.css           # 전체 화면 디자인
│  └─ js/
│     ├─ create-qr.js        # QR 생성 화면 기능
│     └─ admin.js            # 통계 화면 기능
├─ src/
│  └─ server.js              # 서버, API, 이동 및 방문 집계 처리
├─ supabase/
│  ├─ schema.sql             # 표, 방문 집계 함수, 로컬 테스트 정책
│  └─ production-lockdown.sql # 운영 전 테스트 정책 제거
├─ scripts/
│  └─ setup-env.ps1          # 환경변수를 안전하게 준비하는 도우미
├─ .env.example              # 환경변수 작성 예시
├─ .gitignore                # 비밀 키와 설치 파일 제외
├─ package.json              # 실행 명령과 라이브러리 목록
└─ README.md                 # 설치 및 사용 설명
```

## 1. 데이터베이스 준비

1. Supabase 프로젝트를 엽니다.
2. 왼쪽 메뉴에서 **SQL Editor**를 선택합니다.
3. `supabase/schema.sql`의 전체 내용을 복사하여 실행합니다.
4. **Table Editor**에서 `qr_codes`, `qr_visits` 표가 보이는지 확인합니다.

이번 로컬 테스트 정책이 추가되었으므로 이전에 실행했더라도 최신 SQL 전체를 다시 실행합니다. 기존 QR 데이터는 유지됩니다.

## 2. 환경변수 입력

기존 `C:\Git\simple-guestbook\.env.local`에 실제 연결값이 있다면 아래 명령으로 재사용할 수 있습니다.

```powershell
cd C:\Git\qr-visit-manager-starter
powershell -ExecutionPolicy Bypass -File .\scripts\setup-env.ps1
```

서버 비밀 키를 묻지 않으며, 완료되면 테스트용 관리자 키가 출력됩니다. 방문자는 별도 키가 필요하지 않습니다.

직접 작성하려면 프로젝트 폴더의 `.env` 파일에 아래 값을 입력합니다.

```dotenv
SUPABASE_URL=https://실제프로젝트아이디.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_실제키
SUPABASE_SECRET_KEY=
PUBLIC_BASE_URL=http://localhost:3000
ADMIN_API_KEY=직접_정한_길고_안전한_문자열
PORT=3000
```

키 확인 위치는 Supabase의 **Project Settings → API Keys**입니다.

- `SUPABASE_PUBLISHABLE_KEY`에는 Publishable key를 입력합니다.
- 로컬 테스트에서는 `SUPABASE_SECRET_KEY`를 비워둘 수 있습니다.
- Vercel 배포 전에는 `SUPABASE_SECRET_KEY`에 실제 서버 비밀 키를 입력합니다.
- 기존 프로젝트는 `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` 이름도 사용할 수 있습니다.
- 서비스 역할 키는 서버 전용입니다. GitHub, 화면 코드, 채팅에 공개하면 안 됩니다.
- `.env` 파일은 `.gitignore`에 포함되어 Git에 올라가지 않습니다.

## 3. 로컬에서 실행

PowerShell에서 다음 명령을 실행합니다.

```powershell
cd C:\Git\qr-visit-manager-starter
npm install
npm run dev
```

브라우저에서 아래 주소를 엽니다.

- QR 생성: `http://localhost:3000`
- 방문 통계: `http://localhost:3000/admin`
- 서버 상태 확인: `http://localhost:3000/health`

## 4. QR 생성과 통계 확인

1. 로컬 테스트에서는 관리자 키가 QR 생성 화면에 자동으로 표시되고 입력됩니다.
2. QR 이름과 연결할 웹 주소 또는 안내 문자를 입력합니다.
3. **QR 코드 만들기**를 누릅니다.
4. 생성된 PNG를 내려받거나 추적 주소를 복사합니다.
5. QR을 휴대폰으로 스캔합니다.
6. **방문 통계** 화면을 열면 같은 관리자 키로 통계를 자동으로 불러옵니다.

방문자는 키 입력 없이 QR을 스캔하여 연결된 정보를 볼 수 있습니다.

관리자 키는 학습용 임시 보호 장치이며 현재 브라우저 탭의 `sessionStorage`에만 보관됩니다. 실제 운영 서비스로 확장할 때는 Supabase Auth 로그인을 사용하는 것이 좋습니다.

## 5. Vercel 환경변수

Vercel 프로젝트의 **Settings → Environment Variables**에 아래 다섯 값을 추가합니다.

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY
PUBLIC_BASE_URL
ADMIN_API_KEY
```

Vercel에서는 `PUBLIC_BASE_URL`을 실제 배포 주소로 입력합니다.

```text
https://내프로젝트.vercel.app
```

환경변수를 저장한 뒤에는 새로 배포해야 변경 내용이 적용됩니다.

운영 배포 직전 Supabase SQL Editor에서 `supabase/production-lockdown.sql`을 실행하여 로컬 테스트 정책을 제거합니다.

## 보안 주의사항

- 서비스 역할 키를 HTML이나 브라우저 자바스크립트에 작성하지 않습니다.
- `.env` 파일을 Git에 추가하지 않습니다.
- 로컬 테스트 정책은 공개 키로 QR 생성과 목록 조회를 허용하므로 학습 중에만 사용합니다.
- 운영 전 `production-lockdown.sql`을 실행하고 실제 서버 Secret 키를 사용합니다.
- 현재 구조는 IP 주소나 기기 정보를 저장하지 않고 방문 시각과 횟수만 기록합니다.
