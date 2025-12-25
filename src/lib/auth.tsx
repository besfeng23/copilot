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
  const [bootstrapCalled, setBootstrapCalled] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(getFirebaseAuth(), async (user) => {
      setUser(user);
      setLoading(false);
      
      if (user && !bootstrapCalled) {
        // Mocking the bootstrap API call for new users
        console.log("Initializing user access...");
        // In a real app, this would be an API call, e.g., await fetch('/api/bootstrap'); 
        setBootstrapCalled(true);
      }
    });

    return () => unsubscribe();
  }, [bootstrapCalled]);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
