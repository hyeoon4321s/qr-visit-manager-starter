-- =========================================================
-- 공개 테스트 모드용 Supabase 권한 설정
-- 주의: 누구나 QR 정보를 추가하고 모든 통계를 조회할 수 있습니다.
-- 실제 서비스에는 사용하지 마세요.
-- =========================================================

-- 두 테이블에서 행 수준 보안을 사용하되, 아래 공개 정책으로 접근을 허용합니다.
alter table public.qr_codes enable row level security;
alter table public.qr_visits enable row level security;

-- 이전에 만든 테스트 정책을 정리합니다.
drop policy if exists "local_test_qr_select" on public.qr_codes;
drop policy if exists "local_test_qr_insert" on public.qr_codes;
drop policy if exists "open_demo_qr_select" on public.qr_codes;
drop policy if exists "open_demo_qr_insert" on public.qr_codes;

-- 로그인하지 않은 사용자도 모든 QR과 누적 통계를 볼 수 있습니다.
create policy "open_demo_qr_select"
  on public.qr_codes
  for select
  to anon, authenticated
  using (true);

-- 로그인하지 않은 사용자도 새로운 QR 정보를 만들 수 있습니다.
create policy "open_demo_qr_insert"
  on public.qr_codes
  for insert
  to anon, authenticated
  with check (
    visit_count = 0
    and is_active = true
    and last_visited_at is null
  );

grant usage on schema public to anon, authenticated;
grant select, insert on table public.qr_codes to anon, authenticated;

-- QR 스캔 시 방문 횟수를 올리는 기존 함수를 누구나 실행할 수 있게 합니다.
grant execute on function public.record_qr_visit(text) to anon, authenticated;

-- =========================================================
-- 공개 테스트 모드 설정 완료
-- =========================================================
