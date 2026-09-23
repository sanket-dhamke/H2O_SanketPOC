import React, { createContext, useContext, useEffect, useState } from "react";
import { api, setToken, getToken, setOrgMode } from "./api";
import { applyRememberedMobile } from "./mobileNumber";

const AuthContext = createContext(null);

// Payment checkout runs outside React, but it still needs the signed-in
// person's saved mobile so Razorpay does not stop and ask for one.
let currentUser = null;
export function getCurrentUser() {
  return currentUser;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const token = await getToken();
        if (token) {
          const { user } = await api.me();
          setUser(await applyRememberedMobile(user));
        }
      } catch {
        await setToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    const { token, user } = await api.login(email, password);
    await setToken(token);
    // Remember tenant type so next launch shows the right branded login.
    if (user?.societyOrgType) await setOrgMode(user.societyOrgType);
    const full = await applyRememberedMobile(user);
    setUser(full);
    return full;
  };

  const logout = async () => {
    await setToken(null);
    setUser(null);
  };

  // Merge partial updates into the signed-in user (e.g. after changing prefs).
  const updateUser = (patch) => setUser((u) => (u ? { ...u, ...patch } : u));

  currentUser = user;

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
