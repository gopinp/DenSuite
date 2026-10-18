"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import BrandMark from "./BrandMark";
import {
  PracticeContextProvider,
  type PracticeSummary,
} from "./PracticeContext";
import SignOutButton from "./SignOutButton";
import { getKeycloak, initializeKeycloak } from "../lib/keycloak";

const workspaceLinks = [
  { href: "/workspace", label: "Overview", icon: "grid" },
  { href: "/hr/practices", label: "Practices", icon: "practice" },
];

const productLinks = [
  { href: "/hr/employees", label: "Den Staff", icon: "staff", tone: "violet" },
  { href: "/stock", label: "Den Stock", icon: "stock", tone: "teal" },
  { href: "/hr/rota", label: "Den Roaster", icon: "rota", tone: "amber" },
  { href: "/clinical", label: "Den OS", icon: "clinical", tone: "blue" },
];

const teamLinks = [
  { href: "/hr/leave", label: "Leave", icon: "leave" },
  { href: "/hr/payroll", label: "Payroll", icon: "payroll" },
];

const pageTitles: Record<string, string> = {
  "/workspace": "Overview",
  "/hr/practices": "Practices",
  "/hr/employees": "Team members",
  "/hr/leave": "Leave",
  "/hr/rota": "Den Roaster",
  "/hr/payroll": "Payroll",
  "/stock": "Den Stock",
  "/clinical": "Den OS",
  "/admin": "Practice onboarding",
  "/admin/employers": "Employer invitations",
};

const practiceContextRoutes = new Set([
  "/hr/employees",
  "/hr/leave",
  "/hr/rota",
  "/hr/payroll",
  "/stock",
  "/clinical",
]);

const apiBase = process.env.NEXT_PUBLIC_DENTSTAFF_API_URL ?? "http://localhost:8085";

function NavigationIcon({ name }: { name: string }) {
  const props = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "grid":
      return <svg {...props} aria-hidden="true"><title>{name}</title><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></svg>;
    case "practice":
      return <svg {...props} aria-hidden="true"><title>{name}</title><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M8 9h.01M12 9h.01M16 9h.01" /></svg>;
    case "staff":
      return <svg {...props} aria-hidden="true"><title>{name}</title><circle cx="9" cy="8" r="3.25" /><path d="M3.5 19v-1.3a5.5 5.5 0 0 1 11 0V19M16 5.2a3.3 3.3 0 0 1 0 6.3m1.3 2.7a5.4 5.4 0 0 1 3.2 5v.8" /></svg>;
    case "stock":
      return <svg {...props} aria-hidden="true"><title>{name}</title><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" /><path d="m4.5 7.3 7.5 4 7.5-4M12 11.5V21" /></svg>;
    case "rota":
      return <svg {...props} aria-hidden="true"><title>{name}</title><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h2m4 0h2M8 16.5h2m4 0h2" /></svg>;
    case "clinical":
      return <svg {...props} aria-hidden="true"><title>{name}</title><path d="M12 21s-7.5-4.5-7.5-11a4.2 4.2 0 0 1 7.5-2.6A4.2 4.2 0 0 1 19.5 10c0 6.5-7.5 11-7.5 11Z" /><path d="M8.5 12h2l1.2-2.5 1.8 5 1.2-2.5h1.3" /></svg>;
    case "leave":
      return <svg {...props} aria-hidden="true"><title>{name}</title><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 14h3m2 0h3" /></svg>;
    case "payroll":
      return <svg {...props} aria-hidden="true"><title>{name}</title><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h2m4 0h2M8 16h2m4 0h2" /></svg>;
    default:
      return null;
  }
}

function SideLink({
  href,
  label,
  icon,
  tone,
  pathname,
}: {
  href: string;
  label: string;
  icon: string;
  tone?: string;
  pathname: string;
}) {
  const active = pathname === href || (href !== "/workspace" && pathname.startsWith(`${href}/`));
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`side-link${active ? " active" : ""}`}
      href={href}
    >
      {tone ? (
        <span className={`nav-product-icon ${tone}`}><NavigationIcon name={icon} /></span>
      ) : (
        <NavigationIcon name={icon} />
      )}
      <span>{label}</span>
    </Link>
  );
}

