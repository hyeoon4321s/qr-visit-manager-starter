# QR 링크 보드

GitHub에 코드를 저장하고 Vercel에 배포하는 QR 생성 및 방문 통계 학습용 웹사이트입니다. Upstash와 Supabase 없이 Vercel Blob에 QR 정보와 방문 기록을 저장합니다.

## 사용 권한

- 일반 방문자: QR 목록, 연결 주소, 누적 접속 횟수, 최근 접속 시각 확인
- 관리자: `ADMIN` 입력 후 새로운 QR 생성 및 기존 QR·방문 기록 삭제
- QR 스캔 방문자: 별도 입력 없이 원래 웹 주소로 이동

`ADMIN`은 화면과 코드에 공개된 학습용 값이므로 실제 보안 기능은 아닙니다.

## 서비스 역할

- GitHub: 프로젝트 코드와 변경 이력 저장
- Vercel: 웹페이지, 서버 함수, Blob 저장소 제공
- Vercel Blob: QR 정보와 방문 이벤트 파일 저장

Vercel Functions는 요청마다 실행되므로 프로젝트 파일만으로 방문 횟수를 영구 저장할 수 없습니다. 이 프로젝트는 별도 업체 대신 Vercel의 Blob 저장소 하나만 사용합니다.

## Vercel에서 Blob 연결

1. Vercel에서 `qr-visit-manager-starter` 프로젝트를 엽니다.
2. 화면 위쪽의 `Storage`를 선택합니다.
3. `Create Database`를 누르고 `Blob`을 선택합니다.
4. 저장소 접근 방식은 `Public`을 선택합니다.
5. 현재 프로젝트에 저장소를 연결합니다.
6. 프로젝트의 `Settings` → `Environment Variables`에서 아래 연결 값이 생성되었는지 확인합니다.

```text
BLOB_STORE_ID
```

최신 Vercel Blob 연결은 OIDC 자동 인증을 사용하므로 `BLOB_READ_WRITE_TOKEN`이 보이지 않아도 됩니다. 이전 방식으로 연결한 프로젝트에서는 해당 토큰이 보일 수 있습니다.

7. `Deployments`에서 최신 배포의 메뉴를 열고 `Redeploy`를 실행합니다.

Upstash, Supabase, SQL Editor는 사용하지 않습니다.

## 작동 방식

1. 관리자가 `ADMIN`을 입력합니다.
2. QR 이름과 웹 주소를 입력해 QR을 생성합니다.
3. QR 정보가 Vercel Blob에 JSON 파일로 저장됩니다.
4. QR 스캔 시 작은 방문 이벤트 파일이 하나 추가됩니다.
5. 방문 기록 후 원래 웹 주소로 이동합니다.
6. 공개 목록을 새로고침하면 이벤트 파일 수를 계산한 최신 통계가 표시됩니다.
7. 관리자가 QR을 삭제하면 해당 QR 정보와 누적 방문 기록이 함께 삭제됩니다.

## 로컬 실행

로컬 실행에서는 Vercel CLI로 환경변수를 내려받거나 Blob 읽기·쓰기 토큰을 `.env` 파일에 입력합니다. Vercel 배포 환경에서는 OIDC로 자동 인증됩니다.

```dotenv
BLOB_READ_WRITE_TOKEN=실제_Vercel_Blob_토큰
PORT=3000
```

PowerShell에서 다음 명령을 실행합니다.

```powershell
cd C:\Git\qr-visit-manager-starter
npm install
npm run dev
```

## GitHub 및 Vercel 배포

```powershell
git add .
git commit -m "Upstash 없이 Vercel Blob 저장 방식으로 변경"
git push
```

GitHub에 새 커밋이 올라가면 연결된 Vercel 프로젝트가 자동으로 다시 배포됩니다.

## 학습용 구조의 한계

방문할 때마다 Blob 파일을 하나 만들기 때문에 소규모 학습과 테스트에 적합합니다. 방문량이 커지면 파일 수와 저장 작업 비용이 늘어나므로, 실제 서비스에서는 Redis나 데이터베이스로 방문 횟수를 관리하는 편이 적합합니다.
