export const SHARED_STYLES = `
:root {
  --teal-500: #2196F3;
  --teal-600: #1E88E5;
  --teal-700: #1976D2;
  --navy-700: #1B3A5C;
  --navy-900: #0F1B2D;
  --aqua-50: #F0F7FA;
  --green-50: #E8F5E9;
  --green-500: #2E7D32;
  --green-700: #1B5E20;
  --yellow-50: #FFF8E1;
  --yellow-700: #F57F17;
  --red-50: #FEE2E2;
  --red-700: #B71C1C;
  --gray-200: #EEEEEE;
  --gray-500: #9E9E9E;
  --gray-700: #616161;
  --white: #FFFFFF;
}

* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
  font-family: 'Inter', -apple-system, system-ui, sans-serif;
  background: linear-gradient(180deg, var(--aqua-50) 0%, var(--white) 100%);
  color: var(--navy-900);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

.page {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-width: 480px;
  margin: 0 auto;
  padding: 0 24px;
}

.header { padding: 32px 0 24px; text-align: center; }
.logo { height: 48px; width: auto; }

.main {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px 0;
}

.card {
  position: relative;
  background: var(--white);
  border-radius: 20px;
  padding: 40px 32px;
  box-shadow: 0 8px 24px -4px rgba(27, 58, 92, 0.12);
  text-align: center;
  overflow: hidden;
  animation: fadeIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1);
}

.icon-circle {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  animation: iconPop 500ms cubic-bezier(0.34, 1.56, 0.64, 1) 200ms backwards;
}

.icon-circle.success { background: var(--green-50); color: var(--green-500); }
.icon-circle.warning { background: var(--yellow-50); color: var(--yellow-700); }
.icon-circle.danger { background: var(--red-50); color: var(--red-700); }
.icon-circle.info { background: var(--aqua-50); color: var(--teal-700); }
.icon-circle svg { width: 40px; height: 40px; }

h1.headline {
  font-size: 28px;
  font-weight: 700;
  line-height: 36px;
  margin-bottom: 12px;
  color: var(--navy-900);
}

p.subline {
  font-size: 18px;
  font-weight: 400;
  line-height: 28px;
  color: var(--gray-700);
  margin-bottom: 24px;
}

.info-block {
  background: var(--aqua-50);
  border-radius: 12px;
  padding: 20px;
  margin: 24px 0;
  text-align: left;
}

.info-block .label {
  font-size: 12px;
  font-weight: 500;
  color: var(--gray-500);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 4px;
}

.info-block .value {
  font-size: 16px;
  font-weight: 500;
  color: var(--navy-900);
}

.info-block + .info-block { margin-top: 12px; }

.family-list { list-style: none; padding: 0; margin: 12px 0 0; }

.family-list li {
  padding: 8px 0;
  border-top: 1px solid var(--gray-200);
  font-size: 14px;
  color: var(--gray-700);
}

.family-list li:first-child { border-top: none; padding-top: 0; }

.button {
  display: inline-block;
  padding: 14px 28px;
  background: var(--teal-500);
  color: var(--white);
  border-radius: 12px;
  font-size: 16px;
  font-weight: 600;
  text-decoration: none;
  margin-top: 8px;
  min-height: 48px;
  transition: background 150ms ease;
}

.button:hover, .button:active { background: var(--teal-600); }

.button.secondary {
  background: var(--white);
  color: var(--teal-700);
  border: 2px solid var(--teal-500);
}

.button-row {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 24px;
}

.countdown {
  font-size: 14px;
  color: var(--gray-500);
  margin-top: 16px;
}

.footer {
  padding: 24px 0 32px;
  text-align: center;
  color: var(--gray-500);
  font-size: 13px;
  line-height: 1.5;
}

.footer-meta { margin-top: 4px; font-size: 11px; color: var(--gray-500); }

.confetti {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 80px;
  pointer-events: none;
  overflow: hidden;
}

.confetti i {
  position: absolute;
  top: 0;
  width: 10px;
  height: 14px;
  opacity: 0;
  animation: confettiFall 2s ease-out forwards;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes iconPop {
  0% { opacity: 0; transform: scale(0); }
  60% { opacity: 1; transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

@keyframes confettiFall {
  0% { transform: translateY(-40px) rotate(0deg); opacity: 1; }
  100% { transform: translateY(200px) rotate(720deg); opacity: 0; }
}

.icon-circle.success svg { animation: drawCheck 600ms ease-out 700ms backwards; }

@keyframes drawCheck {
  from { stroke-dasharray: 0 100; }
  to { stroke-dasharray: 100 0; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    transition-duration: 0ms !important;
  }
}

@media (max-width: 380px) {
  .card { padding: 32px 24px; }
  h1.headline { font-size: 24px; line-height: 32px; }
  p.subline { font-size: 16px; line-height: 24px; }
}
`;
