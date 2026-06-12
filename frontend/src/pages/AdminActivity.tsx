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
import { fetchActivity, fetchStaff } from "../lib/api";

const todayInputValue = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const AdminActivity = () => {
  const [staffId, setStaffId] = useState("");
  const [date, setDate] = useState(todayInputValue);
  const staffQuery = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: fetchStaff
  });
  const activityQuery = useQuery({
    queryKey: ["admin", "activity", staffId, date],
    queryFn: () => fetchActivity({ staffId: staffId || undefined, date, limit: 100 }),
    refetchInterval: 10_000
  });
  const staff = staffQuery.data?.staff ?? [];
  const events = activityQuery.data?.events ?? [];
  const formattedRows = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        time: new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      })),
    [events]
  );

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-navy">Activity Log</h1>
        <p className="mt-1 text-sm text-slate-500">Manual check-ins and sign-outs performed by staff.</p>
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
      </section>
    </main>
  );
};
