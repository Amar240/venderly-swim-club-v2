import { QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domAnimation } from "framer-motion";
import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { TopBar } from "./components/TopBar";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { UiPrefsProvider } from "./hooks/useUiPrefs";
import { queryClient } from "./lib/queryClient";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { Members } from "./pages/Members";
import { Reports } from "./pages/Reports";

const ProtectedRoute = ({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) => {
  const { isAuthenticated, staff } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (adminOnly && staff?.role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

const RootRedirect = () => {
  const { isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? "/dashboard" : "/login"} replace />;
};

const StaffLayout = () => (
  <div className="min-h-screen bg-brand-background">
    <TopBar />
    <Outlet />
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UiPrefsProvider>
          <LazyMotion features={domAnimation} strict>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                  element={
                    <ProtectedRoute>
                      <StaffLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/members" element={<Members />} />
                  <Route path="/members/:id" element={<Members />} />
                </Route>
                <Route
                  path="/reports"
                  element={
                    <ProtectedRoute adminOnly>
                      <Reports />
                    </ProtectedRoute>
                  }
                />
                <Route path="*" element={<RootRedirect />} />
              </Routes>
            </BrowserRouter>
            <Toaster richColors position="top-center" />
          </LazyMotion>
        </UiPrefsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
