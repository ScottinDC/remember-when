-- Existing-project migration. Export/reconcile the production baseline before applying.
-- No credentials, account invitations or administrator assignments are embedded here.
create schema if not exists private;
create or replace function private.archive_active() returns boolean
language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.access_grants where user_id=auth.uid() and status='active');
$$;
create or replace function private.archive_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select coalesce(auth.jwt()->>'aal'='aal2',false) and exists(
 select 1 from public.access_grants where user_id=auth.uid() and status='active' and role='admin');
$$;
revoke all on function private.archive_active(), private.archive_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.archive_active(), private.archive_admin() to authenticated;

alter table public.responses add column if not exists archived_at timestamptz;
create table private.recording_deletions(response_id text primary key references public.responses(id), token text not null);
revoke all on private.recording_deletions from public,anon,authenticated;
create table public.recording_jobs (
 id uuid primary key default gen_random_uuid(), response_id text not null references public.responses(id),
 owner_id uuid not null references auth.users(id), object_path text not null unique,
 content_type text not null, status text not null default 'queued' check(status in ('queued','running','failed','complete')),
 transcript text, error_code text, attempts integer not null default 0,
 lease_id uuid, lease_until timestamptz, created_at timestamptz not null default now(), completed_at timestamptz
);
-- Preserve existing Supabase recordings in version history without copying/deleting objects.
insert into public.recording_jobs(response_id,owner_id,object_path,content_type,status,transcript,created_at)
 select r.id,t.owner_id,r.storage_object_name,coalesce(r.metadata->>'contentType',case when r.storage_object_name like '%.mp4' then 'audio/mp4' when r.storage_object_name like '%.mp3' then 'audio/mpeg' when r.storage_object_name like '%.ogg' then 'audio/ogg' else 'audio/webm' end),
 case when r.status='answered' then 'complete' else 'failed' end,r.transcript,coalesce(r.timestamp,r.created_at,now())
 from public.responses r join public.threads t on t.id=r.thread_id
 where r.storage_object_name is not null and t.owner_id is not null
 and split_part(r.storage_object_name,'/',1)=t.owner_id::text
 and split_part(r.storage_object_name,'/',2)=r.thread_id and split_part(r.storage_object_name,'/',3)=r.id
 on conflict(object_path) do nothing;
update public.responses r set metadata=coalesce(r.metadata,'{}'::jsonb)||jsonb_build_object('recordingJobId',j.id,'contentType',j.content_type)
 from public.recording_jobs j where j.response_id=r.id and j.object_path=r.storage_object_name;
create index recording_jobs_response on public.recording_jobs(response_id,created_at desc);
alter table public.recording_jobs enable row level security;
revoke all on public.recording_jobs from anon,authenticated;
grant select on public.recording_jobs to authenticated;
grant all on public.recording_jobs to service_role;
create policy recording_job_owner_read on public.recording_jobs for select to authenticated
 using(private.archive_active() and owner_id=auth.uid());
create table private.archive_audit (
 id bigint generated always as identity primary key, actor_id uuid, action text not null,
 target text, created_at timestamptz not null default now()
);
create table private.ai_attempts (owner_id uuid not null, created_at timestamptz not null default now());
create index ai_attempts_owner_time on private.ai_attempts(owner_id,created_at);
revoke all on private.archive_audit,private.ai_attempts from public,anon,authenticated;

-- Restrictive guards apply in addition to existing ownership policies.
create policy archive_active_threads on public.threads as restrictive for all to authenticated
 using(private.archive_active()) with check(private.archive_active());
create policy archive_active_responses on public.responses as restrictive for all to authenticated
 using(private.archive_active()) with check(private.archive_active());
create policy archive_active_storage on storage.objects as restrictive for all to authenticated
 using(bucket_id <> 'interview-audio' or private.archive_active())
 with check(bucket_id <> 'interview-audio' or private.archive_active());
-- Playback goes through archive-audio, which checks authorization on each link refresh.
create policy archive_audio_reads_via_server on storage.objects as restrictive for select to authenticated
 using(bucket_id <> 'interview-audio');
-- Preserve original audio/version history; deletion is a reversible archive operation.
create policy archive_audio_no_client_delete on storage.objects as restrictive for delete to authenticated
 using(bucket_id <> 'interview-audio');

