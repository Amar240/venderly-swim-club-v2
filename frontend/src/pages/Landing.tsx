import {
  BarChart3,
  Bot,
  Check,
  ClipboardList,
  ContactRound,
  CreditCard,
  FileUp,
  LayoutDashboard,
  LockKeyhole,
  Rocket,
  ScanLine,
  ScrollText,
  ShieldCheck,
  Shirt,
  Sparkles,
  Ticket,
  Users,
  X,
  Zap,
  type LucideIcon
} from "lucide-react";
import { m, useReducedMotion } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SplashBrand } from "../components/SplashBrand";
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
    title: "Upload your member file",
    description: "Drop in the list you already keep, CSV or Excel. Any column layout, however messy it looks."
  },
  {
    icon: Sparkles,
    title: "It reads your columns",
    description: "Splash Manager works out which column is which automatically, so you never have to reformat your spreadsheet first."
  },
  {
    icon: LayoutDashboard,
    title: "See your club, built",
    description: "Browse your real memberships, families, and guest passes in a live dashboard made from your own file."
  },
  {
    icon: Rocket,
    title: "Make it real",
    description: "Like what you see? Book a walkthrough and we will get your club set up on Splash Manager for the season."
  }
];

const features: MarketingCard[] = [
  {
    icon: Users,
    title: "Family memberships",
    description: "Households, members, renewals, and status, organized from the start."
  },
  {
    icon: ScanLine,
    title: "QR & tap check-in",
    description: "Scan passes and confirm access in seconds, even when the gate is slammed."
  },
  {
    icon: Ticket,
    title: "Guest passes",
    description: "Sell and track guest access without paper cards or end-of-day guesswork."
  },
  {
    icon: CreditCard,
    title: "Events & payments",
    description: "Collect for memberships, parties, lessons, and events in one clean flow."
  },
  {
    icon: ContactRound,
    title: "Member CRM",
    description: "Families, guests, notes, and history connected in one shared view."
  },
  {
    icon: Bot,
    title: "Ask your data",
    description: "Ask plain questions like \"which memberships expire next month?\" and get answers from your own records."
  },
  {
    icon: Shirt,
    title: "Club merch",
    description: "Sell branded gear with no inventory, boxes, or shipping headaches."
  },
  {
    icon: BarChart3,
    title: "Clear reporting",
    description: "Give your board a clean picture of what happened and what needs attention."
  }
];

const painPoints: MarketingCard[] = [
  {
    icon: ClipboardList,
    title: "The gate slows everyone down",
    description: "Front-desk staff hunt for accounts, confirm status, and check guest passes while the line backs up on a busy Saturday."
  },
  {
    icon: Zap,
    title: "Revenue leaks when tools are scattered",
    description: "Memberships, guest passes, parties, and merch are hard to grow when they live across five different tools."
  },
  {
    icon: ContactRound,
    title: "Nobody sees the full member story",
    description: "Families renew, visit, bring guests, and ask questions. It should all live in one place, not five."
  }
];

