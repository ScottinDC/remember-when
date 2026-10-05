import React from "react";
import { AdminArchive } from "./components/AdminArchive";
import { Loader2 } from "lucide-react";
import { fetchInterview } from "./api";
import { useAuth } from "./auth/AuthProvider";
import { AuthStatus } from "./auth/LoginScreen";
import { AppHeader } from "./components/AppHeader";
import { InterviewForm } from "./components/InterviewForm";
import { toTitleCase } from "./lib/titleCase";
import { countByStatus } from "./lib/interview";
import type { InterviewState } from "./types";

export function App() {
  const { user } = useAuth();
  const [admin, setAdmin] = React.useState(user?.role === "admin");
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <nav className="app-navigation" aria-label="Archive areas">
        {user?.role === "admin" && (
          <>
            <button
              type="button"
              disabled={busy}
              aria-pressed={admin}
              onClick={() => setAdmin(true)}
            >
              Family archive
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={!admin}
              onClick={() => setAdmin(false)}
            >
              My interview
            </button>
          </>
        )}
      </nav>
      {admin && user?.role === "admin" ? (
        <main className="mx-auto max-w-shell px-5 pb-10">
          <AuthStatus />
          <AdminArchive />
        </main>
      ) : (
        <InterviewApp busy={busy} onBusyChange={setBusy} />
      )}
    </>
  );
}
function InterviewApp({
  onBusyChange,
  busy,
}: {
  onBusyChange: (busy: boolean) => void;
  busy: boolean;
}) {
  const { logout } = useAuth();
  const [state, setState] = React.useState<InterviewState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetchInterview()
      .then(setState)
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Could not load the interview.",
        );
      })
      .finally(() => setLoading(false));
  }, [logout]);

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center">
        <div className="flex items-center gap-3 font-mono text-sm text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin text-navy-light" />
          Opening the interview
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="grid min-h-screen place-items-center px-4">
        <div className="flex max-w-md flex-col items-center gap-4 text-center">
          <p className="text-base text-[#9b2c2c]">
            {error ?? "Could not load the interview."}
          </p>
          <div className="flex w-full flex-col gap-3">
            <button
              className="btn-primary"
              onClick={() => {
                setLoading(true);
                setError(null);
                fetchInterview()
                  .then(setState)
                  .catch((err: unknown) => {
                    setError(
                      err instanceof Error
                        ? err.message
                        : "Could not load the interview.",
                    );
                  })
                  .finally(() => setLoading(false));
              }}
              type="button"
            >
              Try again
            </button>
            <button
              className="btn-secondary"
              onClick={() => void logout({ error: null })}
              type="button"
            >
              Sign out and try again
            </button>
          </div>
        </div>
      </main>
    );
  }

  const nodes = state.nodes;

  return (
    <main className="min-h-screen px-5 py-8 md:px-6">
      <div className="mx-auto flex w-full max-w-shell flex-col gap-5">
        <AuthStatus disabled={busy} />
        <AppHeader
          answeredCount={countByStatus(nodes, "answered")}
          pendingCount={countByStatus(nodes, "pending")}
          processingCount={countByStatus(nodes, "processing")}
          title={toTitleCase(state.thread.title)}
        />

        {error ? (
          <div className="rounded border border-[#f0caca] bg-[#fff8f8] px-4 py-3 text-base text-[#9b2c2c]">
            {error}
          </div>
        ) : null}

        <InterviewForm
          onBusyChange={onBusyChange}
          onStateChange={setState}
          setError={setError}
          state={state}
        />
      </div>
    </main>
  );
}
