import { Clock, LogOut } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { ConnectionIndicator } from "./ConnectionIndicator";
import { useConnection } from "../hooks/useConnection";
import { useLogout } from "../hooks/useAuth";
import { cn } from "../lib/utils";

const LOGO_URL = "https://assets.cdn.filesafe.space/Bjt6c984XN3YKY5porzI/media/6980bb3566e7ca30baf9488c.png";

export const TopBar = () => {
  const [now, setNow] = useState(() => new Date());
  const connection = useConnection();
  const logout = useLogout();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-brand-border bg-white/95 px-4 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <img src={LOGO_URL} alt="Wedgewood Swim Club" className="h-9 w-auto shrink-0" />
        <div className="hidden text-lg font-semibold text-brand-navy sm:block">Wedgewood Pool</div>
        <nav className="ml-2 flex items-center gap-1">
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand-navy",
                isActive && "bg-brand-background text-brand-navy"
              )
            }
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/members"
            className={({ isActive }) =>
              cn(
                "rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand-navy",
                isActive && "bg-brand-background text-brand-navy"
              )
            }
          >
            Members
          </NavLink>
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden items-center gap-2 rounded-full border border-brand-border px-3 text-sm font-medium text-slate-600 md:flex">
          <Clock className="h-4 w-4" />
          <span>{time}</span>
        </div>
        <ConnectionIndicator status={connection.status} />
        <Button variant="ghost" size="icon" aria-label="Log out" onClick={logout}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
};
