import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { SettingsMenu } from "./SettingsMenu";
import { useConnection } from "../hooks/useConnection";
import { useAuth } from "../hooks/useAuth";
import { cn } from "../lib/utils";
import { DemoSessionBanner } from "./DemoSessionBanner";

const LOGO_URL = "https://assets.cdn.filesafe.space/Bjt6c984XN3YKY5porzI/media/6980bb3566e7ca30baf9488c.png";

export const TopBar = () => {
  const [now, setNow] = useState(() => new Date());
  const connection = useConnection();
  const { staff } = useAuth();
  const location = useLocation();
  const isAdmin = staff?.role === "ADMIN";
  const isDemoAdmin = Boolean(staff?.demoAdmin);
  const isAdminRoute = location.pathname.startsWith("/admin");

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <header className="sticky top-0 z-40 border-b border-brand-border bg-brand-surface/95 backdrop-blur">
      <DemoSessionBanner />
      <div className="flex h-14 items-center justify-between px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-4">
          {isDemoAdmin ? (
            <div className="flex shrink-0 items-center gap-2" aria-label="Splash Manager">
              <span className="h-7 w-7 rotate-45 rounded-lg bg-brand-primary shadow-sm" aria-hidden="true" />
              <span className="hidden text-lg font-semibold text-brand-navy sm:block">Splash Manager</span>
            </div>
          ) : (
            <>
              <img src={LOGO_URL} alt="Wedgewood Swim Club" className="h-9 w-auto shrink-0" />
              <div className="hidden text-lg font-semibold text-brand-navy sm:block">Wedgewood Pool</div>
            </>
          )}
          <nav className="flex h-14 items-center gap-1">
            <TopNavLink to="/dashboard">Dashboard</TopNavLink>
            <TopNavLink to="/members">Members</TopNavLink>
            {isAdmin && <TopNavLink to="/reports">Reports</TopNavLink>}
            {isAdmin && <TopNavLink to="/admin">Admin</TopNavLink>}
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-brand-border px-3 text-sm font-medium text-slate-600 md:flex">
            <Clock className="h-4 w-4" />
            <span>{time}</span>
          </div>
          <ConnectionIndicator status={connection.status} />
          <SettingsMenu />
        </div>
      </div>
      {isAdminRoute && (
        <nav className="flex h-11 items-center gap-1 overflow-x-auto border-t border-brand-border px-4 md:px-6">
          {!isDemoAdmin && <SubNavLink to="/admin/staff">Staff</SubNavLink>}
          <SubNavLink to="/admin/activity">Activity</SubNavLink>
          {!isDemoAdmin && <SubNavLink to="/admin/webhooks">Webhooks</SubNavLink>}
        </nav>
      )}
    </header>
  );
};

const TopNavLink = ({ to, children }: { to: string; children: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      cn(
        "flex h-14 items-center border-b-2 border-transparent px-3 text-sm font-semibold text-slate-500 transition-colors duration-150 hover:text-brand-navy",
        isActive && "border-brand-primary text-brand-primary"
      )
    }
  >
    {children}
  </NavLink>
);

const SubNavLink = ({ to, children }: { to: string; children: string }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      cn(
        "rounded-md px-3 py-2 text-sm font-semibold text-slate-500 transition-colors duration-150 hover:bg-brand-background hover:text-brand-navy",
        isActive && "bg-brand-background text-brand-primary"
      )
    }
  >
    {children}
  </NavLink>
);
