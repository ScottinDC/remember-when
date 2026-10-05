-- Recoverable two-phase deletion. Storage objects are removed only by the Edge worker.
create or replace function public.prepare_recording_delete(p_response_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.responses; owner uuid; token text; paths jsonb;
begin
 if not private.archive_active() then raise exception 'Access denied' using errcode='42501'; end if;
 select * into r from public.responses where id=p_response_id for update;
 select owner_id into owner from public.threads where id=r.thread_id;
 if r.id is null or owner is distinct from auth.uid() then raise exception 'Recording unavailable' using errcode='42501'; end if;
 select d.token into token from private.recording_deletions d where response_id=r.id;
 if token is null then token:=gen_random_uuid()::text; insert into private.recording_deletions values(r.id,token); end if;
 select coalesce(jsonb_agg(path),'[]'::jsonb) into paths from (
  select object_path path from public.recording_jobs where response_id=r.id
  union select r.storage_object_name where r.storage_object_name is not null
 ) p where split_part(path,'/',1)=owner::text and split_part(path,'/',2)=r.thread_id and split_part(path,'/',3)=r.id;
 update public.responses set status=case when status='processing' then 'failed' else status end,metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('deletePending',token) where id=r.id;
 -- Invalidate any outstanding worker before removing bytes.
 update public.recording_jobs set lease_id=null,lease_until=null,status=case when status='running' then 'failed' else status end where response_id=r.id;
 insert into private.archive_audit(actor_id,action,target) values(auth.uid(),'delete_recording_requested',r.id);
 return jsonb_build_object('token',token,'paths',paths);
end; $$;
create or replace function public.finish_recording_delete(p_response_id text,p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
declare r public.responses;
begin
 select * into r from public.responses where id=p_response_id for update;
 if r.id is null or p_token is null or not exists(select 1 from private.recording_deletions where response_id=r.id and token=p_token) then return false; end if;
 delete from public.recording_jobs where response_id=r.id;
 update public.responses set storage_object_name=null,mp3_url=null,gcs_object_name=null,transcript=null,status='pending',archived_at=null,
  metadata=coalesce(metadata,'{}'::jsonb)-array['recordingJobId','contentType','aiStatus','deletePending','skippedAt'],timestamp=now() where id=r.id;
 delete from private.recording_deletions where response_id=r.id;
 return true;
end; $$;
-- Additional guards also block privileged job/signing RPCs while deletion is pending.
create or replace function private.guard_recording_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.recording_deletions where response_id=old.id) and new.storage_object_name is not null and (
   new.storage_object_name is distinct from old.storage_object_name or new.status='processing'
 ) then raise exception 'Recording deletion is pending. Retry deletion first.'; end if;
 return new;
end; $$;
create trigger recording_deletion_guard before update on public.responses for each row execute function private.guard_recording_deletion();
revoke all on function public.prepare_recording_delete(text) from public,anon;
grant execute on function public.prepare_recording_delete(text) to authenticated;
revoke all on function public.finish_recording_delete(text,text) from public,anon,authenticated;
grant execute on function public.finish_recording_delete(text,text) to service_role;
