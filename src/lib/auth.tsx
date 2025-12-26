"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { getFirebaseAuth } from './firebase';

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
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    try {
      const auth = getFirebaseAuth();
      const unsubscribe = onAuthStateChanged(auth, async (user) => {
        setUser(user);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (err) {
      console.error("Firebase initialization error:", err);
      setError(err instanceof Error ? err : new Error("Unknown Firebase error"));
      setLoading(false);
    }
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <div className="max-w-md space-y-4">
          <h2 className="text-xl font-bold text-red-600">Application Error</h2>
          <p className="text-sm text-gray-600">{error.message}</p>
          <p className="text-xs text-gray-500">
            Please check your environment variables (NEXT_PUBLIC_FIREBASE_*)
          </p>
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
