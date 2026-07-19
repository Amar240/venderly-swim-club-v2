import { Link } from "react-router-dom";

export const SplashBrand = ({ compact = false }: { compact?: boolean }) => (
  <Link className="vld-brand-link" to="/" aria-label="Splash Manager home">
    <span className={`vld-brandmark${compact ? " vld-brandmark-compact" : ""}`}>
      <span className="vld-drop" aria-hidden="true" />
      <span>
        Splash <span className="vld-brand-accent">Manager</span>
      </span>
    </span>
  </Link>
);
