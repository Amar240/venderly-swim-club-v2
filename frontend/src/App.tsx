import { QueryClientProvider } from "@tanstack/react-query";
import { LazyMotion, domAnimation } from "framer-motion";
import { lazy, Suspense, type ReactNode, useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { TopBar } from "./components/TopBar";
import { Card, CardContent } from "./components/ui/card";
import { Skeleton } from "./components/ui/skeleton";
import { AuthProvider, useAuth } from "./hooks/useAuth";
import { UiPrefsProvider } from "./hooks/useUiPrefs";
import { queryClient } from "./lib/queryClient";
import { getDemoCapability } from "./lib/demoSession";
import { AdminActivity } from "./pages/AdminActivity";
import { AdminStaff } from "./pages/AdminStaff";
import { AdminWebhooks } from "./pages/AdminWebhooks";
import { Dashboard } from "./pages/Dashboard";
import { Demo } from "./pages/Demo";
import { DemoDashboard } from "./pages/DemoDashboard";
import { Landing } from "./pages/Landing";
import { Login } from "./pages/Login";
import { Members } from "./pages/Members";

const Reports = lazy(() => import("./pages/Reports").then((module) => ({ default: module.Reports })));

const ProtectedRoute = ({ children, adminOnly = false }: { children: ReactNode; adminOnly?: boolean }) => {
  const { isAuthenticated, restoreDemoSession, staff } = useAuth();
  const capabilityRef = useRef(getDemoCapability());
  const [attemptedRestore, setAttemptedRestore] = useState(false);
  const [restoreFailed, setRestoreFailed] = useState(false);

  useEffect(() => {
    if (isAuthenticated || attemptedRestore || !capabilityRef.current) return;
    setAttemptedRestore(true);
    void restoreDemoSession().then((restored) => setRestoreFailed(!restored));
  }, [attemptedRestore, isAuthenticated, restoreDemoSession]);

  if (!isAuthenticated) {
    if (capabilityRef.current && !restoreFailed) {
      return <div className="min-h-screen animate-pulse bg-brand-background" aria-label="Restoring demo session" />;
    }
    if (restoreFailed) {
      const clubId = capabilityRef.current?.demoClubId;
      return <Navigate to={clubId ? `/demo/${clubId}/dashboard` : "/demo"} replace />;
    }
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

const AdminRootRedirect = () => {
  const { staff } = useAuth();
  return <Navigate to={staff?.demoAdmin ? "/admin/activity" : "/admin/staff"} replace />;
};

const DemoRestrictedRoute = ({ children, fallback }: { children: ReactNode; fallback: string }) => {
  const { staff } = useAuth();
  return staff?.demoAdmin ? <Navigate to={fallback} replace /> : <>{children}</>;
};

const ReportsFallback = () => (
  <main className="mx-auto max-w-6xl p-4 md:p-6">
    <Card className="border-brand-border bg-white shadow-sm">
      <CardContent className="space-y-6 p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-11 w-48" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
        <Skeleton className="h-80 w-full" />
      </CardContent>
    </Card>
  </main>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UiPrefsProvider>
          <LazyMotion features={domAnimation} strict>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/demo" element={<Demo />} />
                <Route path="/demo/:clubId/dashboard" element={<DemoDashboard />} />
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
                  <Route
                    path="/reports"
                    element={
                      <ProtectedRoute adminOnly>
                        <Suspense fallback={<ReportsFallback />}>
                          <Reports />
                        </Suspense>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/admin" element={<AdminRootRedirect />} />
                  <Route
                    path="/admin/staff"
                    element={
                      <ProtectedRoute adminOnly>
                        <DemoRestrictedRoute fallback="/admin/activity"><AdminStaff /></DemoRestrictedRoute>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/activity"
                    element={
                      <ProtectedRoute adminOnly>
                        <AdminActivity />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin/webhooks"
                    element={
                      <ProtectedRoute adminOnly>
                        <DemoRestrictedRoute fallback="/admin/activity"><AdminWebhooks /></DemoRestrictedRoute>
                      </ProtectedRoute>
                    }
                  />
                </Route>
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
