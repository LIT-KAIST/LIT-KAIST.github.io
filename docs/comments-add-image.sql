-- ==========================================================================
-- LIT 뉴스 댓글 — "사진 첨부" 추가 마이그레이션
-- (이미 comments-setup.sql 을 실행한 프로젝트에서만 이 파일을 실행하세요)
-- Supabase → SQL Editor → New query → 아래 전체 붙여넣고 Run.
-- ==========================================================================

-- 1) 사진 컬럼 추가 (data URI 문자열 저장)
alter table public.comments add column if not exists image text;

-- 2) 등록 함수를 p_image(선택) 를 받도록 교체
drop function if exists public.add_comment(text, text, text, text);
create or replace function public.add_comment(p_news_id text, p_name text, p_body text, p_passcode text, p_image text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_pass text;
begin
  select value into v_pass from app_secrets where key = 'comment_passcode';
  if p_passcode is null or p_passcode <> v_pass then raise exception 'invalid_passcode'; end if;
  if length(coalesce(trim(p_name), '')) = 0
     or (length(coalesce(trim(p_body), '')) = 0 and coalesce(p_image, '') = '') then raise exception 'empty'; end if;
  if p_image is not null and length(p_image) > 1200000 then raise exception 'image_too_large'; end if;
  insert into comments (news_id, name, body, image)
    values (p_news_id, left(trim(p_name), 40), left(trim(p_body), 2000), nullif(p_image, ''))
    returning id into v_id;
  return v_id;
end $$;
grant execute on function public.add_comment(text, text, text, text, text) to anon;

-- 끝.