create or replace function public.ensure_interview() returns text
language plpgsql security definer set search_path = '' as $$
declare tid text; q text; seq integer:=0;
begin
 if not private.archive_active() then raise exception 'Approved family access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select id into tid from public.threads where owner_id=auth.uid() order by created_at,id limit 1;
 if tid is null then
  tid:=gen_random_uuid()::text;
  insert into public.threads(id,owner_id,owner_email,title,created_at,updated_at)
   values(tid,auth.uid(),auth.jwt()->>'email','My Life Story',now(),now());
 end if;
 foreach q in array array[
 'When you look back over your life, what are the moments that made you who you are?',
 'What are your earliest memories of growing up in North Dakota and your family?',
 'What do you remember most about your parents, and what did they teach you?',
 'How did your years at Kodak shape your life, both professionally and personally?',
 'If your children, grandchildren, and great-grandchild could only know a handful of lessons from your life, what would you want them to remember?'] loop
  seq:=seq+1;
  if not exists(select 1 from public.responses where thread_id=tid and parent_question_id is null
    and (metadata->>'sequenceOrder'=seq::text or question=q)) then
   insert into public.responses(id,thread_id,question,status,metadata,created_at,timestamp)
    values(gen_random_uuid()::text,tid,q,'pending',jsonb_build_object('sequenceOrder',seq),now(),now());
  end if;
 end loop;
 return tid;
end; $$;

create or replace function public.register_recording(p_response_id text,p_object_path text,p_content_type text,p_bytes bigint)
returns uuid language plpgsql security definer set search_path = '' as $$
declare r public.responses; owner uuid; jid uuid; obj storage.objects;
begin
 if not private.archive_active() then raise exception 'Approved family access required' using errcode='42501'; end if;
 select * into r from public.responses where id=p_response_id for update;
 select owner_id into owner from public.threads where id=r.thread_id;
 if owner is distinct from auth.uid() or r.id is null or r.archived_at is not null or exists(select 1 from private.recording_deletions where response_id=r.id) then raise exception 'Recording not available' using errcode='42501'; end if;
 if p_content_type is null or p_bytes is null or p_content_type not in ('audio/webm','audio/mp4','audio/mpeg','audio/ogg') or p_bytes<1 or p_bytes>25000000 then raise exception 'Unsupported recording'; end if;
 if p_object_path is null or split_part(p_object_path,'/',1)<>auth.uid()::text or split_part(p_object_path,'/',2)<>r.thread_id or split_part(p_object_path,'/',3)<>r.id or split_part(p_object_path,'/',4) not like 'source-%' or array_length(string_to_array(p_object_path,'/'),1)<>4 then raise exception 'Invalid recording path' using errcode='42501'; end if;
 select * into obj from storage.objects where bucket_id='interview-audio' and name=p_object_path;
 if obj.id is null or coalesce((obj.metadata->>'size')::bigint,p_bytes) <> p_bytes then raise exception 'Uploaded recording not found'; end if;
 select id into jid from public.recording_jobs where object_path=p_object_path and response_id=r.id;
 if jid is not null then return jid; end if;
 -- Retain the previous recording and transcript before replacing its current pointer.
 if r.storage_object_name is not null then
  insert into public.recording_jobs(response_id,owner_id,object_path,content_type,status,transcript,created_at)
   values(r.id,owner,r.storage_object_name,coalesce(r.metadata->>'contentType','audio/webm'),'complete',r.transcript,coalesce(r.timestamp,r.created_at,now()))
   on conflict(object_path) do nothing;
 end if;
 insert into public.recording_jobs(response_id,owner_id,object_path,content_type) values(r.id,owner,p_object_path,p_content_type) returning id into jid;
 update public.responses set storage_object_name=p_object_path,mp3_url=null,gcs_object_name=null,transcript=null,
  status='processing',timestamp=now(),metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('recordingJobId',jid,'contentType',p_content_type,'aiStatus','queued') where id=r.id;
 update public.threads set updated_at=now() where id=r.thread_id;
 return jid;
end; $$;

