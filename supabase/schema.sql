-- =========================================================
-- QR 안내 및 방문 통계 서비스 데이터베이스 구조
-- Supabase의 SQL Editor에서 전체 내용을 한 번 실행합니다.
-- =========================================================

-- UUID를 자동으로 만들기 위한 확장 기능을 활성화합니다.
create extension if not exists pgcrypto;

-- QR 코드의 연결 정보와 누적 방문 횟수를 저장합니다.
create table if not exists public.qr_codes (
  id uuid primary key default gen_random_uuid(),

  -- QR 추적 주소에 포함되는 짧은 고유 코드입니다.
  slug text not null unique
    check (slug ~ '^[A-Za-z0-9_-]{6,64}$'),

  -- 관리자가 목록에서 QR을 구분하기 위한 이름입니다.
  title text not null
    check (char_length(btrim(title)) between 1 and 100),

  -- url은 다른 사이트로 이동하고 text는 안내 문자를 보여줍니다.
  target_type text not null
    check (target_type in ('url', 'text')),

  -- 이동할 웹 주소 또는 화면에 표시할 안내 문자입니다.
  target_value text not null
    check (char_length(btrim(target_value)) between 1 and 2000),

  -- 관리자 화면에 표시할 누적 접속 횟수입니다.
  visit_count bigint not null default 0
    check (visit_count >= 0),

  -- 비활성화하면 기존 QR을 스캔해도 연결되지 않습니다.
  is_active boolean not null default true,

  created_at timestamptz not null default now(),
  last_visited_at timestamptz
);

-- 방문 시각을 건별로 저장합니다.
-- 개인정보를 최소화하기 위해 IP와 사용자 기기는 저장하지 않습니다.
create table if not exists public.qr_visits (
  id bigint generated always as identity primary key,
  qr_code_id uuid not null
    references public.qr_codes(id) on delete cascade,
  visited_at timestamptz not null default now()
);

-- 관리자 목록과 이후 날짜별 통계 조회가 빨라지도록 색인을 만듭니다.
create index if not exists qr_codes_created_at_idx
  on public.qr_codes (created_at desc);

create index if not exists qr_visits_qr_code_visited_at_idx
  on public.qr_visits (qr_code_id, visited_at desc);

-- 공개 사용자가 표를 직접 읽거나 수정하지 못하도록 행 수준 보안을 켭니다.
alter table public.qr_codes enable row level security;
alter table public.qr_visits enable row level security;

revoke all on table public.qr_codes from anon, authenticated;
revoke all on table public.qr_visits from anon, authenticated;

-- =========================================================
-- 로컬 학습용 정책
-- 서버 비밀 키 없이 공개 키만으로 QR 생성과 목록 조회를 시험할 수 있습니다.
-- 누구나 데이터 API를 직접 호출할 수 있으므로 실제 운영 전에는
-- production-lockdown.sql을 실행하여 반드시 제거해야 합니다.
-- =========================================================

drop policy if exists "local_test_qr_select" on public.qr_codes;
create policy "local_test_qr_select"
  on public.qr_codes
  for select
  to anon, authenticated
  using (true);

drop policy if exists "local_test_qr_insert" on public.qr_codes;
create policy "local_test_qr_insert"
  on public.qr_codes
  for insert
  to anon, authenticated
  with check (
    visit_count = 0
    and is_active = true
    and last_visited_at is null
  );

grant select, insert on table public.qr_codes to anon, authenticated;

-- QR 접속 기록과 누적 횟수 증가를 하나의 트랜잭션으로 처리합니다.
-- 동시에 여러 사람이 접속해도 UPDATE 연산으로 횟수가 빠지지 않게 합니다.
create or replace function public.record_qr_visit(p_slug text)
returns table (
  qr_id uuid,
  result_target_type text,
  result_target_value text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  selected_qr public.qr_codes%rowtype;
begin
  update public.qr_codes as q
  set
    visit_count = q.visit_count + 1,
    last_visited_at = now()
  where q.slug = p_slug
    and q.is_active = true
  returning q.* into selected_qr;

  -- 존재하지 않거나 비활성화된 QR이면 결과 없이 종료합니다.
  if not found then
    return;
  end if;

  insert into public.qr_visits (qr_code_id)
  values (selected_qr.id);

  return query
  select
    selected_qr.id,
    selected_qr.target_type,
    selected_qr.target_value;
end;
$$;

-- 공개 사용자는 표 대신 방문 기록 함수만 실행할 수 있습니다.
revoke all on function public.record_qr_visit(text) from public;
grant usage on schema public to anon, authenticated;
grant execute on function public.record_qr_visit(text) to anon, authenticated;

-- =========================================================
-- 구조 설정 완료
-- =========================================================
