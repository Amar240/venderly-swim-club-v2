import axios from "axios";
import { MoreHorizontal, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../components/ui/dropdown-menu";
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
import {
  createStaff,
  deactivateStaff,
  fetchStaff,
  updateStaff,
  type StaffMember
} from "../lib/api";

const emptyCreateForm = {
  name: "",
  email: "",
  pin: "",
  role: "STAFF" as StaffMember["role"]
};

const errorCode = (error: unknown): string | undefined =>
  axios.isAxiosError(error) ? (error.response?.data as { error?: { code?: string } } | undefined)?.error?.code : undefined;

const errorMessage = (error: unknown): string => {
  const code = errorCode(error);

  if (code === "LAST_ADMIN") {
    return "Cannot change the only active admin.";
  }

  if (code === "PIN_TAKEN") {
    return "That PIN is already assigned to an active staff member.";
  }

  if (code === "EMAIL_TAKEN") {
    return "That email is already assigned to another staff member.";
  }

  return "Something went wrong.";
};

export const AdminStaff = () => {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [pinTarget, setPinTarget] = useState<StaffMember | null>(null);
  const [pin, setPin] = useState("");
  const [deactivateTarget, setDeactivateTarget] = useState<StaffMember | null>(null);
  const [inlineError, setInlineError] = useState("");
  const staffQuery = useQuery({
    queryKey: ["admin", "staff"],
    queryFn: fetchStaff
  });

  const invalidateStaff = async () => {
    await queryClient.invalidateQueries({ queryKey: ["admin", "staff"] });
  };

  const createMutation = useMutation({
    mutationFn: createStaff,
    onSuccess: async () => {
      toast.success("Staff account created");
      setCreateForm(emptyCreateForm);
      setCreateOpen(false);
      setInlineError("");
      await invalidateStaff();
    },
    onError: (error) => {
      const message = errorMessage(error);
      setInlineError(message);
      toast.error(message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateStaff>[1] }) => updateStaff(id, data),
    onSuccess: async () => {
      toast.success("Staff account updated");
      setPinTarget(null);
      setPin("");
      setInlineError("");
      await invalidateStaff();
    },
    onError: (error) => {
      const message = errorMessage(error);
      setInlineError(message);
      toast.error(message);
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateStaff,
    onSuccess: async () => {
      toast.success("Staff account deactivated");
      setDeactivateTarget(null);
      setInlineError("");
      await invalidateStaff();
    },
    onError: (error) => {
      const message = errorMessage(error);
      setInlineError(message);
      toast.error(message);
    }
  });

  const submitCreate = () => {
    if (!/^\d{4}$/.test(createForm.pin)) {
      setInlineError("PIN must be exactly 4 digits.");
      return;
    }

    createMutation.mutate(createForm);
  };

  const submitPin = () => {
    if (!pinTarget) {
      return;
    }

    if (!/^\d{4}$/.test(pin)) {
      setInlineError("PIN must be exactly 4 digits.");
      return;
    }

    updateMutation.mutate({ id: pinTarget.id, data: { pin } });
  };

  const staff = staffQuery.data?.staff ?? [];

  return (
    <main className="mx-auto max-w-6xl p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-brand-navy">Staff Management</h1>
          <p className="mt-1 text-sm text-slate-500">Create accounts, rotate PINs, and manage staff access.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="min-w-36">
          <Plus className="h-4 w-4" />
          Add staff
        </Button>
      </div>

      {inlineError && (
        <div className="mt-4 rounded-md border border-brand-border bg-white px-4 py-3 text-sm font-medium text-brand-danger">
          {inlineError}
        </div>
      )}

      <section className="mt-6 rounded-lg border border-brand-border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-16 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                  Loading staff...
                </TableCell>
              </TableRow>
            ) : staff.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-10 text-center text-slate-500">
                  No staff accounts found.
                </TableCell>
              </TableRow>
            ) : (
              staff.map((member) => (
                <TableRow key={member.id}>
                  <TableCell className="font-semibold text-brand-navy">{member.name}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <Badge className={member.role === "ADMIN" ? "bg-brand-primary text-white" : "bg-slate-100 text-slate-700"}>
                      {member.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={member.isActive ? "bg-brand-success text-white" : "bg-slate-200 text-slate-600"}>
                      {member.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Actions for ${member.name}`}>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onSelect={() => {
                            setPinTarget(member);
                            setPin("");
                            setInlineError("");
                          }}
                        >
                          Edit PIN
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            updateMutation.mutate({
                              id: member.id,
                              data: { role: member.role === "ADMIN" ? "STAFF" : "ADMIN" }
                            })
                          }
                          disabled={!member.isActive}
                        >
                          Change role to {member.role === "ADMIN" ? "STAFF" : "ADMIN"}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setDeactivateTarget(member);
                            setInlineError("");
                          }}
                          disabled={!member.isActive}
                          className="text-brand-danger focus:text-brand-danger"
                        >
                          Deactivate
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add staff</DialogTitle>
            <DialogDescription>Create a staff PIN login for this club.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <Field label="Name">
              <Input value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              />
            </Field>
            <Field label="PIN">
              <Input
                inputMode="numeric"
                maxLength={4}
                value={createForm.pin}
                onChange={(event) => setCreateForm({ ...createForm, pin: event.target.value.replace(/\D/g, "") })}
              />
            </Field>
            <Field label="Role">
              <select
                value={createForm.role}
                onChange={(event) => setCreateForm({ ...createForm, role: event.target.value as StaffMember["role"] })}
                className="h-11 rounded-md border border-brand-border bg-white px-3 text-sm text-brand-navy"
              >
                <option value="STAFF">STAFF</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitCreate} disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pinTarget)} onOpenChange={(open) => !open && setPinTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit PIN</DialogTitle>
            <DialogDescription>Set a new 4-digit PIN for {pinTarget?.name}.</DialogDescription>
          </DialogHeader>
          <Field label="New PIN">
            <Input
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))}
            />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinTarget(null)} disabled={updateMutation.isPending}>
              Cancel
            </Button>
            <Button onClick={submitPin} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(deactivateTarget)} onOpenChange={(open) => !open && setDeactivateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Deactivate staff?</DialogTitle>
            <DialogDescription>
              {deactivateTarget?.name} will no longer be able to sign in. This does not delete their history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)} disabled={deactivateMutation.isPending}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deactivateTarget && deactivateMutation.mutate(deactivateTarget.id)}
              disabled={deactivateMutation.isPending}
            >
              {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
};

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);
