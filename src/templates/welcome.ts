import { escapeHtml } from "./layout";

export type WelcomeStatus = "success" | "already_checked_in" | "not_found" | "at_capacity";

export const renderWelcome = (opts: {
  status: string;
  name: string;
  tier: string;
  passes: number | null;
  familyInPool: number;
}): { title: string; body: string; refreshSeconds?: number; autoRedirectSeconds?: number; redirectUrl?: string } => {
  const status = opts.status as WelcomeStatus;
  const name = escapeHtml(opts.name);

  if (status === "already_checked_in") {
    return {
      title: "Already checked in",
      body: `
      <div class="card">
        <div class="icon-circle warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 class="headline">You're already checked in</h1>
        <p class="subline">Looks like ${name} is already checked in. Have a great swim!</p>
        <div class="info-block"><div class="label">If this looks wrong</div><div class="value">Please see the staff at the front desk for help.</div></div>
      </div>`
    };
  }

  if (status === "not_found") {
    return {
      title: "Not found",
      body: `
      <div class="card">
        <div class="icon-circle danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h1 class="headline">We couldn't find your membership</h1>
        <p class="subline">No worries. Please head to the front desk and staff will help you sort it out.</p>
        <div class="button-row">
          <a href="https://wedgewoodpool.com/memberships" class="button">Sign up for a membership</a>
          <a href="https://wedgewoodpool.com/pool-sign-in" class="button secondary">Back to sign in</a>
        </div>
      </div>`
    };
  }

  if (status === "at_capacity") {
    return {
      title: "At capacity",
      refreshSeconds: 30,
      body: `
      <div class="card">
        <div class="icon-circle danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <h1 class="headline">Pool is at capacity right now</h1>
        <p class="subline">The pool is currently full. Please wait a few minutes or see staff for help.</p>
        <p class="countdown">We'll re-check in 30 seconds.</p>
      </div>`
    };
  }

  return {
    title: `Welcome ${opts.name}`,
    autoRedirectSeconds: 10,
    redirectUrl: "https://wedgewoodpool.com/pool-sign-in",
    body: `
      <div class="card">
        <div class="icon-circle success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h1 class="headline">Welcome, ${name}!</h1>
        <p class="subline">You're checked in. Have a great swim!</p>
        ${opts.tier ? `<div class="info-block"><div class="label">Your membership</div><div class="value">${escapeHtml(opts.tier)}</div></div>` : ""}
        ${
          opts.passes !== null
            ? `<div class="info-block"><div class="label">Guest passes remaining</div><div class="value">${opts.passes} ${opts.passes === 1 ? "pass" : "passes"}</div></div>`
            : ""
        }
        ${
          opts.familyInPool > 0
            ? `<div class="info-block"><div class="label">Family in pool</div><div class="value">${opts.familyInPool} family ${opts.familyInPool === 1 ? "member" : "members"} already swimming</div></div>`
            : ""
        }
        <p class="countdown">Returning to the pool gate in 10 seconds.</p>
      </div>`
  };
};
