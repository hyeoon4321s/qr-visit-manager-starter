# QR 링크 보드

GitHub에 코드를 저장하고 Vercel에 배포하는 QR 생성 및 방문 통계 학습용 웹사이트입니다. 데이터는 Vercel Marketplace에서 연결한 Upstash Redis에 저장합니다.

## 사용 권한

- 일반 방문자: QR 목록, 연결 주소, 누적 접속 횟수, 최근 접속 시각 확인
- 관리자: `ADMIN` 입력 후 새로운 QR 생성
- QR 스캔 방문자: 별도 입력 없이 원래 웹 주소로 이동

`ADMIN`은 화면과 코드에 공개된 학습용 값이므로 실제 보안 기능은 아닙니다.

## 서비스 역할

- GitHub: 프로젝트 코드와 변경 이력 저장
- Vercel: 웹페이지와 서버 함수 배포
- Vercel Marketplace의 Upstash Redis: QR 정보와 방문 횟수 저장

Vercel Functions는 요청마다 실행되므로 파일만으로 방문 횟수를 영구 저장할 수 없습니다. Redis 연결이 필요합니다.

## Vercel에서 저장소 연결

1. Vercel에서 `qr-visit-manager-starter` 프로젝트를 엽니다.
2. 상단 `Storage` 또는 `Marketplace`를 선택합니다.
3. `Upstash`를 검색하고 `Upstash Redis`를 설치합니다.
4. 새 Redis 데이터베이스를 만들고 현재 프로젝트에 연결합니다.
5. 다음 환경변수가 자동 생성되었는지 확인합니다.

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

6. Vercel에서 프로젝트를 다시 배포합니다.

Supabase와 SQL Editor는 더 이상 사용하지 않습니다.

## 작동 방식

1. 관리자가 `ADMIN`을 입력합니다.
2. QR 이름과 웹 주소를 입력해 QR을 생성합니다.
3. QR 정보가 Upstash Redis에 저장됩니다.
4. QR 스캔 시 Redis의 방문 횟수가 1 증가합니다.
5. 방문 횟수 기록 후 원래 웹 주소로 이동합니다.
6. 공개 목록을 새로고침하면 최신 통계가 표시됩니다.

## 로컬 실행

Vercel에서 생성된 Upstash 환경변수를 `.env` 파일에 입력합니다.

```dotenv
UPSTASH_REDIS_REST_URL=https://실제주소.upstash.io
UPSTASH_REDIS_REST_TOKEN=실제토큰
PORT=3000
```

```powershell
cd C:\Git\qr-visit-manager-starter
npm install
npm run dev
```

## GitHub 및 Vercel 배포

```powershell
git add .
git commit -m "Vercel Redis 저장 방식으로 변경"
git push
```

GitHub에 새 커밋이 올라가면 연결된 Vercel 프로젝트가 자동으로 다시 배포됩니다.
