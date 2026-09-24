import { useCallback, useEffect, useState } from "react";
import { getLocalSession, signOutLocalUser, type LocalUser } from "@/lib/localAuth";

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const [user, setUser] = useState<LocalUser | null>(() => getLocalSession());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getLocalSession());
    setLoading(false);
  }, []);

  useEffect(() => {
    if (loading || user || !redirectOnUnauthenticated || typeof window === "undefined") return;
    window.location.href = redirectPath ?? "/sign-in";
  }, [loading, redirectOnUnauthenticated, redirectPath, user]);

  const logout = useCallback(async () => {
    signOutLocalUser();
    setUser(null);
    if (typeof window !== "undefined") window.location.href = "/";
  }, []);

  return {
    user,
    loading,
    error: null,
    isAuthenticated: Boolean(user),
    refresh: async () => setUser(getLocalSession()),
    logout,
  };
}
