import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "../components/ui/badge";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table";
import { fetchActivity, fetchEditActivity, fetchStaff } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

const todayInputValue = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatChangeValue = (value: string | null): string =>
  value && value.trim().length > 0 ? value : "—";

const REASON_LABELS: Record<string, string> = {
  purchase: "Manual purchase",
  comp: "Complimentary passes",
  error_fix: "Error correction",
  other: "Other"
};

const isFieldChange = (value: unknown): value is { from: string | null; to: string | null } =>
  typeof value === "object" && value !== null && "from" in value && "to" in value;

const formatFieldName = (field: string): string =>
  field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .trim();

const formatEditAction = (targetType: string): string => {
  if (targetType === "person_remove") return "Removed";
  if (targetType === "person_add") return "Added";
  if (targetType === "guest_passes_adjust") return "Adjusted passes";
  return "Edited";
};

const formatGuestPassAdjustment = (changes: Record<string, unknown>): string | null => {
  const totalChange = changes.guestPassesTotal;

  if (!isFieldChange(totalChange)) {
    return null;
  }

  const from = Number.parseInt(totalChange.from ?? "0", 10);
  const to = Number.parseInt(totalChange.to ?? "0", 10);
  const delta = to - from;
  const reason = typeof changes.reason === "string" ? REASON_LABELS[changes.reason] ?? changes.reason : null;
  const notes = typeof changes.notes === "string" && changes.notes.trim().length > 0 ? changes.notes.trim() : null;

  return [`${delta > 0 ? "+" : ""}${delta} passes`, reason, notes].filter(Boolean).join(" · ");
};

export const AdminActivity = () => {
  const { staff: currentStaff } = useAuth();
  const [activeFeed, setActiveFeed] = useState<"checkins" | "edits">("checkins");
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(todayInputValue);
  const staffQuery = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: fetchStaff,
    enabled: !currentStaff?.demoAdmin
  });
  const activityQuery = useQuery({
    queryKey: ["admin", "activity", staffId, date],
    queryFn: () => fetchActivity({ staffId: staffId || undefined, date, limit: 100 }),
    refetchInterval: 10_000,
    enabled: activeFeed === "checkins"
  });
  const editActivityQuery = useQuery({
    queryKey: ["admin", "edits", staffId, date],
    queryFn: () => fetchEditActivity({ staffId: staffId || undefined, date, limit: 100 }),
    refetchInterval: 10_000,
    enabled: activeFeed === "edits"
  });
  const staff = currentStaff?.demoAdmin && currentStaff
    ? [{
        id: currentStaff.id,
        name: currentStaff.name,
        email: currentStaff.email,
        role: currentStaff.role,
        isActive: true,
        createdAt: ""
      }]
    : staffQuery.data?.staff ?? [];
  const events = activityQuery.data?.events ?? [];
  const editEvents = editActivityQuery.data?.events ?? [];
  const formattedRows = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        time: new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      })),
    [events]
  );
  const formattedEditRows = useMemo(
    () =>
      editEvents.map((event) => ({
        ...event,
        time: new Date(event.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      })),
    [editEvents]
  );

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-navy">Activity Log</h1>
        <p className="mt-1 text-sm text-slate-500">Manual check-ins, sign-outs, and member edits by staff.</p>
      </div>

      <div className="mt-6 inline-flex rounded-lg border border-brand-border bg-white p-1">
        <button
          type="button"
          onClick={() => setActiveFeed("checkins")}
          className={`h-10 rounded-md px-4 text-sm font-semibold transition-colors ${
            activeFeed === "checkins" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-brand-background"
          }`}
        >
          Check-ins
        </button>
        <button
          type="button"
          onClick={() => setActiveFeed("edits")}
          className={`h-10 rounded-md px-4 text-sm font-semibold transition-colors ${
            activeFeed === "edits" ? "bg-brand-primary text-white" : "text-slate-600 hover:bg-brand-background"
          }`}
        >
          Edits
        </button>
      </div>

      <section className="mt-6 grid gap-4 rounded-lg border border-brand-border bg-white p-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="activity-staff">Staff</Label>
          <select
            id="activity-staff"
            value={staffId}
            onChange={(event) => setStaffId(event.target.value)}
            className="h-11 rounded-md border border-brand-border bg-white px-3 text-sm text-brand-navy"
          >
            <option value="">All staff</option>
            {staff.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="activity-date">Date</Label>
          <Input id="activity-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-brand-border bg-white">
        {activeFeed === "checkins" ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Member</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activityQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-slate-500">
                    Loading activity...
                  </TableCell>
                </TableRow>
              ) : formattedRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-slate-500">
                    No manual activity found.
                  </TableCell>
                </TableRow>
              ) : (
                formattedRows.map((event) => (
                  <TableRow key={`${event.eventId}-${event.actionType}-${event.timestamp}`}>
                    <TableCell className="font-medium text-brand-navy">{event.time}</TableCell>
                    <TableCell>{event.staffName}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          event.actionType === "manual_checkin"
                            ? "bg-brand-success text-white"
                            : "bg-brand-primary text-white"
                        }
                      >
                        {event.actionType === "manual_checkin" ? "Checked in" : "Signed out"}
                      </Badge>
                    </TableCell>
                    <TableCell>{event.memberName}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Staff</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Member</TableHead>
                <TableHead>Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {editActivityQuery.isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-slate-500">
                    Loading edits...
                  </TableCell>
                </TableRow>
              ) : formattedEditRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center text-slate-500">
                    No edits found.
                  </TableCell>
                </TableRow>
              ) : (
                formattedEditRows.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium text-brand-navy">{event.time}</TableCell>
                    <TableCell>{event.staff.name}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          event.targetType === "person_remove"
                            ? "bg-brand-danger text-white"
                            : event.targetType === "person_add"
                              ? "bg-brand-success text-white"
                              : event.targetType === "guest_passes_adjust"
                                ? "bg-brand-warning text-brand-navy"
                                : "bg-brand-primary text-white"
                        }
                      >
                        {formatEditAction(event.targetType)}
                      </Badge>
                    </TableCell>
                    <TableCell>{event.targetLabel}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {event.targetType === "guest_passes_adjust" ? (
                          <Badge variant="outline" className="border-brand-border text-slate-700">
                            {formatGuestPassAdjustment(event.changes) ?? "Guest passes adjusted"}
                          </Badge>
                        ) : (
                          Object.entries(event.changes).map(([field, change]) =>
                            isFieldChange(change) ? (
                              <Badge key={field} variant="outline" className="border-brand-border text-slate-700">
                                {formatFieldName(field)}: {formatChangeValue(change.from)} →{" "}
                                {formatChangeValue(change.to)}
                              </Badge>
                            ) : null
                          )
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        )}
      </section>
    </main>
  );
};
