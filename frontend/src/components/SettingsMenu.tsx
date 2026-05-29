import { LogOut, Moon, Settings, Volume2 } from "lucide-react";
import { useLogout } from "../hooks/useAuth";
import { useUiPrefs } from "../hooks/useUiPrefs";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./ui/dropdown-menu";

export const SettingsMenu = () => {
  const logout = useLogout();
  const { darkMode, toggleDarkMode, soundEnabled, toggleSound } = useUiPrefs();

  const signOut = () => {
    if (window.confirm("Sign out?")) {
      logout();
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings" className="h-11 w-11">
          <Settings className="h-5 w-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <ToggleRow icon={Moon} label="Dark mode" checked={darkMode} onToggle={toggleDarkMode} />
        <ToggleRow icon={Volume2} label="Sound" checked={soundEnabled} onToggle={toggleSound} />
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={signOut} className="min-h-11 text-brand-danger focus:text-brand-danger">
          <LogOut className="h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const ToggleRow = ({
  icon: Icon,
  label,
  checked,
  onToggle
}: {
  icon: typeof Moon;
  label: string;
  checked: boolean;
  onToggle: () => void;
}) => (
  <DropdownMenuItem
    onSelect={(event) => {
      event.preventDefault();
      onToggle();
    }}
    className="min-h-11 justify-between"
  >
    <span className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      {label}
    </span>
    <span
      role="switch"
      aria-checked={checked}
      className={cn(
        "relative h-6 w-11 rounded-full border transition-colors duration-150",
        checked ? "border-brand-primary bg-brand-primary" : "border-brand-border bg-slate-200"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-150",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </span>
  </DropdownMenuItem>
);
