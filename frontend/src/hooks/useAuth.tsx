import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { postDemoAdminSession, postLogin } from "../lib/api";
import { authStore, type AuthSession } from "../lib/auth";
import { queryClient } from "../lib/queryClient";
import { clearDemoCapability, getDemoCapability } from "../lib/demoSession";

interface AuthContextValue extends AuthSession {
  isAuthenticated: boolean;
  login: (pin: string) => Promise<void>;
  logout: () => void;
  isRestoring: boolean;
  restoreDemoSession: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
let restorePromise: Promise<boolean> | null = null;

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const [session, setSession] = useState<AuthSession>(authStore.getSession());
  const [isRestoring, setIsRestoring] = useState(false);

  useEffect(() => authStore.subscribe(setSession), []);

  const value = useMemo<AuthContextValue>(() => {
    const restoreDemoSession = async (): Promise<boolean> => {
      if (authStore.getToken()) return true;
      const capability = getDemoCapability();
      if (!capability) return false;

      if (!restorePromise) {
        setIsRestoring(true);
        restorePromise = (async () => {
          try {
            const response = await postDemoAdminSession(capability.demoClubId, capability.prospectId);
            queryClient.clear();
            authStore.setSession(response.token, response.staff, { demoTempPin: null });
            return true;
          } catch {
            clearDemoCapability();
            authStore.clear();
            return false;
          } finally {
            restorePromise = null;
            setIsRestoring(false);
          }
        })();
      }
      return restorePromise;
    };

    return {
      ...session,
      isAuthenticated: Boolean(session.token),
      isRestoring,
      restoreDemoSession,
      login: async (pin: string) => {
        const response = await postLogin(pin);
        authStore.setSession(response.data.token, response.data.staff);
      },
      logout: () => {
        clearDemoCapability();
        authStore.clear();
        queryClient.clear();
      }
    };
  }, [isRestoring, session]);

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
