import {
  FileUp,
  LayoutDashboard,
  Rocket,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Ticket,
  TrendingUp,
  Users,
  Waves,
  type LucideIcon
} from "lucide-react";
import { m, useReducedMotion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import "./landing.css";

const BOOKING_URL = "https://secure.venderly.us/widget/booking/GhQmK64lJqAj3TBFaMq9";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

type MarketingCard = {
  title: string;
  description: string;
  icon: LucideIcon;
};

const steps: MarketingCard[] = [
  {
    icon: FileUp,
    title: "Upload CSV or Excel",
    description: "Use the member spreadsheet or system export you already have. Common club layouts are recognized automatically."
  },
  {
    icon: Sparkles,
    title: "We map it for you",
    description: "Our deterministic importer recognizes common member, household, tier, and guest-pass columns."
  },
  {
    icon: LayoutDashboard,
    title: "Explore your club, live",
    description: "Your real members, families, and guest passes inside a working dashboard you can click through."
  },
  {
    icon: Rocket,
    title: "Plan your launch",
    description: "Like what you see? Book a walkthrough and we will help move your club into a production workspace."
  }
];

const features: MarketingCard[] = [
  {
    icon: Waves,
    title: "Real-time pool capacity",
    description: "See exactly who's in the pool right now, with live counts that refresh across every device at the gate."
  },
  {
    icon: ScanLine,
    title: "Tap & QR check-in",
    description: "Members check in with a tap or a scan. Seconds per family, even with a line out the door."
  },
  {
    icon: Users,
    title: "Family memberships",
    description: "Every member, including kids, spouses, and grandparents, checks in independently. No more shared logins."
  },
  {
    icon: Ticket,
    title: "Guest passes",
    description: "Track guest passes automatically as they're used, with balances the front desk can trust."
  },
  {
    icon: TrendingUp,
    title: "Reports that matter",
    description: "Peak days, attendance trends, and who hasn't visited. The numbers your board actually asks for."
  },
  {
    icon: ShieldCheck,
    title: "Your data, your control",
    description: "Powered by Venderly's secure infrastructure. No data reselling, ever. It stays yours."
  }
];

const Reveal = ({ children, className = "", delay = 0 }: RevealProps) => {
  const reducedMotion = useReducedMotion();

  return (
    <m.div
      className={className}
      initial={reducedMotion ? false : { opacity: 0, y: 22 }}
      whileInView={reducedMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.7, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </m.div>
  );
};

const Brand = ({ compact = false }: { compact?: boolean }) => (
  <span className={`vld-brandmark${compact ? " vld-brandmark-compact" : ""}`}>
    <span className="vld-drop" aria-hidden="true" />
    <span>
      Venderly <span className="vld-brand-accent">Aquatics</span>
    </span>
  </span>
);

const WaterMotion = ({ subtle = false }: { subtle?: boolean }) => (
  <div className={`vld-water-motion${subtle ? " vld-water-motion-subtle" : ""}`} aria-hidden="true">
    <span className="vld-water-shimmer" />
    <span className="vld-water-sweep" />
    <span className="vld-water-ripple vld-water-ripple-one" />
    <span className="vld-water-ripple vld-water-ripple-two" />
    <span className="vld-water-ripple vld-water-ripple-three" />
  </div>
);

const DashboardMock = () => (
  <div className="vld-dash" aria-label="Example live swim club dashboard">
    <div className="vld-dash-top">
      <div>
        <div className="vld-dash-club">Wedgewood Swim Club</div>
        <small>Saturday · 2:41 PM</small>
      </div>
      <span className="vld-live">
        <i aria-hidden="true" /> Live
      </span>
    </div>
    <div className="vld-capacity">
      <div className="vld-capacity-label">In the pool now</div>
      <div className="vld-capacity-number">
        <b>42</b>
        <span>/ 120 capacity</span>
      </div>
      <div className="vld-capacity-bar" aria-label="35 percent capacity">
        <i aria-hidden="true" />
      </div>
    </div>
    <div className="vld-member-rows">
      {[
        ["CL", "Caleb Lewis", "Family · 3 members"],
        ["IJ", "Isabella Johnson", "Family · 4 members"],
        ["LR", "Lucy Robinson", "Guest pass · 2 left"]
      ].map(([initials, name, meta]) => (
        <div className="vld-member-row" key={name}>
          <div className="vld-avatar">{initials}</div>
          <div className="vld-member-copy">
            <div className="vld-member-name">{name}</div>
            <div className="vld-member-meta">{meta}</div>
          </div>
          <span className="vld-checked-in">Checked in</span>
        </div>
      ))}
    </div>
  </div>
);

export const Landing = () => {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Venderly Aquatics | The operating system for swim clubs";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="vld">
      <nav className="vld-site-nav" aria-label="Main navigation">
        <div className="vld-wrap vld-nav-inner">
          <a href="#top" className="vld-brand-link" aria-label="Venderly Aquatics home">
            <Brand />
          </a>
          <div className="vld-nav-links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
          </div>
          <div className="vld-nav-actions">
            <a
              className="vld-button vld-button-ghost"
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a walkthrough
            </a>
            <Link className="vld-button vld-button-primary" to="/demo">
              See your club live <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
      </nav>

      <header className="vld-hero" id="top">
        <WaterMotion />
        <div className="vld-wrap vld-hero-grid">
          <div className="vld-hero-copy">
            <span className="vld-eyebrow">For swim & pool clubs</span>
            <h1>
              See your swim club
              <br />
              <span className="vld-gradient-text">running in two minutes.</span>
            </h1>
            <p className="vld-lede">
              Upload a CSV or Excel member list from the system you already use. We turn recognized layouts into a{" "}
              <b>live demo dashboard</b> on the spot. If your export needs help, our team can guide you.
            </p>
            <div className="vld-cta-row">
              <Link className="vld-button vld-button-primary" to="/demo">
                See your club in a live demo <span aria-hidden="true">→</span>
              </Link>
              <a className="vld-button vld-button-ghost" href="#how">
                How it works
              </a>
            </div>
            <div className="vld-microtrust">
              <span className="vld-status-dot" aria-hidden="true" />
              No setup call. No account. Just your file and a working demo.
            </div>
          </div>
          <DashboardMock />
        </div>
      </header>

      <div className="vld-trust">
        <div className="vld-wrap">
          <span>Clubs already run on Venderly</span>
          <span className="vld-trust-chip">Wedgewood Swim Club</span>
          <span className="vld-trust-chip">Graylyn Crest Swim Club</span>
          <span>and growing.</span>
        </div>
      </div>

      <main>
        <section className="vld-section" id="how">
          <div className="vld-wrap">
            <Reveal className="vld-section-title">
              <div className="vld-kicker">How it works</div>
              <h2>From a messy spreadsheet to a live club in one sitting</h2>
              <p>No migration project. No IT. The demo is the setup.</p>
            </Reveal>
            <div className="vld-steps">
              {steps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <Reveal className="vld-step" delay={(index % 4) * 0.07} key={step.title}>
                    <div className="vld-step-number">STEP {String(index + 1).padStart(2, "0")}</div>
                    <div className="vld-step-icon">
                      <Icon aria-hidden="true" />
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="vld-section vld-features-section" id="features">
          <div className="vld-wrap">
            <Reveal className="vld-section-title">
              <div className="vld-kicker">The platform</div>
              <h2>Everything a pool gate needs. Nothing it doesn't.</h2>
              <p>
                Built for the reality of a busy summer Saturday. It is fast, offline-tolerant, and simple enough for a
                seasonal lifeguard.
              </p>
            </Reveal>
            <div className="vld-features">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Reveal className="vld-feature" delay={(index % 3) * 0.07} key={feature.title}>
                    <Icon className="vld-feature-icon" aria-hidden="true" />
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="vld-section vld-stats-section" aria-label="Platform results">
          <div className="vld-wrap">
            <div className="vld-stats">
              {[
                ["2 min", "from your file to a live demo"],
                ["7 days", "to explore your private demo"],
                ["0", "spreadsheets at the pool gate"]
              ].map(([value, label], index) => (
                <Reveal className="vld-stat" delay={index * 0.07} key={label}>
                  <b className="vld-gradient-text">{value}</b>
                  <span>{label}</span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className="vld-final" id="demo">
          <WaterMotion subtle />
          <div className="vld-wrap vld-final-inner">
            <Reveal>
              <div className="vld-eyebrow vld-final-eyebrow">Ready when you are</div>
            </Reveal>
            <Reveal delay={0.07}>
              <h2>Bring your member list. Leave with a live club.</h2>
            </Reveal>
            <Reveal delay={0.14}>
              <p>Drop in the file you already have and watch your club come alive. No commitment and no setup call.</p>
            </Reveal>
            <Reveal className="vld-cta-row vld-final-actions" delay={0.21}>
              <Link className="vld-button vld-button-primary" to="/demo">
                See your club in a live demo <span aria-hidden="true">→</span>
              </Link>
              <a
                className="vld-button vld-button-ghost"
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a 20-min walkthrough
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="vld-footer">
        <div className="vld-wrap vld-footer-inner">
          <Brand compact />
          <div className="vld-powered">
            Powered by <b>Venderly</b>, the operating system for organizations that serve and scale.
          </div>
          <div>© 2026 Venderly. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};