export default function SuiteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState(false);
  const [rolesResolved, setRolesResolved] = useState(false);
  const [canSelectPractice, setCanSelectPractice] = useState(false);
  const [practices, setPractices] = useState<PracticeSummary[]>([]);
  const [selectedPracticeId, setSelectedPracticeId] = useState("");
  const [practicesLoading, setPracticesLoading] = useState(true);
  const [practicesError, setPracticesError] = useState("");

  useEffect(() => {
    if (pathname === "/") return;
    let active = true;
    initializeKeycloak()
      .then(async () => {
        const keycloak = getKeycloak();
        const admin = keycloak.hasRealmRole("DENTSUITE_ADMIN");
        const allowed = keycloak.hasRealmRole("EMPLOYER")
          || keycloak.hasRealmRole("PRACTICE_MANAGER");
        if (!active) return;
        setIsAdmin(admin);
        setRolesResolved(true);
        setCanSelectPractice(allowed);
        if (!allowed) {
          setPracticesLoading(false);
          return;
        }

        await keycloak.updateToken(30);
        const response = await fetch(`${apiBase}/api/v1/accounts/practices`, {
          headers: { Authorization: `Bearer ${keycloak.token}` },
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message ?? "Practices could not be loaded.");
        }
        const loaded = (result as { practices: PracticeSummary[] }).practices;
        if (!active) return;
        setPractices(loaded);
        const storedPracticeId = window.localStorage.getItem("dentsuite:selected-practice") ?? "";
        const validStoredId = loaded.some((practice) => practice.id === storedPracticeId)
          ? storedPracticeId
          : "";
        const selectedId = validStoredId || (loaded.length === 1 ? loaded[0].id : "");
        setSelectedPracticeId(selectedId);
        if (selectedId) {
          window.localStorage.setItem("dentsuite:selected-practice", selectedId);
        } else {
          window.localStorage.removeItem("dentsuite:selected-practice");
        }
        setPracticesLoading(false);
      })
      .catch((error: unknown) => {
        console.error("Den Suite navigation could not determine the account role.", error);
        if (active) {
          setRolesResolved(true);
          setPracticesError(
            error instanceof Error ? error.message : "Practices could not be loaded.",
          );
          setPracticesLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  const selectPractice = useCallback((practiceId: string) => {
    setSelectedPracticeId(practiceId);
    if (practiceId) {
      window.localStorage.setItem("dentsuite:selected-practice", practiceId);
    } else {
      window.localStorage.removeItem("dentsuite:selected-practice");
    }
  }, []);

  if (pathname === "/") return children;

  if (!rolesResolved) {
    return <p className="practice-context-message" role="status">Loading Den Suite…</p>;
  }

  if (isAdmin) {
    return (
      <div className="portal-shell admin-only">
        <section className="portal-main">
          <header className="topbar">
            <Link href="/admin" className="brand-lockup" aria-label="Den Suite administration">
              <BrandMark />
              <span>Den <span className="brand-light">Suite</span></span>
            </Link>
            <nav className="admin-nav" aria-label="Administrator navigation">
              <Link aria-current={pathname === "/admin" ? "page" : undefined} href="/admin">
                Practice onboarding
              </Link>
              <Link
                aria-current={pathname.startsWith("/admin/employers") ? "page" : undefined}
                href="/admin/employers"
              >
                Employer invitations
              </Link>
            </nav>
            <div className="topbar-actions"><SignOutButton /></div>
          </header>
          <div className="suite-content">{pathname.startsWith("/admin") ? children : null}</div>
        </section>
      </div>
    );
  }

  const title = pageTitles[pathname] ?? "Den Suite";
  const visibleLinks = [...workspaceLinks, ...productLinks, ...teamLinks];
  const selectedPractice = practices.find((practice) => practice.id === selectedPracticeId) ?? null;

  function PracticePicker({ id, className }: { id: string; className?: string }) {
    if (!canSelectPractice || practices.length <= 1) return null;
    return (
      <label className={className} htmlFor={id}>
        <span className="sr-only">Choose practice context</span>
        <select
          id={id}
          aria-label="Choose practice context"
          onChange={(event) => selectPractice(event.target.value)}
          value={selectedPracticeId}
        >
          <option value="">Select a practice</option>
          {practices.map((practice) => (
            <option key={practice.id} value={practice.id}>{practice.name}</option>
          ))}
        </select>
      </label>
    );
  }

  const practiceContextContent = practiceContextRoutes.has(pathname) && canSelectPractice
    ? practicesLoading
      ? <p className="practice-context-message" role="status">Loading your practice options…</p>
      : practicesError
        ? (
          <p className="practice-context-error" role="alert">
            {practicesError} Refresh the page or contact support if the problem continues.
          </p>
        )
        : practices.length === 0
          ? (
            <div className="practice-context-message">
              <h1>Set up a practice to continue</h1>
              <p>Add a practice location before using Den Suite products.</p>
              <Link className="button-primary" href="/hr/practices">Set up practices</Link>
            </div>
          )
          : !selectedPractice
            ? (
              <div className="practice-context-message">
                <h1>Choose a practice</h1>
                <p>Select the practice you want to work with before opening this product.</p>
                <PracticePicker id="practice-context-prompt" className="practice-context-picker" />
              </div>
            )
            : children
    : children;

  return (
    <PracticeContextProvider value={{
      practices,
      selectedPracticeId,
      selectedPractice,
      setSelectedPracticeId: selectPractice,
      practicesLoading,
      practicesError,
      canSelectPractice,
    }}>
    <div className="portal-shell">
      <aside className="sidebar">
        <Link href="/workspace" className="brand-lockup" aria-label="Den Suite home">
          <BrandMark />
          <span>Den <span className="brand-light">Suite</span></span>
        </Link>

        <div className="practice-switcher">
          <span className="practice-avatar">D</span>
          <span className="practice-copy">
            <strong>{selectedPractice?.name ?? "Practice workspace"}</strong>
            <small>{selectedPractice ? "Current practice" : "Choose a practice"}</small>
          </span>
          <PracticePicker id="practice-context-sidebar" className="practice-switcher-select" />
        </div>

        <p className="nav-caption">WORKSPACE</p>
        <nav className="side-nav" aria-label="Workspace navigation">
          {workspaceLinks.map((item) => (
            <SideLink key={item.href} {...item} pathname={pathname} />
          ))}
        </nav>

        <p className="nav-caption products-caption">YOUR PRODUCTS</p>
        <nav className="side-nav product-nav" aria-label="Den Suite products">
          {productLinks.map((item) => (
            <SideLink key={item.href} {...item} pathname={pathname} />
          ))}
        </nav>

        <p className="nav-caption products-caption">TEAM TOOLS</p>
        <nav className="side-nav" aria-label="Team tools">
          {teamLinks.map((item) => (
            <SideLink key={item.href} {...item} pathname={pathname} />
          ))}
        </nav>

        {isAdmin && (
          <>
            <p className="nav-caption products-caption">ADMINISTRATION</p>
            <nav className="side-nav" aria-label="Administrator navigation">
              <SideLink
                href="/admin"
                label="Practice onboarding"
                icon="practice"
                pathname={pathname}
              />
            </nav>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="help-card">
            <span className="help-spark">✦</span>
            <strong>Here to help</strong>
            <p>Need a hand getting set up?</p>
            <a href="mailto:support@dentsuite.co.uk">Visit help centre</a>
          </div>
        </div>
      </aside>

      <section className="portal-main">
        <header className="topbar">
          <div className="mobile-brand"><BrandMark small /><strong>Den Suite</strong></div>
          <div className="breadcrumbs">
            <Link href="/workspace">Practice workspace</Link>
            <span aria-hidden="true">›</span>
            <strong>{title}</strong>
            {selectedPractice && <span className="context-breadcrumb">· {selectedPractice.name}</span>}
          </div>
          <div className="topbar-actions">
            <PracticePicker id="practice-context-mobile" className="practice-mobile-picker" />
            <SignOutButton />
          </div>
        </header>
        <nav className="mobile-nav" aria-label="Main navigation">
          {visibleLinks.map((item) => (
            <SideLink key={item.href} {...item} pathname={pathname} />
          ))}
          {isAdmin && (
            <SideLink href="/admin" label="Practice onboarding" icon="practice" pathname={pathname} />
          )}
        </nav>
        <div className={pathname === "/workspace" ? "" : "suite-content"}>{practiceContextContent}</div>
      </section>
    </div>
    </PracticeContextProvider>
  );
}
