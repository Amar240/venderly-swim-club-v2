import { escapeHtml } from "./layout";

export const formatDuration = (minutes: number): string => {
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"}`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return remainingMinutes === 0 ? `${hours} ${hours === 1 ? "hour" : "hours"}` : `${hours}h ${remainingMinutes}m`;
};

export const renderGoodbye = (opts: { status: string; name: string; durationMins: number | null }): { title: string; body: string } => {
  const name = escapeHtml(opts.name);

  if (opts.status === "not_checked_in") {
    return {
      title: "No check-in found",
      body: `
      <div class="card">
        <div class="icon-circle warning">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 class="headline">No active check-in found</h1>
        <p class="subline">We don't have a record of you checking in today. If this is a mistake, please see the staff.</p>
        <div class="button-row"><a href="https://wedgewoodpool.com/pool-sign-in" class="button">Sign in now</a></div>
      </div>`
    };
  }

  const durationText = opts.durationMins ? formatDuration(opts.durationMins) : null;

  return {
    title: `See you ${opts.name}`,
    body: `
      <div class="card">
        <div class="icon-circle info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 12c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5z"/>
            <path d="M12 12c0-3 2-5 5-5s5 2 5 5-2 5-5 5-5-2-5-5z"/>
          </svg>
        </div>
        <h1 class="headline">See you next time, ${name}!</h1>
        <p class="subline">Thanks for visiting Wedgewood today.</p>
        ${durationText ? `<div class="info-block"><div class="label">You were here for</div><div class="value">${durationText}</div></div>` : ""}
        <p class="countdown">Have a great rest of your day.</p>
      </div>`
  };
};
