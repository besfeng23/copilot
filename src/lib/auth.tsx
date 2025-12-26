"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  FIREBASE_CLIENT_ENV_KEYS,
  getFirebaseAuth,
  getMissingFirebaseClientEnv,
  isFirebaseClientConfigured,
} from './firebase';

type AuthContextType = {
  user: User | null;
  loading: boolean;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

function FirebaseClientMisconfigured(props: { missing: string[]; detail?: string }) {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-2xl rounded-lg border p-6">
        <h1 className="text-xl font-semibold">Application Error</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Firebase client configuration is missing or invalid. This app cannot load until it is fixed.
        </p>
        {props.detail ? (
          <p className="mt-2 text-sm text-muted-foreground">{props.detail}</p>
        ) : null}
        <div className="mt-4">
          <div className="text-sm font-medium">Missing environment keys</div>
          <ul className="mt-2 list-disc pl-6 text-sm">
            {props.missing.map((k) => (
              <li key={k}>
                <code>{k}</code>
              </li>
            ))}
          </ul>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          Set these exact keys in Vercel Project → Settings → Environment Variables, then redeploy.
        </p>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (!isFirebaseClientConfigured()) {
    return <FirebaseClientMisconfigured missing={[...getMissingFirebaseClientEnv()]} />;
  }

  if (!getFirebaseAuth()) {
    // Config keys exist but SDK init still failed (e.g. invalid values). Do not throw during render.
    return (
      <FirebaseClientMisconfigured
        missing={[...FIREBASE_CLIENT_ENV_KEYS]}
        detail="Firebase client failed to initialize. Verify these env vars are correct for your Firebase project."
      />
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
