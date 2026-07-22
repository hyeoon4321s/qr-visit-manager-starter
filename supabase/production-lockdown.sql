-- =========================================================
-- 운영 배포 전 로컬 테스트 정책 제거
-- Supabase SQL Editor에서 전체 내용을 실행합니다.
-- =========================================================

drop policy if exists "local_test_qr_select" on public.qr_codes;
drop policy if exists "local_test_qr_insert" on public.qr_codes;

revoke select, insert on table public.qr_codes from anon, authenticated;

-- 이후 Vercel에는 반드시 실제 SUPABASE_SECRET_KEY를 설정해야 합니다.
