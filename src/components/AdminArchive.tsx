import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuthClient } from "../auth/supabase";
import { RecordingPlayer } from "./RecordingPlayer";
import { processRecording } from "../answer-store";
type Member = {
  email: string;
  user_id: string | null;
  status: string;
  role: string;
};
type Recording = {
  id: string;
  question: string;
  transcript: string | null;
  status: string;
  timestamp: string;
  owner_email: string;
  has_audio: boolean;
  archived_at: string | null;
  versions:
    | {
        id: string;
        created_at: string;
        status: string;
        attempts: number;
        current: boolean;
      }[]
    | null;
};
export type Archive = {
  members: Member[];
  recordings: Recording[];
  total: number;
  deliveries: {
    owner_id: string;
    week_key: string;
    status: string;
    created_at: string;
  }[];
};
export function AdminArchive({ client }: { client?: SupabaseClient } = {}) {
  const [ready, setReady] = useState(false),
    [factor, setFactor] = useState<string | null>(null),
    [qr, setQr] = useState(""),
    [setupKey, setSetupKey] = useState(""),
    [code, setCode] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [archive, setArchive] = useState<Archive | null>(null),
    [owner, setOwner] = useState(""),
    [page, setPage] = useState(0),
    [email, setEmail] = useState("");
  const supabase = client ?? requireSupabaseAuthClient();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } =
        await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      if (cancelled) return;
      setReady(data.currentLevel === "aal2");
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      setFactor(
        factors.data.totp.find((f) => f.status === "verified")?.id ?? null,
      );
    })().catch(() =>
      setError("Could not verify administrator sign-in. Please sign in again."),
    );
    return () => {
      cancelled = true;
    };
  }, [supabase]);
  async function run(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    const { data, error } = await supabase.rpc("admin_archive", {
      p_owner: owner || null,
      p_offset: page * 30,
      p_limit: 30,
    });
    if (error) {
      setArchive(null);
      throw Error(
        "Administrator access and two-step verification are required.",
      );
    }
    setArchive(data);
  }
  useEffect(() => {
    if (ready) void run(load);
  }, [ready, owner, page]);
  async function enroll() {
    // Only discard unfinished setups created by this app; keep verified factors.
    const factors = await supabase.auth.mfa.listFactors();
    if (factors.error) throw factors.error;
    for (const pending of factors.data.all) {
      if (pending.factor_type === "totp" && pending.status === "unverified" &&
          pending.friendly_name?.startsWith("Archive admin ")) {
        const result = await supabase.auth.mfa.unenroll({ factorId: pending.id });
        if (result.error) throw result.error;
      }
    }
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: `Archive admin ${new Date().toISOString().slice(0, 10)}`,
    });
    if (error) throw error;
    setFactor(data.id);
    setQr(data.totp.qr_code);
    setSetupKey(data.totp.secret);
  }
  async function verify() {
    if (!factor) return;
    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId: factor,
      code,
    });
    if (error)
      throw Error("That code was not accepted. Please try a fresh code.");
    setCode("");
    setQr("");
    setSetupKey("");
    setReady(true);
  }
  async function memberStatus(target: string, status: string) {
    const { error } = await supabase.rpc("admin_set_member", {
      p_email: target,
      p_status: status,
    });
    if (error)
      throw Error(
        "Could not update family access. Administrator grants must be managed separately.",
      );
    setEmail("");
    await load();
  }
  async function exportArchive() {
    const rows: Recording[] = [];
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await supabase.rpc("admin_archive", {
        p_owner: owner || null,
        p_offset: offset,
        p_limit: 100,
      });
      if (error) throw Error("Export interrupted. No file was downloaded.");
      rows.push(...data.recordings);
      if (data.recordings.length < 100) break;
    }
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { exportedAt: new Date().toISOString(), recordings: rows },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "remember-when-recordings.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="form-card card-body">
      <div className="flex flex-wrap justify-between gap-3 items-baseline">
        <h1 className="font-serif text-3xl">Administration</h1>
        <span className="text-sm text-ink-secondary">Administrator</span>
      </div>
      <p className="my-3 text-ink-secondary">
        Review recordings, help with processing, and manage approved family
        accounts.
      </p>
      {error && (
        <p role="alert" className="my-4 text-red-800">
          {error}
        </p>
      )}
      {!ready ? (
        <div className="admin-mfa">
          <h2 className="panel-title">Two-step verification</h2>
          <p className="my-3">
            Use an authenticator app to protect access to everyone’s recordings.
          </p>
          {!factor ? (
            <button
              className="btn-primary !w-auto"
              type="button"
              disabled={busy}
              onClick={() => run(enroll)}
            >
              Set up authenticator
            </button>
          ) : (
            <>
              {qr && (
                <>
                <p className="my-3">
                  In Google Authenticator, tap +, then Scan a QR code. After adding
                  Remember When, enter the six-digit code shown in the app below.
                </p>
                <img
                  className="my-4"
                  alt="Scan this code in your authenticator app"
                  width={200}
                  height={200}
                  src={qr}
                />
                <details className="my-4">
                  <summary>On the same phone, or unable to scan?</summary>
                  <p className="my-3">
                    In Google Authenticator, tap +, then Enter a setup key. Name it
                    Remember When, enter this key, and choose Time based. Keep
                    this key private.
                  </p>
                  <code className="break-all select-all">{setupKey}</code>
                </details>
                </>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(verify);
                }}
              >
                <label>
                  Six-digit code
                  <input
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                    required
                  />
                </label>
                <button
                  className="btn-primary !w-auto mt-3"
                  disabled={busy || code.length !== 6}
                >
                  Verify and open administration
                </button>
              </form>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="library-controls">
            <label>
              Family member
              <select
                value={owner}
                onChange={(e) => {
                  setOwner(e.target.value);
                  setPage(0);
                }}
              >
                <option value="">Everyone</option>
                {archive?.members
                  .filter((m) => m.user_id)
                  .map((m) => (
                    <option key={m.email} value={m.user_id!}>
                      {m.email}
                    </option>
                  ))}
              </select>
            </label>
            <button type="button" disabled={busy} onClick={() => run(load)}>
              Refresh
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(exportArchive)}
            >
              Export questions & transcripts
            </button>
          </div>
          {busy && (
            <p role="status" className="my-3">
              Working…
            </p>
          )}
          {!archive && !busy ? (
            <p>No archive loaded.</p>
          ) : (
            archive && (
              <>
                <p className="my-4 text-sm">
                  {archive.total} questions · page {page + 1}
                </p>
                {archive.recordings.map((r) => (
                  <article key={r.id} className="recording-entry">
                    <p className="text-sm text-ink-secondary">
                      {r.owner_email} · {new Date(r.timestamp).toLocaleString()}{" "}
                      · {r.archived_at ? "Archived" : r.status}
                    </p>
                    <h2 className="font-serif text-xl my-2">{r.question}</h2>
                    {r.transcript && (
                      <p className="whitespace-pre-wrap mb-3">{r.transcript}</p>
                    )}
                    {r.has_audio && (
                      <RecordingPlayer responseId={r.id} label={r.question} />
                    )}
                    {r.has_audio &&
                      !r.archived_at &&
                      r.status !== "answered" && (
                        <button
                          className="btn-secondary mt-3"
                          disabled={busy}
                          type="button"
                          onClick={() =>
                            run(async () => {
                              await processRecording(r.id);
                              await load();
                            })
                          }
                        >
                          Retry AI processing
                        </button>
                      )}
                    {r.versions && r.versions.length > 0 && (
                      <details className="mt-3">
                        <summary>{r.versions.length} saved versions</summary>
                        {r.versions.map((v) => (
                          <div key={v.id} className="py-3">
                            <p className="text-sm mb-2">
                              {new Date(v.created_at).toLocaleString()} ·{" "}
                              {v.status} · {v.attempts} attempts
                              {v.current ? " · Current" : ""}
                            </p>
                            <RecordingPlayer
                              responseId={r.id}
                              jobId={v.id}
                              label="Recording version"
                            />
                          </div>
                        ))}
                      </details>
                    )}
                  </article>
                ))}
                <div className="flex gap-4 my-5">
                  <button
                    type="button"
                    disabled={busy || page === 0}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={busy || (page + 1) * 30 >= archive.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
                <details className="admin-section">
                  <summary>Family access</summary>
                  <p className="my-3 text-sm text-ink-secondary">
                    Inviting approves an account for Google sign-in. It does not
                    send an email or grant administrator access.
                  </p>
                  <form
                    className="flex flex-wrap gap-3 items-end"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void run(() => memberStatus(email, "invited"));
                    }}
                  >
                    <label>
                      Google email
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </label>
                    <button className="btn-secondary" disabled={busy}>
                      Approve account
                    </button>
                  </form>
                  <ul className="my-4">
                    {archive.members.map((m) => (
                      <li
                        className="flex flex-wrap justify-between gap-3 py-3 border-b border-line"
                        key={m.email}
                      >
                        <span>
                          {m.email} · {m.status} · {m.role}
                        </span>
                        {m.role !== "admin" && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              if (
                                m.status === "revoked" ||
                                window.confirm(
                                  `Revoke archive access for ${m.email}? Previously issued playback links may work for up to five minutes.`,
                                )
                              )
                                void run(() =>
                                  memberStatus(
                                    m.email,
                                    m.status === "revoked"
                                      ? "invited"
                                      : "revoked",
                                  ),
                                );
                            }}
                          >
                            {m.status === "revoked"
                              ? "Restore access"
                              : "Revoke access"}
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                </details>
                <details className="admin-section">
                  <summary>Recent email attempts</summary>
                  <p className="my-3 text-sm">
                    Accepted means queued by SendGrid; delivery needs
                    verification in SendGrid.
                  </p>
                  {archive.deliveries.length ? (
                    archive.deliveries.map((d, i) => (
                      <p key={i} className="py-2">
                        {archive.members.find((m) => m.user_id === d.owner_id)
                          ?.email ?? "Family member"}{" "}
                        · {d.week_key} · {d.status}
                      </p>
                    ))
                  ) : (
                    <p>No attempts recorded.</p>
                  )}
                </details>
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
