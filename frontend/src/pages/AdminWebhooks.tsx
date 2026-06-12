import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table";
import {
  fetchWebhookEvents,
  replayWebhookEvent,
  type WebhookEndpoint,
  type WebhookEventListItem,
  type WebhookEventStatus
} from "../lib/api";

type StatusFilter = "ALL" | "FAILED" | "PROCESSED";

const statusFilters: Array<{ value: StatusFilter; label: string }> = [
  { value: "ALL", label: "All" },
  { value: "FAILED", label: "Failed" },
  { value: "PROCESSED", label: "Worked" }
];

const ENDPOINT_LABELS: Record<WebhookEndpoint, string> = {
  signup: "New Signup",
  checkin: "Check-In",
  signout: "Sign-Out",
  guestpass: "Guest Pass"
};

const formatTime = (value: string): string =>
  new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

const statusLabel = (status: WebhookEventStatus): string => {
  switch (status) {
    case "PROCESSED":
      return "Worked";
    case "FAILED":
      return "Failed";
    case "RECEIVED":
      return "Processing";
  }
};

const statusBadgeClass = (status: WebhookEventStatus): string => {
  switch (status) {
    case "PROCESSED":
      return "bg-brand-success text-white";
    case "FAILED":
      return "bg-brand-danger text-white";
    case "RECEIVED":
      return "bg-slate-200 text-slate-700";
  }
};

export const AdminWebhooks = () => {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("FAILED");
  const queryClient = useQueryClient();
  const webhooksQuery = useQuery({
    queryKey: ["admin", "webhooks", statusFilter],
    queryFn: () =>
      fetchWebhookEvents({
        status: statusFilter === "ALL" ? undefined : statusFilter,
        limit: 50
      }),
    refetchInterval: 10_000
  });
  const replayMutation = useMutation({
    mutationFn: replayWebhookEvent,
    onSuccess: async (data) => {
      toast.success(data.status === "PROCESSED" ? "Fixed! The record went through." : "Still not working. Contact support.");
      await queryClient.invalidateQueries({ queryKey: ["admin", "webhooks"] });
    },
    onError: () => {
      toast.error("Couldn't retry right now. Try again in a minute.");
    }
  });
  const events = webhooksQuery.data?.events ?? [];
  const rows = useMemo(
    () =>
      events.map((event) => ({
        ...event,
        time: formatTime(event.receivedAt)
      })),
    [events]
  );

  const replay = (event: WebhookEventListItem) => {
    replayMutation.mutate(event.id);
  };

  return (
    <main className="mx-auto max-w-5xl p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-navy">Form Submissions</h1>
        <p className="mt-1 text-sm text-slate-500">
          Every signup, check-in, sign-out, and guest pass purchase that came in from the online forms.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {statusFilters.map((filter) => (
          <Button
            key={filter.value}
            type="button"
            variant={statusFilter === filter.value ? "default" : "outline"}
            onClick={() => setStatusFilter(filter.value)}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      <section className="mt-6 rounded-lg border border-brand-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooksQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                  {statusFilter === "FAILED" ? "Nothing has failed. All good!" : "No activity yet."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium text-brand-navy">{event.time}</TableCell>
                  <TableCell>{ENDPOINT_LABELS[event.endpoint] ?? event.endpoint}</TableCell>
                  <TableCell className="font-medium text-brand-navy">{event.memberName}</TableCell>
                  <TableCell>
                    <div>
                      <Badge className={statusBadgeClass(event.status)}>{statusLabel(event.status)}</Badge>
                      {event.status === "FAILED" && (
                        <p className="mt-1 text-xs text-slate-500">Something went wrong. Click Replay to try again.</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    {event.status === "FAILED" ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => replay(event)}
                        disabled={replayMutation.isPending}
                      >
                        <RotateCcw className="h-4 w-4" />
                        Replay
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </main>
  );
};
