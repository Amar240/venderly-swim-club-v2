import axios from "axios";
import { m } from "framer-motion";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  House,
  Loader2,
  Search,
  Ticket,
  UserRound,
  UsersRound
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

const BOOKING_URL = "https://secure.venderly.us/widget/booking/GhQmK64lJqAj3TBFaMq9";

type DemoPerson = {
  firstName: string;
  lastName: string;
  age: number | null;
  isPrimary: boolean;
  relationship: string;
};

type DemoMembership = {
  id: string;
  accountHolderName: string;
  tier: string;
  guestPassesTotal: number;
  maxMembers: number;
  persons: DemoPerson[];
};

type DemoOverview = {
  club: { name: string };
  summary: {
    memberships: number;
    members: number;
    families: number;
    guestPasses: number;
    tiers: Array<{ tier: string; count: number }>;
  };
  memberships: DemoMembership[];
};

type OverviewState =
  | { status: "loading" }
  | { status: "success"; overview: DemoOverview }
  | { status: "error"; notFound: boolean };

const fullName = (person: DemoPerson): string => `${person.firstName} ${person.lastName}`.trim();

const BrandLink = () => (
  <Link className="vld-brand-link" to="/" aria-label="Venderly Aquatics home">
    <span className="vld-brandmark">
      <span className="vld-drop" aria-hidden="true" />
      <span>
        Venderly <span className="vld-brand-accent">Aquatics</span>
      </span>
    </span>
  </Link>
);

export const DemoDashboard = () => {
  const { clubId = "" } = useParams<{ clubId: string }>();
  const [state, setState] = useState<OverviewState>({ status: "loading" });
  const [query, setQuery] = useState("");

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Your Club Dashboard | Venderly Aquatics";
    const controller = new AbortController();

    const load = async (): Promise<void> => {
      try {
        const response = await api.get<DemoOverview>(`/demo/${clubId}/overview`, {
          signal: controller.signal
        });
        setState({ status: "success", overview: response.data });
        document.title = `${response.data.club.name} | Venderly Aquatics Demo`;
      } catch (error) {
        if (axios.isCancel(error)) {
          return;
        }
        setState({
          status: "error",
          notFound: axios.isAxiosError(error) && error.response?.status === 404
        });
      }
    };

    void load();
    return () => {
      controller.abort();
      document.title = previousTitle;
    };
  }, [clubId]);

  const filteredMemberships = useMemo(() => {
    if (state.status !== "success") {
      return [];
    }

    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return state.overview.memberships;
    }

    return state.overview.memberships.filter(
      (membership) =>
        membership.accountHolderName.toLowerCase().includes(normalized) ||
        membership.persons.some((person) => fullName(person).toLowerCase().includes(normalized))
    );
  }, [query, state]);

  return (
    <div className="vld vld-dashboard-page">
      <div className="vld-grid-bg" aria-hidden="true" />
      <main className="vld-dashboard-main">
        <BrandLink />

        {state.status === "loading" ? (
          <section className="vld-overview-state" aria-live="polite">
            <Loader2 className="vld-spin-icon" aria-hidden="true" />
            <h1>Building your dashboard...</h1>
            <p>Bringing your memberships and families into view.</p>
          </section>
        ) : null}

        {state.status === "error" ? (
          <section className="vld-overview-state" aria-live="assertive">
            <AlertCircle aria-hidden="true" />
            <h1>{state.notFound ? "Demo not found." : "We couldn't load this demo."}</h1>
            <p>
              {state.notFound
                ? "This demo link may have expired or does not exist."
                : "Please check your connection and try again."}
            </p>
            <Link className="vld-button vld-button-primary" to="/demo">
              <ArrowLeft aria-hidden="true" /> Create a new demo
            </Link>
          </section>
        ) : null}

        {state.status === "success" ? (
          <m.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <header className="vld-dashboard-header">
              <div>
                <span className="vld-eyebrow">Live demo</span>
                <h1>{state.overview.club.name}</h1>
                <p>This is your club, built from the file you uploaded.</p>
              </div>
            </header>

            <section className="vld-overview-stats" aria-label="Club summary">
              <article>
                <House aria-hidden="true" />
                <span>Memberships</span>
                <b>{state.overview.summary.memberships}</b>
              </article>
              <article>
                <UserRound aria-hidden="true" />
                <span>Members</span>
                <b>{state.overview.summary.members}</b>
              </article>
              <article>
                <UsersRound aria-hidden="true" />
                <span>Families</span>
                <b>{state.overview.summary.families}</b>
              </article>
              <article>
                <Ticket aria-hidden="true" />
                <span>Guest passes</span>
                <b>{state.overview.summary.guestPasses}</b>
              </article>
            </section>

            {state.overview.summary.tiers.length > 0 ? (
              <div className="vld-tier-breakdown" aria-label="Membership tier breakdown">
                <span>Membership mix</span>
                <div>
                  {state.overview.summary.tiers.map((tier) => (
                    <span className="vld-tier-pill" key={tier.tier}>
                      {tier.tier} <b>{tier.count}</b>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            <section className="vld-roster-section">
              <div className="vld-roster-heading">
                <div>
                  <span className="vld-section-kicker">Member roster</span>
                  <h2>Households at a glance</h2>
                </div>
                <label className="vld-roster-search">
                  <Search aria-hidden="true" />
                  <span className="vld-visually-hidden">Search members</span>
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search by name"
                  />
                </label>
              </div>

              <p className="vld-roster-count">
                Showing {filteredMemberships.length} of {state.overview.memberships.length} memberships
              </p>

              {filteredMemberships.length > 0 ? (
                <div className="vld-roster-grid">
                  {filteredMemberships.map((membership) => (
                    <article className="vld-family-card" key={membership.id}>
                      <header>
                        <div>
                          <h3>{membership.accountHolderName}</h3>
                          <span>{membership.persons.length === 1 ? "1 member" : `${membership.persons.length} members`}</span>
                        </div>
                        <span className="vld-tier-pill">{membership.tier}</span>
                      </header>
                      <div className="vld-family-people">
                        {membership.persons.map((person, index) => (
                          <div className="vld-family-person" key={`${fullName(person)}-${index}`}>
                            <span className="vld-person-avatar" aria-hidden="true">
                              {person.firstName.charAt(0)}{person.lastName.charAt(0)}
                            </span>
                            <div>
                              <b>{fullName(person)}</b>
                              <span>
                                {person.age === null ? "Age not provided" : `Age ${person.age}`}
                                {!person.isPrimary && person.relationship ? ` · ${person.relationship}` : ""}
                              </span>
                            </div>
                            {person.isPrimary ? <span className="vld-primary-badge">Primary</span> : null}
                          </div>
                        ))}
                      </div>
                      <footer>
                        <span>{membership.maxMembers} plan capacity</span>
                        <span>{membership.guestPassesTotal} guest passes</span>
                      </footer>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="vld-roster-empty">
                  <Search aria-hidden="true" />
                  <h3>No members match “{query}”</h3>
                  <button type="button" onClick={() => setQuery("")}>Clear search</button>
                </div>
              )}
            </section>

            <section className="vld-dashboard-cta">
              <div>
                <span className="vld-section-kicker">Your next chapter</span>
                <h2>Love what you see? Ready to make it real.</h2>
              </div>
              <a className="vld-button vld-button-primary" href={BOOKING_URL} target="_blank" rel="noopener noreferrer">
                Talk to us about going live <ExternalLink aria-hidden="true" />
              </a>
            </section>
          </m.div>
        ) : null}
      </main>
    </div>
  );
};
