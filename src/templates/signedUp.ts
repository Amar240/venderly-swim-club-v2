import { escapeHtml } from "./layout";

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

export const renderSignedUp = (opts: {
  status: string;
  name: string;
  tier: string;
  familyMembers: string[];
  passes: number | null;
  email: string;
}): { title: string; body: string } => {
  if (opts.status === "error") {
    const email = escapeHtml(opts.email);

    return {
      title: "Signup issue",
      body: `
      <div class="card">
        <div class="icon-circle danger">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 class="headline">Something went wrong</h1>
        <p class="subline">We received your form but ran into an issue creating your membership. We'll sort it out.</p>
        <div class="info-block">
          <div class="label">What to do</div>
          <div class="value">Please contact us${email ? ` at <a href="mailto:${email}" style="color:var(--teal-700)">${email}</a>` : ""} and we'll resolve this within 24 hours.</div>
        </div>
      </div>`
    };
  }

  const name = escapeHtml(opts.name);

  return {
    title: `Welcome ${opts.name}`,
    body: `
      <div class="card">
        <div class="confetti">${renderConfetti()}</div>
        <div class="icon-circle success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <h1 class="headline">Welcome to Wedgewood, ${name}!</h1>
        <p class="subline">Your membership is active. See you at the pool!</p>
        ${opts.tier ? `<div class="info-block"><div class="label">Membership type</div><div class="value">${escapeHtml(opts.tier)}</div></div>` : ""}
        ${
          opts.familyMembers.length > 0
            ? `<div class="info-block"><div class="label">Members on this membership</div><ul class="family-list">${opts.familyMembers
                .map((member) => `<li>${escapeHtml(member.trim())}</li>`)
                .join("")}</ul></div>`
            : ""
        }
        ${
          opts.passes !== null && opts.passes > 0
            ? `<div class="info-block"><div class="label">Guest passes included</div><div class="value">${opts.passes} ${opts.passes === 1 ? "pass" : "passes"} ready to use</div></div>`
            : ""
        }
        <div class="info-block"><div class="label">Pool opens</div><div class="value">Memorial Day Weekend</div></div>
        <div class="button-row">
          <a href="https://wedgewoodpool.com" class="button">Visit pool website</a>
          <a href="https://wedgewoodpool.com/pool-rules" class="button secondary">Pool rules & hours</a>
        </div>
        <p class="countdown" style="margin-top:24px;">Watch your email for confirmation details.</p>
      </div>`
  };
};
