import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, Moon, Settings, Volume2, Waves } from "lucide-react";
import { useLogout } from "../hooks/useAuth";
import { useDashboardSummary } from "../hooks/useDashboard";
import { useUiPrefs } from "../hooks/useUiPrefs";
import { postUpdateCapacity } from "../lib/api";
import { cn } from "../lib/utils";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export const SettingsMenu = () => {
  const logout = useLogout();
  const { darkMode, toggleDarkMode, soundEnabled, toggleSound } = useUiPrefs();
  const [capacityDialogOpen, setCapacityDialogOpen] = useState(false);
  const [capacityInput, setCapacityInput] = useState("");
  const queryClient = useQueryClient();
  const summary = useDashboardSummary().data;
  const capacityMutation = useMutation({
    mutationFn: (capacity: number) => postUpdateCapacity(capacity),
    onSuccess: (data) => {
      toast.success(`Pool capacity updated to ${data.capacity}`);
      queryClient.invalidateQueries({ queryKey: ["dashboard", "summary"] });
      setCapacityDialogOpen(false);
    },
    onError: () => toast.error("Couldn't update capacity")
  });

  useEffect(() => {
    if (capacityDialogOpen && summary) {
      setCapacityInput(String(summary.poolCapacity));
    }
  }, [capacityDialogOpen, summary]);

  const signOut = () => {
    if (window.confirm("Sign out?")) {
      logout();
    }
  };

  const saveCapacity = () => {
    const capacity = Number.parseInt(capacityInput, 10);

    if (Number.isFinite(capacity) && capacity >= 1 && capacity <= 2000) {
      capacityMutation.mutate(capacity);
      return;
    }

    toast.error("Enter a number between 1 and 2000");
  };

  return (
    <>
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
          <DropdownMenuItem
            onSelect={(event) => {
              event.preventDefault();
              setCapacityDialogOpen(true);
            }}
            className="min-h-11"
          >
            <Waves className="h-4 w-4" />
            Pool capacity
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={signOut} className="min-h-11 text-brand-danger focus:text-brand-danger">
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={capacityDialogOpen} onOpenChange={setCapacityDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pool capacity</DialogTitle>
            <DialogDescription>Maximum number of people allowed in the pool at one time.</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="capacity-input">Capacity</Label>
            <Input
              id="capacity-input"
              type="number"
              min={1}
              max={2000}
              value={capacityInput}
              onChange={(event) => setCapacityInput(event.target.value)}
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCapacityDialogOpen(false)}
              disabled={capacityMutation.isPending}
            >
              Cancel
            </Button>
            <Button onClick={saveCapacity} disabled={capacityMutation.isPending}>
              {capacityMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
