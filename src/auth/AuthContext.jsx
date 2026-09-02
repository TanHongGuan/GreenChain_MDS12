import { createContext, useContext, useEffect, useMemo, useState } from "react";

import * as authApi from "../api/authApi.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  async function refreshUser() {
    try {
      const currentUser = await authApi.getCurrentUser();
      setUser(currentUser);
      return currentUser;
    } catch (error) {
      if (error.status === 401) {
        setUser(null);
        return null;
      }
      setUser(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    refreshUser().catch(() => {
      setUser(null);
      setIsLoading(false);
    });
  }, []);

  async function login(email, password) {
    const authenticatedUser = await authApi.login(email, password);
    setUser(authenticatedUser);
    return authenticatedUser;
  }

  async function logout() {
    try {
      await authApi.logout();
    } finally {
      setUser(null);
    }
  }

  const value = useMemo(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshUser,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
