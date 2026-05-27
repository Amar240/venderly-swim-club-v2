import { Eye, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MemberDetailSheet } from "../components/MemberDetailSheet";
import { TopBar } from "../components/TopBar";
import { Avatar, AvatarFallback } from "../components/ui/avatar";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { useMembers } from "../hooks/useMembers";
import { cn } from "../lib/utils";

const FILTERS = ["All", "Family", "Adult", "Student"];

const initials = (firstName: string, lastName: string): string => `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();

export const Members = () => {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [tier, setTier] = useState("All");
  const params = useParams();
  const navigate = useNavigate();
  const membersQuery = useMembers({ q: debouncedSearch, tier });
  const selectedPersonId = params.id ?? null;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  return (
    <div className="min-h-screen bg-brand-background">
      <TopBar />
      <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-brand-navy">Members</h1>
          <p className="mt-1 text-slate-500">Search memberships, view family groups, and inspect check-in history.</p>
        </div>

        <Card className="border-brand-border bg-white shadow-sm">
          <CardHeader className="gap-4 md:flex-row md:items-center md:justify-between">
            <CardTitle className="text-brand-navy">Member directory</CardTitle>
            <div className="relative w-full md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search members" className="pl-9" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              {FILTERS.map((filter) => (
                <Button
                  key={filter}
                  type="button"
                  variant={tier === filter ? "default" : "outline"}
                  className={cn(tier === filter && "bg-brand-primary hover:bg-brand-primaryHover")}
                  onClick={() => setTier(filter)}
                >
                  {filter}
                </Button>
              ))}
            </div>

            <div className="overflow-hidden rounded-xl border border-brand-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Avatar</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Family Count</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {membersQuery.isLoading ? (
                    [0, 1, 2, 3].map((row) => (
                      <TableRow key={row}>
                        <TableCell colSpan={6}>
                          <Skeleton className="h-12 w-full" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : membersQuery.data?.members.length ? (
                    membersQuery.data.members.map((member) => (
                      <TableRow
                        key={member.personId}
                        className="cursor-pointer"
                        onClick={() => navigate(`/members/${member.personId}`)}
                      >
                        <TableCell>
                          <Avatar>
                            <AvatarFallback className="bg-brand-background text-brand-navy">
                              {initials(member.firstName, member.lastName)}
                            </AvatarFallback>
                          </Avatar>
                        </TableCell>
                        <TableCell>
                          <div className="font-semibold text-brand-navy">
                            {member.firstName} {member.lastName}
                          </div>
                          <div className="text-sm text-slate-500">{member.email || member.phone || "No contact info"}</div>
                        </TableCell>
                        <TableCell>{member.membershipTier}</TableCell>
                        <TableCell>{member.familyCount}</TableCell>
                        <TableCell>
                          <Badge variant={member.isCurrentlyIn ? "default" : "secondary"}>
                            {member.isCurrentlyIn ? "In pool" : member.membershipStatus}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              navigate(`/members/${member.personId}`);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={6} className="h-32 text-center text-slate-500">
                        No members found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
      <MemberDetailSheet
        personId={selectedPersonId}
        open={Boolean(selectedPersonId)}
        onOpenChange={(open) => {
          if (!open) {
            navigate("/members");
          }
        }}
      />
    </div>
  );
};
