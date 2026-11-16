import { createContext, useContext, useState } from 'react';
import { api } from '../api';

const Ctx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem('edu_user'));
      if (parsed && typeof parsed === 'object' && parsed.email && parsed.role) {
        return parsed;
      }
      return null;
    } catch {
      return null;
    }
  });

  const login = async (email, pin) => {
    const u = await api('login', { pin }, email);
    setUser(u);
    try {
      localStorage.setItem('edu_user', JSON.stringify(u));
    } catch {}
    return u;
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem('edu_user');
    } catch {}
  };

  return <Ctx.Provider value={{ user, login, logout }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
