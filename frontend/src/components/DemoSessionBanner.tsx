import { ExternalLink, KeyRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const BOOKING_URL = "https://secure.venderly.us/widget/booking/GhQmK64lJqAj3TBFaMq9";

export const DemoSessionBanner = () => {
  const { staff, demoTempPin } = useAuth();
  if (!staff?.demoAdmin) return null;

  return (
    <div className="border-b border-cyan-200 bg-cyan-50 px-4 py-2 text-sm text-brand-navy md:px-6">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <b>You are exploring a Splash Manager demo</b>
        <div className="flex flex-wrap items-center gap-3">
          <details className="group relative">
            <summary className="cursor-pointer list-none font-semibold text-brand-primary hover:underline">
              Staff login details
            </summary>
            <div className="absolute right-0 top-8 z-50 w-80 rounded-lg border border-brand-border bg-white p-4 shadow-lg">
              <div className="flex items-start gap-3">
                <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-brand-primary" />
                <div className="min-w-0 space-y-2">
                  <p>This is how staff would sign in to your club.</p>
                  <p className="break-all"><b>Email:</b> {staff.email}</p>
                  {demoTempPin ? (
                    <>
                      <p><b>One-time PIN:</b> <span className="font-mono text-lg">{demoTempPin}</span></p>
                      <p className="font-semibold text-brand-danger">Save this now. This PIN will not be shown again.</p>
                    </>
                  ) : (
                    <p className="text-slate-600">The PIN was shown when this demo session was first created. Your access has been restored automatically.</p>
                  )}
                </div>
              </div>
            </div>
          </details>
          <Link className="font-semibold text-brand-primary hover:underline" to={`/demo/${staff.clubId}/dashboard`}>
            Demo summary
          </Link>
          <a className="inline-flex items-center gap-1 font-semibold text-brand-primary hover:underline" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
            Book a walkthrough <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
};
