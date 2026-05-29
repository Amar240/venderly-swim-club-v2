import { escapeHtml, renderPillList } from "./layout";

export type SignedUpState =
  | {
      status: "success";
      name: string;
      tier: string;
      members: string[];
      passes: number | null;
    }
  | { status: "error" };

const renderConfetti = (): string => {
  const colors = ["#2196F3", "#1976D2", "#42A5F5", "#F9A825", "#2E7D32"];
  const delays = [0.02, 0.21, 0.1, 0.33, 0.14, 0.28, 0.06, 0.37, 0.18, 0.25, 0.04, 0.31];

  return Array.from({ length: 12 }, (_unused, index) => {
    const left = index * 8 + (index % 3);
    const color = colors[index % colors.length];
    const delay = delays[index];
    return `<i style="left:${left}%; background:${color}; animation-delay:${delay}s;"></i>`;
  }).join("");
};

export const renderSignedUp = (state: SignedUpState): { title: string; body: string } => {
  if (state.status === "error") {
    return {
      title: "Signup issue",
      body: `
        <div class="card">
          <div class="status-emoji">⚠️</div>
          <h1 class="headline">Something went wrong</h1>
          <p class="subline">Please contact us and we'll help finish your membership.</p>
          <div class="alert-warning">Please contact us.</div>
          <div class="button-row">
            <a href="https://wedgewoodpool.com" class="btn-secondary">Visit pool website</a>
          </div>
        </div>`
    };
  }

  const name = escapeHtml(state.name || "Member");
  const familyList = renderPillList(state.members);
  const tierBlock = state.tier
    ? `<div class="info-block"><div class="label">Membership type</div><div class="value">${escapeHtml(state.tier)}</div></div>`
    : "";
  const passesBlock =
    state.passes !== null
      ? `<div class="info-block"><div class="label">Guest passes</div><div class="value">${state.passes} ${state.passes === 1 ? "pass" : "passes"} ready to use</div></div>`
      : "";

  return {
    title: `Welcome ${state.name || "Member"}`,
    body: `
      <div class="card">
        <div class="confetti">${renderConfetti()}</div>
        <div class="status-emoji">🎉</div>
        <h1 class="headline">Welcome to Wedgewood ${name}! 🎉</h1>
        <p class="subline">Your membership is active. See you at the pool!</p>
        ${tierBlock}
        ${
          familyList
            ? `<div class="info-block"><div class="label">Members on this membership</div>${familyList}</div>`
            : ""
        }
        ${passesBlock}
        <div class="alert-info">See you at the pool!</div>
        <div class="button-row">
          <a href="https://wedgewoodpool.com" class="btn-primary">Visit pool website</a>
        </div>
      </div>`
  };
};