const securityPoints: MarketingCard[] = [
  {
    icon: LockKeyhole,
    title: "Role-based access",
    description: "Managers, front desk, board, and coaches each get the right level."
  },
  {
    icon: CreditCard,
    title: "Secure payments",
    description: "For memberships, passes, events, lessons, and merch."
  },
  {
    icon: ShieldCheck,
    title: "Your data stays yours",
    description: "Member and payment data stays under your club's account. No reselling."
  },
  {
    icon: ScrollText,
    title: "Activity history",
    description: "Every check-in, pass, payment, and change, tracked."
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
        <div className="vld-dash-club">Community Swim Club</div>
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
    document.title = "Splash Manager | Swim club and pool management by Venderly";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  return (
    <div className="vld">
      <nav className="vld-site-nav" aria-label="Main navigation">
        <div className="vld-wrap vld-nav-inner">
          <SplashBrand />
          <div className="vld-nav-links">
            <a href="#how">How it works</a>
            <a href="#features">Platform</a>
            <a href="#who">Who it's for</a>
          </div>
          <div className="vld-nav-actions">
            <a
              className="vld-button vld-button-ghost"
              href={BOOKING_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Book a demo
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
            <span className="vld-eyebrow">Swim club & pool management, by Venderly</span>
            <h1>
              See your swim club running.
              <br />
              <span className="vld-gradient-text">In two minutes, not two weeks.</span>
            </h1>
            <p className="vld-lede">
              Upload the member spreadsheet you already have. Splash Manager reads it and builds your club automatically,
              so you are looking at <b>your own members, families, and guest passes</b> in minutes. No setup project. No
              waiting for the season to start.
            </p>
            <div className="vld-cta-row">
              <Link className="vld-button vld-button-primary" to="/demo">
                See your club live <span aria-hidden="true">→</span>
              </Link>
              <a
                className="vld-button vld-button-ghost"
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a demo
              </a>
            </div>
            <div className="vld-microtrust">
              <span className="vld-status-dot" aria-hidden="true" />
              Try it with the member file you already have. No account needed.
            </div>
          </div>
          <DashboardMock />
        </div>
      </header>

      <div className="vld-trust">
        <div className="vld-wrap">
          <span>Swim clubs already run on Venderly:</span>
          <span className="vld-trust-chip">Wedgewood Swim Club</span>
          <span className="vld-trust-chip">Graylyn Crest Swim Club</span>
          <span>and more.</span>
        </div>
      </div>

      <main>
        <section className="vld-section">
          <div className="vld-wrap">
            <Reveal className="vld-section-title">
              <div className="vld-kicker">The everyday reality</div>
              <h2>Most pool teams are doing too much by hand</h2>
              <p>
                Binders, spreadsheets, paper passes, and one-off apps. Splash Manager brings the everyday pieces together
                so the season feels easier to run.
              </p>
            </Reveal>
            <div className="vld-pain-grid">
              {painPoints.map((point, index) => {
                const Icon = point.icon;
                return (
                  <Reveal className="vld-pain-card" delay={index * 0.07} key={point.title}>
                    <Icon aria-hidden="true" />
                    <h3>{point.title}</h3>
                    <p>{point.description}</p>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="vld-section" id="how">
          <div className="vld-wrap">
            <Reveal className="vld-section-title">
              <div className="vld-kicker">See it in two minutes</div>
              <h2>From your spreadsheet to your live club</h2>
              <p>Other tools take one to two weeks and a setup team. Splash Manager shows you your own club, today.</p>
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
              <h2>Everything to run the season, in one place</h2>
              <p>Practical tools for members, the front desk, payments, programs, communication, and reporting.</p>
            </Reveal>
            <div className="vld-features">
              {features.map((feature, index) => {
                const Icon = feature.icon;
                return (
                  <Reveal
                    className={`vld-feature${feature.title === "Ask your data" ? " vld-feature-highlight" : ""}`}
                    delay={(index % 4) * 0.07}
                    key={feature.title}
                  >
                    <Icon className="vld-feature-icon" aria-hidden="true" />
                    <h3>{feature.title}</h3>
                    <p>{feature.description}</p>
                    {feature.title === "Ask your data" ? <span className="vld-feature-tag">AI insights</span> : null}
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="vld-section vld-comparison-section">
          <div className="vld-wrap">
            <Reveal className="vld-section-title">
              <div className="vld-kicker">One system, not five</div>
              <h2>Why run the pool through five different tools?</h2>
            </Reveal>
            <div className="vld-comparison">
              <Reveal className="vld-comparison-card vld-comparison-card-bad">
                <h3>
                  <span className="vld-comparison-mark"><X aria-hidden="true" /></span> The usual scramble
                </h3>
                <ul>
                  <li>Memberships in a spreadsheet</li>
                  <li>Check-ins in a binder or basic app</li>
                  <li>Guest passes on paper logs</li>
                  <li>Payments in a separate processor</li>
                  <li>Events in one-off forms</li>
                  <li>Messages in yet another tool</li>
                </ul>
                <div className="vld-comparison-result">The team feels: endless double-entry.</div>
              </Reveal>
              <Reveal className="vld-comparison-card vld-comparison-card-good" delay={0.07}>
                <h3>
                  <span className="vld-comparison-mark"><Check aria-hidden="true" /></span> With Splash Manager
                </h3>
                <ul>
                  <li>Memberships, check-ins, and passes together</li>
                  <li>Payments, events, and lessons in one flow</li>
                  <li>Member messages and history connected</li>
                  <li>Merch and reporting built in</li>
                  <li>Answers from your own club data</li>
                  <li>One login for the whole club</li>
                </ul>
                <div className="vld-comparison-result">The result: one system, more revenue.</div>
              </Reveal>
            </div>
          </div>
        </section>

        <section className="vld-section" id="who">
          <div className="vld-wrap">
            <Reveal className="vld-section-title">
              <div className="vld-kicker">Made for</div>
              <h2>The groups that keep summer running</h2>
            </Reveal>
            <div className="vld-audiences">
              {["Community swim clubs", "HOA neighborhood pools", "Recreation centers", "Aquatic associations"].map(
                (audience, index) => (
                  <Reveal className="vld-audience" delay={index * 0.06} key={audience}>
                    {audience}
                  </Reveal>
                )
              )}
            </div>
          </div>
        </section>

        <section className="vld-section vld-security-section">
          <div className="vld-wrap">
            <Reveal className="vld-section-title">
              <div className="vld-kicker">Built to keep things in order</div>
              <h2>Real members, real money, kept organized</h2>
              <p>
                Your pool handles real member information and real money. Splash Manager keeps access, activity, and
                records clear as the club grows.
              </p>
            </Reveal>
            <div className="vld-security-grid">
              {securityPoints.map((point, index) => {
                const Icon = point.icon;
                return (
                  <Reveal className="vld-security-card" delay={index * 0.07} key={point.title}>
                    <Icon aria-hidden="true" />
                    <h3>{point.title}</h3>
                    <p>{point.description}</p>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className="vld-final" id="demo">
          <WaterMotion subtle />
          <div className="vld-wrap vld-final-inner">
            <Reveal>
              <div className="vld-eyebrow vld-final-eyebrow">Get out of the spreadsheet</div>
            </Reveal>
            <Reveal delay={0.07}>
              <h2>See your own club running in minutes</h2>
            </Reveal>
            <Reveal delay={0.14}>
              <p>
                Bring the member file you already have and watch your club get built in front of you. Or book a
                walkthrough and we will map your exact setup.
              </p>
            </Reveal>
            <Reveal className="vld-cta-row vld-final-actions" delay={0.21}>
              <Link className="vld-button vld-button-primary" to="/demo">
                See your club live <span aria-hidden="true">→</span>
              </Link>
              <a
                className="vld-button vld-button-ghost"
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Book a demo
              </a>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="vld-footer">
        <div className="vld-wrap vld-footer-inner">
          <SplashBrand compact />
          <div className="vld-powered">
            Splash Manager by <b>Venderly</b>. The operating system for swim clubs and community pools.
          </div>
          <div>© 2026 Venderly. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
};
