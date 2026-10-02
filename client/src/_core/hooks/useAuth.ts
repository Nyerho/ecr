import { useCallback, useEffect, useState } from "react";
import {
  observeFirebaseUser,
  observeUserProfile,
  signOutFirebaseUser,
  type FirebaseProfile,
  type UserRole,
} from "@/lib/firebase";

export type AuthUser = FirebaseProfile & { id: string; role: UserRole };
type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

function profileToUser(profile: FirebaseProfile): AuthUser {
  return { ...profile, id: profile.uid, name: profile.name || profile.email };
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let stopProfile: (() => void) | undefined;
    let active = true;
    try {
      const stopAuth = observeFirebaseUser(firebaseUser => {
        stopProfile?.();
        if (!firebaseUser) {
          if (active) {
            setUser(null);
            setLoading(false);
          }
          return;
        }
        setLoading(true);
        stopProfile = observeUserProfile(firebaseUser.uid, profile => {
          if (!active) return;
          setUser(
            profile
              ? profileToUser(profile)
              : {
                  uid: firebaseUser.uid,
                  id: firebaseUser.uid,
                  name:
                    firebaseUser.displayName ||
                    firebaseUser.email ||
                    "ECR user",
                  email: firebaseUser.email || "",
                  role: "citizen",
                  photoURL: firebaseUser.photoURL,
                }
          );
          setLoading(false);
        });
      });
      return () => {
        active = false;
        stopProfile?.();
        stopAuth();
      };
    } catch (authError) {
      setError(
        authError instanceof Error
          ? authError
          : new Error("Secure authentication is temporarily unavailable.")
      );
      setLoading(false);
      return () => undefined;
    }
  }, []);

  useEffect(() => {
    if (
      loading ||
      user ||
      !redirectOnUnauthenticated ||
      typeof window === "undefined"
    )
      return;
    window.location.href = redirectPath ?? "/sign-in";
  }, [loading, redirectOnUnauthenticated, redirectPath, user]);

  const logout = useCallback(async () => {
    await signOutFirebaseUser();
    setUser(null);
    if (typeof window !== "undefined") window.location.href = "/";
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: Boolean(user),
    refresh: async () => undefined,
    logout,
  };
}
