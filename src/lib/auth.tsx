"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from './firebase';
import { getMissingFirebaseClientEnvKeys, REQUIRED_FIREBASE_CLIENT_ENV_KEYS } from './firebase/client';

type AuthContextType = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const missingClientEnv = getMissingFirebaseClientEnvKeys();
  const [pathname, setPathname] = useState<string | null>(null);

  useEffect(() => {
    setPathname(window.location.pathname);

    const auth = getFirebaseAuth();
    if (!auth) {
      // No-op: Firebase client is not configured. Don't throw; render a stable error UI instead.
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (missingClientEnv.length) {
    // Allow the self-diagnostic page to render even if Firebase client env is missing.
    if (pathname === "/env-check") {
      return (
        <AuthContext.Provider value={{ user: null, loading: false }}>
          {children}
        </AuthContext.Provider>
      );
    }

    return (
      <div className="min-h-screen bg-background text-foreground p-6">
        <div className="mx-auto max-w-2xl space-y-4">
          <h1 className="text-xl font-semibold">Application Error</h1>
          <p className="text-sm text-muted-foreground">
            Firebase client configuration is missing. Set these exact keys in Vercel Project → Settings → Environment Variables, then redeploy.
          </p>
          <div className="rounded-md border p-4">
            <div className="text-sm font-medium mb-2">Missing client env vars</div>
            <ul className="list-disc pl-5 text-sm">
              {missingClientEnv.map((k) => (
                <li key={k}>
                  <code>{k}</code>
                </li>
              ))}
            </ul>
            <div className="mt-3 text-xs text-muted-foreground">
              Required set: {REQUIRED_FIREBASE_CLIENT_ENV_KEYS.map((k) => k).join(", ")}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
