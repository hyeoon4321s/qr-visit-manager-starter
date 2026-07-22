$ErrorActionPreference = "Stop"

# 이 스크립트는 기존 방명록 프로젝트의 공개 연결 정보를 재사용하여
# 서버 비밀 키 없이 실행할 수 있는 로컬 테스트 환경을 준비합니다.
$projectRoot = Split-Path -Parent $PSScriptRoot
$gitRoot = Split-Path -Parent $projectRoot
$targetEnvPath = Join-Path $projectRoot ".env"
$guestbookEnvPath = Join-Path $gitRoot "simple-guestbook\.env.local"

function Read-EnvironmentFile([string]$path) {
  $values = @{}

  if (-not (Test-Path -LiteralPath $path)) {
    return $values
  }

  Get-Content -LiteralPath $path -Encoding utf8 | ForEach-Object {
    if ($_ -match '^([^#=][^=]*)=(.*)$') {
      $values[$matches[1].Trim()] = $matches[2].Trim()
    }
  }

  return $values
}

function Test-ExampleValue([string]$value) {
  return (
    [string]::IsNullOrWhiteSpace($value) -or
    $value.Contains("your-project") -or
    $value.Contains("your_key") -or
    $value.Contains("your_service") -or
    $value.Contains("변경하세요")
  )
}

function Test-ServerKey([string]$value) {
  return (
    ($value.StartsWith("sb_secret_") -and $value.Length -gt 20) -or
    ($value.StartsWith("eyJ") -and $value.Split(".").Count -eq 3)
  )
}

function New-AdminKey {
  $randomBytes = New-Object byte[] 24
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()

  try {
    $generator.GetBytes($randomBytes)
  }
  finally {
    $generator.Dispose()
  }

  $randomText = [Convert]::ToBase64String($randomBytes).Replace("+", "-").Replace("/", "_").TrimEnd([char]'=')
  return "qr_$randomText"
}

$guestbookValues = Read-EnvironmentFile $guestbookEnvPath
$currentValues = Read-EnvironmentFile $targetEnvPath

$supabaseUrl = $guestbookValues["SUPABASE_URL"]
if (Test-ExampleValue $supabaseUrl) {
  $supabaseUrl = $guestbookValues["NEXT_PUBLIC_SUPABASE_URL"]
}
if (Test-ExampleValue $supabaseUrl) {
  $supabaseUrl = Read-Host "Supabase 프로젝트 주소를 입력하세요"
}

$publicKey = $guestbookValues["SUPABASE_PUBLISHABLE_KEY"]
if (Test-ExampleValue $publicKey) {
  $publicKey = $guestbookValues["SUPABASE_ANON_KEY"]
}
if (Test-ExampleValue $publicKey) {
  $publicKey = $guestbookValues["NEXT_PUBLIC_SUPABASE_ANON_KEY"]
}
if (Test-ExampleValue $publicKey) {
  $publicKey = Read-Host "Supabase Publishable 또는 Anon 공개 키를 입력하세요"
}

$serverKey = $currentValues["SUPABASE_SECRET_KEY"]
if (Test-ExampleValue $serverKey) {
  $serverKey = $currentValues["SUPABASE_SERVICE_ROLE_KEY"]
}

if (-not (Test-ServerKey $serverKey)) {
  $serverKey = ""
}

if (Test-ExampleValue $supabaseUrl) {
  throw "실제 Supabase 프로젝트 주소가 필요합니다."
}
if (Test-ExampleValue $publicKey) {
  throw "실제 Supabase 공개 키가 필요합니다."
}
$publicBaseUrl = $currentValues["PUBLIC_BASE_URL"]
if (Test-ExampleValue $publicBaseUrl) {
  $publicBaseUrl = "http://localhost:3000"
}

$port = $currentValues["PORT"]
if ([string]::IsNullOrWhiteSpace($port)) {
  $port = "3000"
}

$adminKey = $currentValues["ADMIN_API_KEY"]
if ((Test-ExampleValue $adminKey) -or $adminKey.Length -lt 12) {
  $adminKey = New-AdminKey
}

$environmentText = @"
# Supabase 프로젝트 주소
SUPABASE_URL=$supabaseUrl

# 방문 기록 함수 호출에 사용하는 공개 키
SUPABASE_PUBLISHABLE_KEY=$publicKey

# 로컬 테스트에서는 비워둡니다. Vercel 배포 전 실제 Secret 키를 입력합니다.
SUPABASE_SECRET_KEY=$serverKey

# 로컬 서비스 주소
PUBLIC_BASE_URL=$publicBaseUrl

# QR 생성 화면과 관리자 화면에서 입력할 관리자 키
ADMIN_API_KEY=$adminKey

PORT=$port
"@

$utf8WithoutBom = New-Object Text.UTF8Encoding($false)
[IO.File]::WriteAllText($targetEnvPath, $environmentText, $utf8WithoutBom)

Write-Host ""
Write-Host ".env 설정이 완료되었습니다." -ForegroundColor Green
Write-Host "관리자 키: $adminKey" -ForegroundColor Cyan
Write-Host "방문자 키: 필요 없음" -ForegroundColor Cyan
Write-Host "이제 npm run dev를 다시 실행하세요."
