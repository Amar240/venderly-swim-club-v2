import { BarChart3 } from "lucide-react";
import { TopBar } from "../components/TopBar";
import { Card, CardContent } from "../components/ui/card";

export const Reports = () => (
  <div className="min-h-screen bg-brand-background">
    <TopBar />
    <main className="mx-auto flex max-w-5xl items-center justify-center p-6">
      <Card className="w-full border-brand-border bg-white shadow-sm">
        <CardContent className="flex flex-col items-center py-20 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-background text-brand-primary">
            <BarChart3 className="h-8 w-8" />
          </div>
          <h1 className="mt-6 text-3xl font-bold text-brand-navy">Reports coming soon</h1>
          <p className="mt-3 max-w-md text-slate-500">
            Attendance trends, guest pass inventory, and season reporting will live here when reporting APIs are ready.
          </p>
        </CardContent>
      </Card>
    </main>
  </div>
);