create or replace function public.claim_recording_job(p_response_id text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.responses; j public.recording_jobs; owner uuid; lease uuid;
begin
 select * into r from public.responses where id=p_response_id for update;
 select owner_id into owner from public.threads where id=r.thread_id;
 if not private.archive_active() or (owner is distinct from auth.uid() and not private.archive_admin()) or r.id is null or r.archived_at is not null or exists(select 1 from private.recording_deletions where response_id=r.id) then raise exception 'Recording not available' using errcode='42501'; end if;
 select * into j from public.recording_jobs where response_id=r.id and object_path=r.storage_object_name for update;
 if j.id is null then raise exception 'No saved processing job'; end if;
 if owner is null or j.owner_id is distinct from owner or split_part(j.object_path,'/',1)<>owner::text or split_part(j.object_path,'/',2)<>r.thread_id or split_part(j.object_path,'/',3)<>r.id then raise exception 'Invalid recording path' using errcode='42501'; end if;
 if j.status='complete' or (j.status='running' and j.lease_until>now()) then return null; end if;
 perform pg_advisory_xact_lock(hashtextextended(owner::text,1));
 if j.attempts>=5 or (select count(*) from private.ai_attempts where owner_id=owner and created_at>now()-interval '1 day')>=50 then raise exception 'Processing limit reached. Contact the archive administrator.'; end if;
 lease:=gen_random_uuid();
 update public.recording_jobs set status='running',attempts=attempts+1,lease_id=lease,lease_until=now()+interval '3 minutes',error_code=null where id=j.id;
 insert into private.ai_attempts(owner_id) values(owner);
 update public.responses set status='processing',metadata=metadata||jsonb_build_object('aiStatus','running') where id=r.id;
 insert into private.archive_audit(actor_id,action,target) values(auth.uid(),'process_recording',r.id);
 return jsonb_build_object('id',j.id,'lease',lease,'responseId',r.id,'threadId',r.thread_id,'question',r.question,'objectPath',j.object_path,'contentType',j.content_type,'transcript',j.transcript);
end; $$;

-- Only the service-role worker can finish a leased job. A stale/replaced worker cannot change the current answer.
create or replace function public.finish_recording_job(p_job_id uuid,p_lease uuid,p_transcript text,p_followup text,p_error text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.recording_jobs; r public.responses; seq integer;
begin
 select * into j from public.recording_jobs where id=p_job_id;
 select * into r from public.responses where id=j.response_id for update;
 select * into j from public.recording_jobs where id=p_job_id for update;
 if j.id is null or j.lease_id is distinct from p_lease or j.status<>'running' then return false; end if;
 update public.recording_jobs set status=case when p_error is null then 'complete' else 'failed' end,
  transcript=coalesce(p_transcript,transcript),error_code=p_error,lease_until=null,completed_at=case when p_error is null then now() else null end where id=j.id;
 if r.storage_object_name is distinct from j.object_path or r.archived_at is not null or exists(select 1 from private.recording_deletions where response_id=r.id) then return false; end if;
 update public.responses set transcript=coalesce(p_transcript,transcript), status=case when p_error is null then 'answered' else 'failed' end,
  metadata=metadata||jsonb_build_object('aiStatus',case when p_error is null then 'complete' else 'failed' end) where id=r.id;
 if p_error is null and nullif(trim(p_followup),'') is not null then
  perform pg_advisory_xact_lock(hashtextextended(r.thread_id,2));
  if not exists(select 1 from public.responses where parent_question_id=r.id) then
   select coalesce(max(case when metadata->>'sequenceOrder' ~ '^[0-9]{1,8}$' then (metadata->>'sequenceOrder')::integer end),5)+1 into seq from public.responses where thread_id=r.thread_id;
   insert into public.responses(id,thread_id,parent_question_id,question,status,metadata,created_at,timestamp)
    values(gen_random_uuid()::text,r.thread_id,r.id,left(p_followup,1000),'pending',jsonb_build_object('sequenceOrder',seq,'guidedByAnswerId',r.id),now(),now());
  end if;
 end if;
 update public.threads set updated_at=now() where id=r.thread_id;
 return true;
end; $$;

create or replace function public.authorize_audio(p_response_id text,p_job_id uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.responses; owner uuid; path text; mime text;
begin
 select * into r from public.responses where id=p_response_id;
 select owner_id into owner from public.threads where id=r.thread_id;
 if r.id is null or exists(select 1 from private.recording_deletions where response_id=r.id) or not private.archive_active() or (owner is distinct from auth.uid() and not private.archive_admin()) then raise exception 'Recording not available' using errcode='42501'; end if;
 if p_job_id is null then path:=r.storage_object_name; mime:=r.metadata->>'contentType';
 else select object_path,content_type into path,mime from public.recording_jobs where id=p_job_id and response_id=r.id; end if;
 if owner is null or path is null or split_part(path,'/',1)<>owner::text or split_part(path,'/',2)<>r.thread_id or split_part(path,'/',3)<>r.id then raise exception 'Recording not found' using errcode='42501'; end if;
 if owner<>auth.uid() then insert into private.archive_audit(actor_id,action,target) values(auth.uid(),'play_recording',r.id); end if;
 return jsonb_build_object('path',path,'contentType',mime);
end; $$;

create or replace function public.set_recording_archived(p_response_id text,p_archived boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if not private.archive_active() then raise exception 'Access denied' using errcode='42501'; end if;
 update public.responses r set archived_at=case when p_archived then now() else null end
  where r.id=p_response_id and exists(select 1 from public.threads t where t.id=r.thread_id and t.owner_id=auth.uid());
 if not found then raise exception 'Recording not available' using errcode='42501'; end if;
 insert into private.archive_audit(actor_id,action,target) values(auth.uid(),case when p_archived then 'archive' else 'restore' end,p_response_id);
end; $$;

create or replace function public.admin_archive(p_owner uuid default null,p_offset integer default 0,p_limit integer default 30)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
 if not private.archive_admin() then raise exception 'Administrator access and two-step verification required' using errcode='42501'; end if;
 select jsonb_build_object('recordings',coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb)) into result from (
  select r.id,r.thread_id,r.question,r.transcript,r.status,r.timestamp,r.archived_at,r.metadata,
   t.owner_id,t.owner_email,t.title,(r.storage_object_name is not null) as has_audio,
   (select jsonb_agg(jsonb_build_object('id',j.id,'created_at',j.created_at,'status',j.status,'error_code',j.error_code,'attempts',j.attempts,'current',j.object_path=r.storage_object_name) order by j.created_at desc)
    from public.recording_jobs j where j.response_id=r.id) as versions
  from public.responses r join public.threads t on t.id=r.thread_id
  where (p_owner is null or t.owner_id=p_owner)
  order by r.timestamp desc,r.id limit least(greatest(p_limit,1),100) offset greatest(p_offset,0)
 ) page;
 result:=result||jsonb_build_object('total',(select count(*) from public.responses r join public.threads t on t.id=r.thread_id where p_owner is null or t.owner_id=p_owner),
 'members',(select coalesce(jsonb_agg(jsonb_build_object('email',email,'user_id',user_id,'status',status,'role',role) order by email),'[]') from public.access_grants),
 'deliveries',(select coalesce(jsonb_agg(to_jsonb(d)),'[]') from (select owner_id,week_key,status,created_at,accepted_at from public.digest_deliveries order by created_at desc limit 20)d));
 insert into private.archive_audit(actor_id,action,target) values(auth.uid(),'view_admin_archive',coalesce(p_owner::text,'all'));
 return result;
end; $$;

-- Members can be invited/revoked. Promoting administrators is deliberately not exposed here.
create or replace function public.admin_set_member(p_email text,p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare e text:=lower(trim(p_email));
begin
 if not private.archive_admin() then raise exception 'Administrator access and two-step verification required' using errcode='42501'; end if;
 if p_status not in ('invited','revoked') or e !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Invalid member request'; end if;
 if exists(select 1 from public.access_grants where email=e and role='admin') then raise exception 'Administrator grants must be managed separately'; end if;
 insert into public.access_grants(email,status) values(e,p_status)
 on conflict(email) do update set status=excluded.status,updated_at=now();
 insert into private.archive_audit(actor_id,action,target) values(auth.uid(),'member_'||p_status,e);
end; $$;

create or replace function public.reserve_question_generation(p_response_id text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
 if not private.archive_active() or not exists(select 1 from public.responses r join public.threads t on t.id=r.thread_id where r.id=p_response_id and t.owner_id=auth.uid() and r.status='pending' and r.parent_question_id is not null and r.archived_at is null) then raise exception 'Question not available' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,1));
 if (select count(*) from private.ai_attempts where owner_id=auth.uid() and created_at>now()-interval '1 day')>=50 then raise exception 'Daily question limit reached'; end if;
 insert into private.ai_attempts(owner_id) values(auth.uid()); return true;
end; $$;

revoke all on function public.ensure_interview(),public.register_recording(text,text,text,bigint),public.claim_recording_job(text),public.authorize_audio(text,uuid),public.set_recording_archived(text,boolean),public.admin_archive(uuid,integer,integer),public.admin_set_member(text,text),public.reserve_question_generation(text) from public,anon;
grant execute on function public.ensure_interview(),public.register_recording(text,text,text,bigint),public.claim_recording_job(text),public.authorize_audio(text,uuid),public.set_recording_archived(text,boolean),public.admin_archive(uuid,integer,integer),public.admin_set_member(text,text),public.reserve_question_generation(text) to authenticated;
revoke all on function public.finish_recording_job(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_recording_job(uuid,uuid,text,text,text) to service_role;
