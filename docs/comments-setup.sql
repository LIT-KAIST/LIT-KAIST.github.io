-- ==========================================================================
-- LIT 뉴스 댓글 — Supabase 설정 SQL
-- Supabase 대시보드 → 왼쪽 "SQL Editor" → New query → 아래 전체 붙여넣고 Run.
-- 공용 암호는 아래 '715718' 부분에서 바꿀 수 있습니다(나중에도 변경 가능).
-- ==========================================================================

-- 1) 댓글 테이블
create table if not exists public.comments (
  id         bigint generated always as identity primary key,
  news_id    text not null,
  name       text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists comments_news_idx on public.comments (news_id, created_at);

-- 2) 읽기는 공개, 직접 쓰기/삭제는 차단(아래 함수로만 가능)
alter table public.comments enable row level security;
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select to anon using (true);

-- 3) 공용 암호 저장(비공개 테이블 — anon 접근 정책 없음 = 전면 차단)
create table if not exists public.app_secrets (key text primary key, value text not null);
alter table public.app_secrets enable row level security;
insert into public.app_secrets (key, value) values ('comment_passcode', '715718')
  on conflict (key) do update set value = excluded.value;

-- 4) 댓글 등록: 암호 확인 후 삽입 (SECURITY DEFINER 로 RLS 우회)
create or replace function public.add_comment(p_news_id text, p_name text, p_body text, p_passcode text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_pass text;
begin
  select value into v_pass from app_secrets where key = 'comment_passcode';
  if p_passcode is null or p_passcode <> v_pass then raise exception 'invalid_passcode'; end if;
  if length(coalesce(trim(p_name), '')) = 0 or length(coalesce(trim(p_body), '')) = 0 then raise exception 'empty'; end if;
  insert into comments (news_id, name, body)
    values (p_news_id, left(trim(p_name), 40), left(trim(p_body), 2000))
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.add_comment(text, text, text, text) to anon;

-- 5) 댓글 삭제: 암호 확인 후 삭제
create or replace function public.delete_comment(p_id bigint, p_passcode text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pass text;
begin
  select value into v_pass from app_secrets where key = 'comment_passcode';
  if p_passcode is null or p_passcode <> v_pass then raise exception 'invalid_passcode'; end if;
  delete from comments where id = p_id;
end $$;
grant execute on function public.delete_comment(bigint, text) to anon;

-- 끝. (암호 변경: update app_secrets set value='새암호' where key='comment_passcode';)
