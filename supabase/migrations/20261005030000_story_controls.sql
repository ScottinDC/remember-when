-- Story preferences and question controls; apply after archive_readiness.
alter table public.threads add column if not exists story_options jsonb not null default '{}'::jsonb;
create or replace function public.save_story_options(p_thread_id text,p_options jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.archive_active() then raise exception 'Access denied' using errcode='42501'; end if;
 if p_options is null or jsonb_typeof(p_options)<>'object' or length(p_options::text)>2000 then raise exception 'Invalid story options'; end if;
 update public.threads set story_options=p_options,updated_at=now() where id=p_thread_id and owner_id=auth.uid();
 if not found then raise exception 'Interview unavailable' using errcode='42501'; end if;
end; $$;
create or replace function public.set_question_passed(p_response_id text,p_passed boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.archive_active() or p_passed is null then raise exception 'Access denied' using errcode='42501'; end if;
 update public.responses r set metadata=(coalesce(metadata,'{}'::jsonb)-'skippedAt') || case when p_passed then jsonb_build_object('skippedAt',now()) else '{}'::jsonb end
 where r.id=p_response_id and r.status='pending' and r.storage_object_name is null and r.archived_at is null
 and exists(select 1 from public.threads t where t.id=r.thread_id and t.owner_id=auth.uid());
 if not found then raise exception 'Question unavailable' using errcode='42501'; end if;
end; $$;
create or replace function public.reserve_question_generation(p_response_id text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if not private.archive_active() or not exists(select 1 from public.responses r join public.threads t on t.id=r.thread_id where r.id=p_response_id and t.owner_id=auth.uid() and r.status='pending' and r.storage_object_name is null and r.archived_at is null) then raise exception 'Question not available' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 if (select count(*) from private.ai_attempts where owner_id=auth.uid() and created_at>now()-interval '1 day')>=50 then raise exception 'Daily question limit reached'; end if;
 insert into private.ai_attempts(owner_id) values(auth.uid()); return true;
end; $$;
-- Called only by the authenticated worker. Compare-and-set preserves concurrent recordings and edits.
create or replace function public.replace_pending_question(p_response_id text,p_owner uuid,p_previous text,p_question text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if length(trim(p_question)) not between 1 and 500 or p_question is null then raise exception 'Invalid question'; end if;
 update public.responses r set question=p_question,metadata=(coalesce(metadata,'{}'::jsonb)-'skippedAt')||jsonb_build_object('previousQuestion',question,'regeneratedAt',now())
 where r.id=p_response_id and r.question=p_previous and r.status='pending' and r.storage_object_name is null and r.archived_at is null
 and exists(select 1 from public.threads t join public.access_grants g on g.user_id=t.owner_id where t.id=r.thread_id and t.owner_id=p_owner and g.status='active');
 return found;
end; $$;
revoke all on function public.save_story_options(text,jsonb),public.set_question_passed(text,boolean) from public,anon;
grant execute on function public.save_story_options(text,jsonb),public.set_question_passed(text,boolean) to authenticated;
revoke all on function public.replace_pending_question(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.replace_pending_question(text,uuid,text,text) to service_role;
