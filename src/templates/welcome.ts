import { escapeHtml, renderPillList } from "./layout";

export type WelcomeState =
  | {
      status: "success";
      name: string;
      checkedIn: string[];
      passes: number | null;
      redirectUrl: string;
    }
  | { status: "already_checked_in"; name: string }
  | { status: "batch_name_unmatched"; unmatched: string[] }
  | { status: "not_found" }
  | { status: "at_capacity" }
  | { status: "insufficient_passes"; remaining: number | null }
  | { status: "default"; redirectUrl: string };

const renderCountdown = (): string => `
  <p class="countdown">Returning in <span id="countdown">10</span> seconds...</p>
  <script>
    (function () {
      var remaining = 10;
      var el = document.getElementById("countdown");
      if (!el) return;
      window.setInterval(function () {
        remaining = Math.max(0, remaining - 1);
        el.textContent = String(remaining);
      }, 1000);
    })();
  </script>`;

export const renderWelcome = (
  state: WelcomeState
): { title: string; body: string; autoRedirectSeconds?: number; redirectUrl?: string } => {
  switch (state.status) {
    case "success": {
      const name = escapeHtml(state.name || "there");
      const checkedInList = renderPillList(state.checkedIn);
      const passesBlock =
        state.passes !== null && state.passes > 0
          ? `<div class="info-block"><div class="label">Guest passes remaining</div><div class="value">${state.passes} ${state.passes === 1 ? "pass" : "passes"}</div></div>`
          : "";

      return {
        title: `Welcome ${state.name || "Member"}`,
        autoRedirectSeconds: 10,
        redirectUrl: state.redirectUrl,
        body: `
          <div class="card">
            <div class="status-emoji">🏊</div>
            <h1 class="headline">Welcome ${name}! 🏊</h1>
            <p class="subline">You're checked in. Have a great swim.</p>
            ${
              checkedInList
                ? `<div class="info-block"><div class="label">Checked in now</div>${checkedInList}</div>`
                : ""
            }
            ${passesBlock}
            ${renderCountdown()}
          </div>`
      };
    }

    case "already_checked_in": {
      const name = escapeHtml(state.name || "This member");

      return {
        title: "Already checked in",
        body: `
          <div class="card">
            <div class="status-emoji">⚠️</div>
            <h1 class="headline">You're already checked in!</h1>
            <p class="subline">${name} already has an active check-in.</p>
            <div class="alert-warning">See staff if something seems wrong.</div>
          </div>`
      };
    }

    case "batch_name_unmatched": {
      const unmatchedList = renderPillList(state.unmatched);
      const unmatchedNames = escapeHtml(state.unmatched.join(", "));

      return {
        title: "Please see staff",
        body: `
          <div class="card">
            <div class="status-emoji">⚠️</div>
            <h1 class="headline">${
              unmatchedNames ? `We couldn't find: ${unmatchedNames}` : "We couldn't find those members"
            }</h1>
            ${
              unmatchedList
                ? `<div class="info-block"><div class="label">Names to check</div>${unmatchedList}</div>`
                : ""
            }
            <div class="alert-warning">Please see staff.</div>
          </div>`
      };
    }

    case "not_found":
      return {
        title: "Membership not found",
        body: `
          <div class="card">
            <div class="status-emoji">⚠️</div>
            <h1 class="headline">Membership not found</h1>
            <p class="subline">Please see staff at the front desk.</p>
          </div>`
      };

    case "at_capacity":
      return {
        title: "Pool at capacity",
        body: `
          <div class="card">
            <div class="status-emoji">⚠️</div>
            <h1 class="headline">Pool is at capacity</h1>
            <p class="subline">Please wait or see staff.</p>
          </div>`
      };

    case "insufficient_passes": {
      const remaining =
        state.remaining !== null
          ? `<div class="info-block"><div class="label">Guest passes remaining</div><div class="value">${state.remaining}</div></div>`
          : "";

      return {
        title: "Guest passes needed",
        body: `
          <div class="card">
            <div class="status-emoji">⚠️</div>
            <h1 class="headline">Not enough guest passes</h1>
            <p class="subline">Buy more at wedgewoodpool.com/guest-passes.</p>
            ${remaining}
            <div class="button-row">
              <a href="https://wedgewoodpool.com/guest-passes" class="btn-primary">Buy guest passes</a>
            </div>
          </div>`
      };
    }

    case "default":
      return {
        title: "Check in",
        body: `
          <div class="card">
            <div class="status-emoji">🏊</div>
            <h1 class="headline">Please complete the check-in form</h1>
            <p class="subline">Use the pool gate form before entering the pool area.</p>
            <div class="button-row">
              <a href="${escapeHtml(state.redirectUrl)}" class="btn-primary">Back to form</a>
            </div>
          </div>`
      };
  }
};
