import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const owner = "00000000-0000-4000-8000-000000000001",
  other = "00000000-0000-4000-8000-000000000002",
  administrator = "00000000-0000-4000-8000-000000000003",
  unapproved = "00000000-0000-4000-8000-000000000004";
test("archive authorization and recording lifecycle in PostgreSQL", async (t) => {
  const db = new PGlite();
  await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage; create schema private;
 create table auth.users(id uuid primary key);
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 grant usage on schema auth,storage to anon,authenticated,service_role;
 grant execute on all functions in schema auth to anon,authenticated,service_role;
 create table public.access_grants(email text primary key,user_id uuid,status text default 'invited',role text default 'member',linked_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.threads(id text primary key,owner_id uuid,owner_email text,title text,created_at timestamptz default now(),updated_at timestamptz default now());
 create table public.responses(id text primary key,thread_id text references public.threads(id),parent_question_id text references public.responses(id),question text,transcript text,mp3_url text,gcs_object_name text,storage_object_name text,status text default 'pending',metadata jsonb,created_at timestamptz default now(),timestamp timestamptz default now());
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
 alter table public.threads enable row level security; alter table public.responses enable row level security; alter table storage.objects enable row level security;
 grant select,insert,update on public.threads,public.responses to authenticated;
 grant select,insert,delete on storage.objects to authenticated;
 create policy owner_threads on public.threads for all to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
 create policy owner_responses on public.responses for all to authenticated using(exists(select 1 from public.threads t where t.id=thread_id and owner_id=auth.uid())) with check(exists(select 1 from public.threads t where t.id=thread_id and owner_id=auth.uid()));
 create policy owner_objects on storage.objects for all to authenticated using(split_part(name,'/',1)=auth.uid()::text) with check(split_part(name,'/',1)=auth.uid()::text);
 insert into auth.users values('${owner}'),('${other}'),('${administrator}'),('${unapproved}');
 insert into public.access_grants(email,user_id,status,role) values('owner@example.com','${owner}','active','member'),('other@example.com','${other}','active','member'),('admin@example.com','${administrator}','active','admin');
 `);
  await db.query(
    "insert into public.threads(id,owner_id,title) values('legacy-thread',$1,'Legacy')",
    [owner],
  );
  await db.query(
    "insert into public.responses(id,thread_id,storage_object_name,transcript,status,timestamp) values('legacy-response','legacy-thread',$1,'Original transcript','answered','2026-01-01')",
    [owner + "/legacy-thread/legacy-response/source-old.mp4"],
  );
  for (const file of [
    "20261005010000_digest_deliveries.sql",
    "20261005020000_archive_readiness.sql",
    "20261005030000_story_controls.sql",
    "20261005040000_recording_deletion.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await t.test(
    "migration backfills legacy audio history and transcript without changing the source path",
    async () => {
      const job = (
        await db.query<{
          object_path: string;
          transcript: string;
          content_type: string;
        }>(
          "select object_path,transcript,content_type from public.recording_jobs where response_id='legacy-response'",
        )
      ).rows[0];
      assert.equal(
        job.object_path,
        owner + "/legacy-thread/legacy-response/source-old.mp4",
      );
      assert.equal(job.transcript, "Original transcript");
      assert.equal(job.content_type, "audio/mp4");
      assert.ok(
        (
          await db.query<{ metadata: { recordingJobId: string } }>(
            "select metadata from public.responses where id='legacy-response'",
          )
        ).rows[0].metadata.recordingJobId,
      );
      await db.exec(
        "delete from public.recording_jobs where response_id='legacy-response'; delete from public.responses where id='legacy-response'; delete from public.threads where id='legacy-thread';",
      );
    },
  );
  async function asUser<T>(
    id: string | null,
    sql: string,
    args: unknown[] = [],
    aal = "aal1",
  ) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims',$1,false)", [
      JSON.stringify({
        sub: id,
        aal,
        email:
          (id === owner ? "owner" : id === administrator ? "admin" : "other") +
          "@example.com",
      }),
    ]);
    await db.exec("set role " + (id ? "authenticated" : "anon"));
    try {
      return (await db.query<T>(sql, args)).rows;
    } finally {
      await db.exec("reset role");
    }
  }
  async function asService<T>(sql: string, args: unknown[] = []) {
    await db.exec("set role service_role");
    try {
      return (await db.query<T>(sql, args)).rows;
    } finally {
      await db.exec("reset role");
    }
  }
  let tid = "",
    rid = "",
    jid = "",
    path = "",
    lease = "";
  await t.test(
    "only approved members initialize; repeated initialization yields exactly five questions",
    async () => {
      await assert.rejects(() =>
        asUser(null, "select public.ensure_interview()"),
      );
      await assert.rejects(
        () => asUser(unapproved, "select public.ensure_interview()"),
        /Approved family/,
      );
      tid = (
        await asUser<{ id: string }>(
          owner,
          "select public.ensure_interview() id",
        )
      )[0].id;
      assert.equal(
        (
          await asUser<{ id: string }>(
            owner,
            "select public.ensure_interview() id",
          )
        )[0].id,
        tid,
      );
      const rows = await asUser<{ id: string }>(
        owner,
        "select id from public.responses where thread_id=$1 order by metadata->>'sequenceOrder'",
        [tid],
      );
      assert.equal(rows.length, 5);
      rid = rows[0].id;
      assert.equal(
        (
          await asUser(
            other,
            "select id from public.responses where thread_id=$1",
            [tid],
          )
        ).length,
        0,
      );
    },
  );
  await t.test(
    "initialization is transactional when initial question insertion fails",
    async () => {
      await db.exec(
        `create function public.test_fail_insert() returns trigger language plpgsql as $$begin if new.thread_id in (select id from public.threads where owner_id='${other}') then raise exception 'simulated outage'; end if; return new;end;$$; create trigger test_failure before insert on public.responses for each row execute function public.test_fail_insert();`,
      );
      await assert.rejects(
        () => asUser(other, "select public.ensure_interview()"),
        /simulated outage/,
      );
      assert.equal(
        (
          await db.query("select id from public.threads where owner_id=$1", [
            other,
          ])
        ).rows.length,
        0,
      );
      await db.exec(
        "drop trigger test_failure on public.responses; drop function public.test_fail_insert();",
      );
    },
  );
  await t.test(
    "storage rejects unapproved uploads and direct playback/deletion even for owners",
    async () => {
      await assert.rejects(
        () =>
          asUser(
            unapproved,
            "insert into storage.objects(bucket_id,name) values('interview-audio',$1)",
            [unapproved + "/anything"],
          ),
        /row-level security/,
      );
      path = `${owner}/${tid}/${rid}/source-one.webm`;
      await asUser(
        owner,
        "insert into storage.objects(bucket_id,name,metadata) values('interview-audio',$1,'{\"size\":100}')",
        [path],
      );
      assert.equal(
        (await asUser(owner, "select name from storage.objects")).length,
        0,
      );
      await asUser(owner, "delete from storage.objects");
      assert.equal(
        (await db.query("select name from storage.objects")).rows.length,
        1,
      );
    },
  );
  await t.test(
    "registration verifies ownership, object existence and commits audio before AI",
    async () => {
      await assert.rejects(
        () =>
          asUser(other, "select public.register_recording($1,$2,$3,$4)", [
            rid,
            path,
            "audio/webm",
            100,
          ]),
        /Recording not available/,
      );
      await assert.rejects(
        () =>
          asUser(owner, "select public.register_recording($1,$2,$3,$4)", [
            rid,
            path + "missing",
            "audio/webm",
            100,
          ]),
        /Uploaded recording not found/,
      );
      jid = (
        await asUser<{ id: string }>(
          owner,
          "select public.register_recording($1,$2,$3,$4) id",
          [rid, path, "audio/webm", 100],
        )
      )[0].id;
      assert.equal(
        (
          await asUser<{ id: string }>(
            owner,
            "select public.register_recording($1,$2,$3,$4) id",
            [rid, path, "audio/webm", 100],
          )
        )[0].id,
        jid,
      );
      const r = (
        await asUser<{ storage_object_name: string; status: string }>(
          owner,
          "select storage_object_name,status from public.responses where id=$1",
          [rid],
        )
      )[0];
      assert.equal(r.storage_object_name, path);
      assert.equal(r.status, "processing");
    },
  );
  await t.test(
    "admin requires a database role and aal2; member JWT metadata cannot grant admin access",
    async () => {
      for (const id of [owner, other, unapproved])
        await assert.rejects(
          () => asUser(id, "select public.admin_archive()", [], "aal2"),
          /Administrator access/,
        );
      await assert.rejects(
        () => asUser(administrator, "select public.admin_archive()"),
        /two-step verification/,
      );
      const result = (
        await asUser<{ data: { total: number } }>(
          administrator,
          "select public.admin_archive() data",
          [],
          "aal2",
        )
      )[0];
      assert.equal(result.data.total, 5);
      await assert.rejects(
        () => asUser(owner, "update public.access_grants set role='admin'"),
        /permission denied/,
      );
    },
  );
  await t.test(
    "playback denies other users and rechecks active access; admin can read with MFA",
    async () => {
      assert.equal(
        (
          await asUser<{ data: { path: string } }>(
            owner,
            "select public.authorize_audio($1) data",
            [rid],
          )
        )[0].data.path,
        path,
      );
      await assert.rejects(
        () => asUser(other, "select public.authorize_audio($1)", [rid]),
        /Recording not available/,
      );
      assert.equal(
        (
          await asUser<{ data: { path: string } }>(
            administrator,
            "select public.authorize_audio($1) data",
            [rid],
            "aal2",
          )
        )[0].data.path,
        path,
      );
      await db.query(
        "update public.access_grants set status='revoked' where user_id=$1",
        [owner],
      );
      await assert.rejects(
        () => asUser(owner, "select public.authorize_audio($1)", [rid]),
        /Recording not available/,
      );
      await assert.rejects(
        () =>
          asUser(owner, "select public.set_recording_archived($1,true)", [rid]),
        /Access denied/,
      );
      await assert.rejects(
        () =>
          asUser(
            owner,
            "insert into storage.objects(bucket_id,name) values('interview-audio',$1)",
            [owner + "/new"],
          ),
        /row-level security/,
      );
      await db.query(
        "update public.access_grants set status='active' where user_id=$1",
        [owner],
      );
    },
  );
  await t.test(
    "forged response audio paths cannot trick the privileged signer into crossing owners",
    async () => {
      const forgery = "forged-response";
      await asUser(
        owner,
        "insert into public.responses(id,thread_id,storage_object_name) values($1,$2,$3)",
        [forgery, tid, other + "/other-thread/other-response/source-a.webm"],
      );
      await assert.rejects(
        () => asUser(owner, "select public.authorize_audio($1)", [forgery]),
        /Recording not found/,
      );
      await db.query("delete from public.responses where id=$1", [forgery]);
    },
  );
  await t.test(
    "a tampered legacy version cannot make the AI worker download another owner's audio",
    async () => {
      const foreignPath = other + "/foreign/foreign-response/source-a.webm";
      await db.query(
        "insert into public.recording_jobs(response_id,owner_id,object_path,content_type) values($1,$2,$3,'audio/webm')",
        [rid, owner, foreignPath],
      );
      await asUser(
        owner,
        "update public.responses set storage_object_name=$1 where id=$2",
        [foreignPath, rid],
      );
      await assert.rejects(
        () => asUser(owner, "select public.claim_recording_job($1)", [rid]),
        /Invalid recording path/,
      );
      await asUser(
        owner,
        "update public.responses set storage_object_name=$1 where id=$2",
        [path, rid],
      );
      await db.query("delete from public.recording_jobs where object_path=$1", [
        foreignPath,
      ]);
    },
  );
  await t.test(
    "unassigned legacy interviews cannot expose audio through null-owner checks",
    async () => {
      await db.exec(
        `insert into public.threads(id,owner_id,owner_email) values('unassigned',null,'legacy@example.com'); insert into public.responses(id,thread_id,storage_object_name) values('unassigned-response','unassigned','${owner}/unassigned/unassigned-response/source-a.webm');`,
      );
      await assert.rejects(
        () =>
          asUser(owner, "select public.authorize_audio($1)", [
            "unassigned-response",
          ]),
        /Recording not available/,
      );
      await assert.rejects(
        () =>
          asUser(
            administrator,
            "select public.authorize_audio($1)",
            ["unassigned-response"],
            "aal2",
          ),
        /Recording not found/,
      );
    },
  );
  await t.test(
    "lease blocks duplicate processing; failure preserves audio and partial transcript",
    async () => {
      const job = (
        await asUser<{ data: { lease: string } }>(
          owner,
          "select public.claim_recording_job($1) data",
          [rid],
        )
      )[0].data;
      lease = job.lease;
      assert.equal(
        (
          await asUser<{ data: null }>(
            owner,
            "select public.claim_recording_job($1) data",
            [rid],
          )
        )[0].data,
        null,
      );
      await assert.rejects(
        () =>
          asUser(owner, "select public.finish_recording_job($1,$2,$3,$4,$5)", [
            jid,
            lease,
            "forged",
            "forged?",
            null,
          ]),
        /permission denied/,
      );
      await asService("select public.finish_recording_job($1,$2,$3,$4,$5)", [
        jid,
        lease,
        "My story",
        null,
        "followup_failed",
      ]);
      const row = (
        await asUser<{
          status: string;
          transcript: string;
          storage_object_name: string;
        }>(
          owner,
          "select status,transcript,storage_object_name from public.responses where id=$1",
          [rid],
        )
      )[0];
      assert.equal(row.status, "failed");
      assert.equal(row.transcript, "My story");
      assert.equal(row.storage_object_name, path);
    },
  );
  await t.test(
    "retry reuses transcript; stale completion is rejected; follow-up created once",
    async () => {
      const job = (
        await asUser<{ data: { lease: string; transcript: string } }>(
          owner,
          "select public.claim_recording_job($1) data",
          [rid],
        )
      )[0].data;
      assert.equal(job.transcript, "My story");
      assert.equal(
        (
          await asService<{ ok: boolean }>(
            "select public.finish_recording_job($1,$2,$3,$4,$5) ok",
            [jid, lease, "stale", "Wrong?", null],
          )
        )[0].ok,
        false,
      );
      lease = job.lease;
      await asService("select public.finish_recording_job($1,$2,$3,$4,$5)", [
        jid,
        lease,
        "My story",
        "What happened next?",
        null,
      ]);
      await asService("select public.finish_recording_job($1,$2,$3,$4,$5)", [
        jid,
        lease,
        "My story",
        "Duplicate?",
        null,
      ]);
      assert.equal(
        (
          await db.query(
            "select id from public.responses where parent_question_id=$1",
            [rid],
          )
        ).rows.length,
        1,
      );
    },
  );
  await t.test(
    "replacement preserves previous versions and ignores late results for the old audio",
    async () => {
      const newPath = path.replace("one", "two");
      await asUser(
        owner,
        "insert into storage.objects(bucket_id,name,metadata) values('interview-audio',$1,'{\"size\":100}')",
        [newPath],
      );
      const nextId = (
        await asUser<{ id: string }>(
          owner,
          "select public.register_recording($1,$2,$3,$4) id",
          [rid, newPath, "audio/webm", 100],
        )
      )[0].id;
      assert.notEqual(nextId, jid);
      assert.equal(
        (
          await asUser(
            owner,
            "select id from public.recording_jobs where response_id=$1",
            [rid],
          )
        ).length,
        2,
      );
      assert.equal(
        (
          await asUser<{ data: { path: string } }>(
            owner,
            "select public.authorize_audio($1,$2) data",
            [rid, jid],
          )
        )[0].data.path,
        path,
      );
      path = newPath;
      jid = nextId;
    },
  );
  await t.test(
    "archive is reversible and stops job starts without deleting audio",
    async () => {
      await asUser(owner, "select public.set_recording_archived($1,true)", [
        rid,
      ]);
      await assert.rejects(
        () => asUser(owner, "select public.claim_recording_job($1)", [rid]),
        /Recording not available/,
      );
      await asUser(owner, "select public.set_recording_archived($1,false)", [
        rid,
      ]);
      assert.equal(
        (await db.query("select id from storage.objects")).rows.length,
        2,
      );
    },
  );
  await t.test(
    "administrator manages member grants but cannot promote roles or revoke an admin",
    async () => {
      await assert.rejects(
        () =>
          asUser(
            owner,
            "select public.admin_set_member($1,$2)",
            ["invited@example.com", "invited"],
            "aal2",
          ),
        /Administrator access/,
      );
      await asUser(
        administrator,
        "select public.admin_set_member($1,$2)",
        ["invited@example.com", "invited"],
        "aal2",
      );
      assert.equal(
        (
          await db.query<{ role: string }>(
            "select role from public.access_grants where email=$1",
            ["invited@example.com"],
          )
        ).rows[0].role,
        "member",
      );
      await assert.rejects(
        () =>
          asUser(
            administrator,
            "select public.admin_set_member($1,$2)",
            ["admin@example.com", "revoked"],
            "aal2",
          ),
        /Administrator grants/,
      );
      assert.ok(
        (await db.query("select id from private.archive_audit")).rows.length >
          0,
      );
    },
  );

  await t.test(
    "story choices and pass controls stay owner-scoped, and regeneration never replaces saved answers",
    async () => {
      await assert.rejects(
        () =>
          asUser(other, "select public.save_story_options($1,$2)", [
            tid,
            { mode: "tribute" },
          ]),
        /Interview unavailable/,
      );
      await asUser(owner, "select public.save_story_options($1,$2)", [
        tid,
        { mode: "heritage", length: "short" },
      ]);
      const unanswered = (
        await asUser<{ id: string; question: string }>(
          owner,
          "select id,question from public.responses where thread_id=$1 and status='pending' and storage_object_name is null limit 1",
          [tid],
        )
      )[0];
      await asUser(owner, "select public.set_question_passed($1,true)", [
        unanswered.id,
      ]);
      assert.ok(
        (
          await asUser<{ metadata: { skippedAt: string } }>(
            owner,
            "select metadata from public.responses where id=$1",
            [unanswered.id],
          )
        )[0].metadata.skippedAt,
      );
      await assert.rejects(
        () =>
          asUser(other, "select public.set_question_passed($1,false)", [
            unanswered.id,
          ]),
        /Question unavailable/,
      );
      await asUser(owner, "select public.reserve_question_generation($1)", [
        unanswered.id,
      ]);
      assert.equal(
        (
          await asService<{ ok: boolean }>(
            "select public.replace_pending_question($1,$2,$3,$4) ok",
            [
              unanswered.id,
              owner,
              unanswered.question,
              "What family tradition do you remember?",
            ],
          )
        )[0].ok,
        true,
      );
      assert.equal(
        (
          await asService<{ ok: boolean }>(
            "select public.replace_pending_question($1,$2,$3,$4) ok",
            [unanswered.id, owner, unanswered.question, "Stale question?"],
          )
        )[0].ok,
        false,
      );
      await assert.rejects(
        () =>
          asUser(owner, "select public.reserve_question_generation($1)", [rid]),
        /Question not available/,
      );
    },
  );
  await t.test(
    "the AI daily budget is enforced across question and recording attempts",
    async () => {
      const id = (
        await db.query<{ id: string }>(
          "select id from public.responses where thread_id=$1 and status='pending' and storage_object_name is null limit 1",
          [tid],
        )
      ).rows[0].id;
      await db.query(
        "insert into private.ai_attempts(owner_id) select $1::uuid from generate_series(1,50)",
        [owner],
      );
      await assert.rejects(
        () =>
          asUser(owner, "select public.reserve_question_generation($1)", [id]),
        /Daily question limit/,
      );
    },
  );
  await t.test(
    "permanent deletion locks audio and AI until all object removal is confirmed, then permits a fresh take",
    async () => {
      await assert.rejects(
        () =>
          asUser(other, "select public.prepare_recording_delete($1)", [rid]),
        /Recording unavailable/,
      );
      const deletion = (
        await asUser<{ d: { token: string; paths: string[] } }>(
          owner,
          "select public.prepare_recording_delete($1) d",
          [rid],
        )
      )[0].d;
      assert.ok(deletion.paths.length >= 2);
      assert.equal(
        (
          await asUser<{ d: { token: string } }>(
            owner,
            "select public.prepare_recording_delete($1) d",
            [rid],
          )
        )[0].d.token,
        deletion.token,
      );
      await asUser(
        owner,
        "update public.responses set metadata=metadata-'deletePending' where id=$1",
        [rid],
      );
      await assert.rejects(
        () => asUser(owner, "select public.authorize_audio($1)", [rid]),
        /Recording not available/,
      );
      await assert.rejects(
        () => asUser(owner, "select public.claim_recording_job($1)", [rid]),
        /Recording not available/,
      );
      await assert.rejects(
        () =>
          asUser(
            owner,
            "select public.register_recording($1,$2,'audio/webm',100)",
            [rid, path],
          ),
        /Recording not available/,
      );
      await assert.rejects(
        () =>
          asUser(owner, "select public.finish_recording_delete($1,$2)", [
            rid,
            deletion.token,
          ]),
        /permission denied/,
      );
      assert.equal(
        (
          await asService<{ ok: boolean }>(
            "select public.finish_recording_delete($1,'wrong') ok",
            [rid],
          )
        )[0].ok,
        false,
      );
      assert.equal(
        (
          await asService<{ ok: boolean }>(
            "select public.finish_recording_delete($1,$2) ok",
            [rid, deletion.token],
          )
        )[0].ok,
        true,
      );
      assert.equal(
        (
          await db.query(
            "select id from public.recording_jobs where response_id=$1",
            [rid],
          )
        ).rows.length,
        0,
      );
      const answer = (
        await db.query<{
          status: string;
          transcript: null;
          storage_object_name: null;
        }>(
          "select status,transcript,storage_object_name from public.responses where id=$1",
          [rid],
        )
      ).rows[0];
      assert.equal(answer.status, "pending");
      assert.equal(answer.transcript, null);
      assert.equal(answer.storage_object_name, null);
    },
  );
  await db.close();
});
