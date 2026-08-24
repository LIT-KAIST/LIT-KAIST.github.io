-- ==========================================================================
-- LIT 뉴스 댓글 — "사진 여러 장" 지원 마이그레이션
-- 이 파일 하나만 실행하면 됩니다 (이전에 comments-setup / comments-add-image 를
-- 실행했든 안 했든 안전하게 동작 — 모두 대체합니다).
-- Supabase → SQL Editor → New query → 아래 전체 붙여넣고 Run.
-- ==========================================================================

-- 1) 사진 여러 장 컬럼 (data URI 배열)
alter table public.comments add column if not exists images text[];

-- 2) 등록 함수: 사진 배열(p_images, 선택)을 받도록 교체
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

-- 3) 사진별 댓글 (라이트박스에서 각 사진에 다는 댓글). photo_key = '<댓글id>#<사진번호>'
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

-- 끝. (뉴스 댓글 읽기 정책·삭제 함수·암호는 그대로 유지됩니다.)
