import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "./ui/card";

export const StatCard = ({ label, value, icon: Icon }: { label: string; value: number; icon: LucideIcon }) => (
  <Card className="border-brand-border bg-white shadow-sm">
    <CardContent className="flex items-center justify-between p-5">
      <div>
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <p className="mt-2 text-3xl font-bold text-brand-navy">{value}</p>
      </div>
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-background text-brand-primary">
        <Icon className="h-6 w-6" />
      </div>
    </CardContent>
  </Card>
);
