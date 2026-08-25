import React from "react";
import {
  claimSupabaseAccess,
  getStoredAccessToken,
  loginWithGoogle,
  logoutIdentity,
  resolveSupabaseSession,
  type AuthConfig,
  type AuthConfigStatus,
  type AuthUser
} from "./identity";

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  authRequired: true;
  authConfigured: true;
  hasAllowedEmailsKey: true;
  configStatus: AuthConfigStatus;
  error: string | null;
  loginWithGoogle: () => void;
  logout: (options?: { error?: string | null }) => Promise<void>;
  retryBootstrap: () => Promise<void>;
  getAccessToken: () => string | null;
};

const AuthContext = React.createContext<AuthContextValue | null>(null);
const config: AuthConfig = { authRequired: true, authConfigured: true, hasAllowedEmailsKey: true };

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [configStatus, setConfigStatus] = React.useState<AuthConfigStatus>("loading");

  const bootstrap = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionUser = await resolveSupabaseSession();
      if (!sessionUser) {
        setUser(null);
        return;
      }
      await claimSupabaseAccess();
      setUser(sessionUser);
    } catch (bootstrapError) {
      setUser(null);
      setError(bootstrapError instanceof Error ? bootstrapError.message : "Could not verify sign-in.");
    } finally {
      setConfigStatus("loaded");
      setLoading(false);
    }
  }, []);

  React.useEffect(() => void bootstrap(), [bootstrap]);

  const logout = React.useCallback(async (options?: { error?: string | null }) => {
    await logoutIdentity();
    setUser(null);
    setError(options?.error ?? null);
  }, []);

  const value = React.useMemo<AuthContextValue>(() => ({
    user,
    loading,
    ...config,
    configStatus,
    error,
    loginWithGoogle,
    logout,
    retryBootstrap: bootstrap,
    getAccessToken: getStoredAccessToken
  }), [bootstrap, configStatus, error, loading, logout, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = React.useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
