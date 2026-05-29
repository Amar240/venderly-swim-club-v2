import { escapeHtml, renderPillList } from "./layout";

export type GoodbyeState =
  | { status: "success"; name: string; signedOut: string[]; redirectUrl: string }
  | { status: "not_checked_in"; name: string }
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

export const renderGoodbye = (
  state: GoodbyeState
): { title: string; body: string; autoRedirectSeconds?: number; redirectUrl?: string } => {
  switch (state.status) {
    case "success": {
      const signedOutList = renderPillList(state.signedOut);

      return {
        title: `See you ${state.name || "Member"}`,
        autoRedirectSeconds: 10,
        redirectUrl: state.redirectUrl,
        body: `
          <div class="card">
            <div class="status-emoji">👋</div>
            <h1 class="headline">See you next time! 👋</h1>
            <p class="subline">Thanks for visiting Wedgewood!</p>
            ${
              signedOutList
                ? `<div class="info-block"><div class="label">Signed out</div>${signedOutList}</div>`
                : `<div class="info-block"><div class="label">Signed out</div><div class="value">${escapeHtml(state.name || "Member")}</div></div>`
            }
            ${renderCountdown()}
          </div>`
      };
    }

    case "not_checked_in":
      return {
        title: "No check-in found",
        body: `
          <div class="card">
            <div class="status-emoji">⚠️</div>
            <h1 class="headline">No active check-in found</h1>
            <p class="subline">${escapeHtml(state.name || "This member")} is not currently checked in.</p>
            <div class="alert-warning">See staff if this seems wrong.</div>
          </div>`
      };

    case "default":
      return {
        title: "Goodbye",
        body: `
          <div class="card">
            <div class="status-emoji">👋</div>
            <h1 class="headline">Thanks for visiting Wedgewood</h1>
            <p class="subline">Please complete the sign-out form before leaving.</p>
            <div class="button-row">
              <a href="${escapeHtml(state.redirectUrl)}" class="btn-primary">Back to form</a>
            </div>
          </div>`
      };
  }
};
