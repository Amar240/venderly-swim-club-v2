import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { postLogin } from "../lib/api";
import { authStore, type AuthSession } from "../lib/auth";
import { queryClient } from "../lib/queryClient";

interface AuthContextValue extends AuthSession {
  isAuthenticated: boolean;
  login: (pin: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [session, setSession] = useState<AuthSession>(authStore.getSession());

  useEffect(() => authStore.subscribe(setSession), []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...session,
      isAuthenticated: Boolean(session.token),
      login: async (pin: string) => {
        const response = await postLogin(pin);
        authStore.setSession(response.data.token, response.data.staff);
      },
      logout: () => {
        authStore.clear();
        queryClient.clear();
      }
    }),
    [session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};

export const useLogout = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  return () => {
    logout();
    navigate("/login", { replace: true });
  };
};
