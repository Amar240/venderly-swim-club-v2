import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../components/ui/table";
import {
  fetchWebhookEvent,
  fetchWebhookEvents,
  replayWebhookEvent,
  type WebhookEventListItem,
  type WebhookEventStatus
} from "../lib/api";
import { cn } from "../lib/utils";

type StatusFilter = "ALL" | "FAILED" | "PROCESSED";

const statusFilters: StatusFilter[] = ["ALL", "FAILED", "PROCESSED"];

const formatTime = (value: string): string =>
  new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

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
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const detailQuery = useQuery({
    queryKey: ["admin", "webhooks", "detail", selectedId],
    enabled: Boolean(selectedId),
    queryFn: () => fetchWebhookEvent(selectedId ?? "")
  });
  const replayMutation = useMutation({
    mutationFn: replayWebhookEvent,
    onSuccess: async (data) => {
      toast.success(`Replay finished: ${data.status}`);
      await queryClient.invalidateQueries({ queryKey: ["admin", "webhooks"] });
    },
    onError: () => {
      toast.error("Couldn't replay webhook");
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
  const rawPayload = detailQuery.data?.event.rawPayload;

  const replay = (event: WebhookEventListItem) => {
    if (!window.confirm(`Replay ${event.endpoint} webhook from ${formatTime(event.receivedAt)}?`)) {
      return;
    }

    replayMutation.mutate(event.id);
  };

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div>
        <h1 className="text-3xl font-bold text-brand-navy">Webhook Events</h1>
        <p className="mt-1 text-sm text-slate-500">Incoming GHL payloads, processing status, and replay tools.</p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {statusFilters.map((status) => (
          <Button
            key={status}
            type="button"
            variant={statusFilter === status ? "default" : "outline"}
            onClick={() => setStatusFilter(status)}
          >
            {status === "ALL" ? "All" : status === "FAILED" ? "Failed" : "Processed"}
          </Button>
        ))}
      </div>

      <section className="mt-6 rounded-lg border border-brand-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Endpoint</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payload</TableHead>
              <TableHead>Error</TableHead>
              <TableHead className="w-28 text-right">Replay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {webhooksQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                  Loading webhook events...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-slate-500">
                  No webhook events found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((event) => (
                <TableRow key={event.id}>
                  <TableCell className="font-medium text-brand-navy">{event.time}</TableCell>
                  <TableCell className="capitalize">{event.endpoint}</TableCell>
                  <TableCell>
                    <Badge className={statusBadgeClass(event.status)}>{event.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => setSelectedId(event.id)}
                      className="max-w-[240px] truncate text-left text-sm font-medium text-brand-primary underline-offset-2 hover:underline"
                      title={event.payloadPreview || "View payload"}
                    >
                      {event.payloadPreview || "View payload"}
                    </button>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn("block max-w-[280px] truncate text-sm", event.errorMessage ? "text-brand-danger" : "text-slate-400")}
                      title={event.errorMessage ?? ""}
                    >
                      {event.errorMessage ?? "-"}
                    </span>
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

      <Dialog open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Webhook payload</DialogTitle>
            <DialogDescription>Raw JSON stored before processing.</DialogDescription>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto rounded-lg bg-slate-950 p-4 text-xs text-slate-50">
            {detailQuery.isLoading ? "Loading..." : JSON.stringify(rawPayload ?? {}, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>
    </main>
  );
};
