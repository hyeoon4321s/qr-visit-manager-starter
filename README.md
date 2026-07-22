# QR 링크 보드

관리자는 QR 코드를 만들고, 일반 방문자는 생성된 QR 목록과 누적 접속 통계를 확인하는 학습용 웹사이트입니다.

## 사용 권한

- 일반 방문자: QR 목록, 연결 주소, 누적 접속 횟수, 최근 접속 시각 확인
- 관리자: `ADMIN` 입력 후 새로운 QR 생성
- QR 스캔 방문자: 별도 입력 없이 원래 웹 주소로 이동

`ADMIN`은 화면과 코드에 공개된 학습용 값이므로 실제 보안 기능은 아닙니다.

## 작동 방식

1. 관리자가 `ADMIN`을 입력합니다.
2. QR 이름과 연결할 웹 주소를 입력해 QR을 생성합니다.
3. 생성 정보는 Supabase의 `qr_codes` 표에 저장됩니다.
4. QR에는 `/r/고유코드` 형태의 추적 주소가 들어갑니다.
5. QR 스캔 시 `record_qr_visit` 함수가 누적 횟수를 1 증가시킵니다.
6. 방문 기록 후 원래 웹 주소로 이동합니다.
7. 공개 목록을 새로고침하면 최신 통계가 표시됩니다.

## 필요한 Vercel 환경변수

```text
SUPABASE_URL
SUPABASE_PUBLISHABLE_KEY
```

`SUPABASE_SECRET_KEY`, `ADMIN_API_KEY`, `PUBLIC_BASE_URL`은 사용하지 않습니다.

## Supabase 준비

기존 표와 방문 집계 함수가 없다면 먼저 `supabase/schema.sql`을 실행합니다.

이후 Supabase SQL Editor에서 `supabase/open-demo.sql`을 실행하여 공개 키로 목록 조회, QR 저장, 방문 기록 함수 실행을 허용합니다.

## 로컬 실행

프로젝트의 `.env` 파일에 실제 Supabase 프로젝트 주소와 공개 키를 입력합니다.

```dotenv
SUPABASE_URL=https://실제프로젝트아이디.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_실제키
PORT=3000
```

```powershell
cd C:\Git\qr-visit-manager-starter
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## Vercel 배포

코드를 GitHub에 푸시하면 연결된 Vercel 프로젝트가 자동으로 다시 배포됩니다. 환경변수를 변경했다면 반드시 새 배포가 필요합니다.
