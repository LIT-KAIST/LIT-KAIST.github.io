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
  image      text,
  images     text[],
  created_at timestamptz not null default now()
);
alter table public.comments add column if not exists image text;
alter table public.comments add column if not exists images text[];
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

-- 4) 댓글 등록: 암호 확인 후 삽입 (SECURITY DEFINER 로 RLS 우회) — p_images: 첨부 사진 배열(data URI, 선택)
drop function if exists public.add_comment(text, text, text, text);
drop function if exists public.add_comment(text, text, text, text, text);
create or replace function public.add_comment(p_news_id text, p_name text, p_body text, p_passcode text, p_images text[] default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_pass text; v_total bigint;
begin
  select value into v_pass from app_secrets where key = 'comment_passcode';
  if p_passcode is null or p_passcode <> v_pass then raise exception 'invalid_passcode'; end if;
  if length(coalesce(trim(p_name), '')) = 0
     or (length(coalesce(trim(p_body), '')) = 0 and coalesce(array_length(p_images, 1), 0) = 0) then raise exception 'empty'; end if;
  if coalesce(array_length(p_images, 1), 0) > 6 then raise exception 'too_many_images'; end if;
  if p_images is not null then
    select coalesce(sum(length(x)), 0) into v_total from unnest(p_images) as x;
    if v_total > 7000000 then raise exception 'image_too_large'; end if;
  end if;
  insert into comments (news_id, name, body, images)
    values (p_news_id, left(trim(p_name), 40), left(trim(p_body), 2000), p_images)
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.add_comment(text, text, text, text, text[]) to anon;

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

-- 6) 사진별 댓글 (라이트박스에서 각 사진에 다는 댓글). photo_key = '<댓글id>#<사진번호>'
create table if not exists public.photo_comments (
  id         bigint generated always as identity primary key,
  photo_key  text not null,
  name       text not null,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists photo_comments_key_idx on public.photo_comments (photo_key, created_at);
alter table public.photo_comments enable row level security;
drop policy if exists photo_comments_read on public.photo_comments;
create policy photo_comments_read on public.photo_comments for select to anon using (true);

create or replace function public.add_photo_comment(p_photo_key text, p_name text, p_body text, p_passcode text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_pass text;
begin
  select value into v_pass from app_secrets where key = 'comment_passcode';
  if v_pass is null or p_passcode is null or p_passcode <> v_pass then raise exception 'invalid_passcode'; end if;
  if length(coalesce(trim(p_name), '')) = 0 or length(coalesce(trim(p_body), '')) = 0
     or length(coalesce(trim(p_photo_key), '')) = 0 then raise exception 'empty'; end if;
  insert into photo_comments (photo_key, name, body)
    values (p_photo_key, left(trim(p_name), 40), left(trim(p_body), 2000))
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.add_photo_comment(text, text, text, text) to anon;

create or replace function public.delete_photo_comment(p_id bigint, p_passcode text)
returns void language plpgsql security definer set search_path = public as $$
declare v_pass text;
begin
  select value into v_pass from app_secrets where key = 'comment_passcode';
  if v_pass is null or p_passcode is null or p_passcode <> v_pass then raise exception 'invalid_passcode'; end if;
  delete from photo_comments where id = p_id;
end $$;
grant execute on function public.delete_photo_comment(bigint, text) to anon;

-- 7) 좋아요 (로그인 없이 · 브라우저별 고유 client_id 로 1회). target_key 예: 'news:n-...', 'album#...'
create table if not exists public.likes (
  target_key text not null,
  client_id  text not null,
  created_at timestamptz not null default now(),
  primary key (target_key, client_id)
);
alter table public.likes enable row level security;
drop policy if exists likes_read on public.likes;
create policy likes_read on public.likes for select to anon using (true);

create or replace function public.set_like(p_key text, p_client text, p_on boolean)
returns int language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  if length(coalesce(trim(p_key), '')) = 0 or length(coalesce(trim(p_client), '')) = 0 then raise exception 'bad_key'; end if;
  if p_on then insert into likes (target_key, client_id) values (p_key, p_client) on conflict do nothing;
  else delete from likes where target_key = p_key and client_id = p_client; end if;
  select count(*) into v_count from likes where target_key = p_key;
  return v_count;
end $$;
grant execute on function public.set_like(text, text, boolean) to anon;

-- 끝. (암호 변경: update app_secrets set value='새암호' where key='comment_passcode';)
