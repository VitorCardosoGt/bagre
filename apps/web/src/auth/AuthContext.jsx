import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, auth as authStore, setUnauthorizedHandler } from '../api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!authStore.getToken()) {
      setUser(null);
      setReady(true);
      return;
    }
    try {
      const me = await api.me();
      setUser(me);
    } catch {
      authStore.clear();
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    refresh();
  }, [refresh]);

  const login = async (email, password) => {
    const res = await api.login(email, password);
    authStore.setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const signup = async ({ email, password, name }) => {
    const res = await api.signup({ email, password, name });
    authStore.setToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    authStore.clear();
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, ready, login, signup, logout, refresh }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  return useContext(AuthCtx);
}
