import { createContext, useContext, useState } from 'react';
import { api } from '../api';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('edu_user')); }
    catch { return null; }
  });

  const login = async (email, pin) => {
    const u = await api('login', { pin }, email);
    setUser(u);
    localStorage.setItem('edu_user', JSON.stringify(u));
    return u;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('edu_user');
  };

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
