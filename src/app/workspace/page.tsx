import Link from "next/link";
import BrandMark from "../../components/BrandMark";
import PracticeSetupNotice from "../../components/PracticeSetupNotice";

type ModuleIconName = "staff" | "stock" | "rota" | "clinical";

const modules: {
  name: string;
  product: string;
  description: string;
  href: string;
  icon: ModuleIconName;
  tone: string;
  status: string;
}[] = [
  {
    name: "Den Staff",
    product: "People & leave",
    description: "Team profiles, holiday requests, and staff records.",
    href: "/hr/employees",
    icon: "staff",
    tone: "violet",
    status: "Team hub",
  },
  {
    name: "Den Stock",
    product: "Stock control",
    description: "Keep track of supplies, low stock, and orders.",
    href: "/stock",
    icon: "stock",
    tone: "teal",
    status: "2 items to review",
  },
  {
    name: "Den Roaster",
    product: "Team rota",
    description: "Plan weekly nurse and reception cover.",
    href: "/hr/rota",
    icon: "rota",
    tone: "amber",
    status: "This week",
  },
  {
    name: "Den OS",
    product: "Dental software",
    description: "Your dental practice workspace and clinical tools.",
    href: "/clinical",
    icon: "clinical",
    tone: "blue",
    status: "Practice hub",
  },
];

function Icon({
  name,
  size = 20,
}: {
  name: ModuleIconName | "grid" | "calendar" | "bell" | "arrow" | "chevron";
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "staff":
      return <svg {...common} aria-hidden="true"><circle cx="9" cy="8" r="3.25" /><path d="M3.5 19v-1.3a5.5 5.5 0 0 1 11 0V19M16 5.2a3.3 3.3 0 0 1 0 6.3m1.3 2.7a5.4 5.4 0 0 1 3.2 5v.8" /></svg>;
    case "stock":
      return <svg {...common} aria-hidden="true"><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" /><path d="m4.5 7.3 7.5 4 7.5-4M12 11.5V21M8 5l8 4" /></svg>;
    case "rota":
      return <svg {...common} aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17M8 13h2m4 0h2M8 16.5h2m4 0h2" /></svg>;
    case "clinical":
      return <svg {...common} aria-hidden="true"><path d="M12 21s-7.5-4.5-7.5-11a4.2 4.2 0 0 1 7.5-2.6A4.2 4.2 0 0 1 19.5 10c0 6.5-7.5 11-7.5 11Z" /><path d="M8.5 12h2l1.2-2.5 1.8 5 1.2-2.5h1.3" /></svg>;
    case "grid":
      return <svg {...common} aria-hidden="true"><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><rect x="14" y="14" width="6" height="6" rx="1.2" /></svg>;
    case "calendar":
      return <svg {...common} aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17m-12 4h.01m4 0h.01m4 0h.01m-8 3h.01m4 0h.01" /></svg>;
    case "bell":
      return <svg {...common} aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-8 12h4" /></svg>;
    case "arrow":
      return <svg {...common} aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
    case "chevron":
      return <svg {...common} aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>;
  }
}

export default function HomePage() {
  return (
    <main className="dashboard-content">
          <PracticeSetupNotice />
          <section className="welcome-row">
            <div>
              <p className="eyebrow">Your Dental Practice Hub</p>
              <h1>Good morning, Deepa <span className="wave">✳</span></h1>
              <p className="welcome-subtitle">Everything your team needs, all in one place.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link className="button-primary" href="/hr/practices">
                <Icon name="staff" size={17} /> Manage practices
              </Link>
              <Link className="button-primary" href="/hr/rota">
                <Icon name="calendar" size={17} /> View this week&apos;s rota
              </Link>
            </div>
          </section>

          <section className="overview-grid" aria-label="Today's practice overview">
            <article className="overview-card">
              <span className="overview-icon blue"><Icon name="calendar" /></span>
              <div><p>On today&apos;s rota</p><strong>12 <small>team members</small></strong></div>
              <span className="overview-foot">Across 3 surgeries</span>
            </article>
            <article className="overview-card">
              <span className="overview-icon violet"><Icon name="staff" /></span>
              <div><p>Holiday requests</p><strong>3 <small>to review</small></strong></div>
              <Link href="/hr/leave" className="overview-link">Review requests <Icon name="arrow" size={14} /></Link>
            </article>
            <article className="overview-card">
              <span className="overview-icon amber"><Icon name="stock" /></span>
              <div><p>Stock running low</p><strong>2 <small>items</small></strong></div>
              <Link href="/stock" className="overview-link">Check stock <Icon name="arrow" size={14} /></Link>
            </article>
          </section>

          <section className="section-heading">
            <div><h2>Your Den Suite products</h2><p>Pick up where you left off.</p></div>
            <span className="product-count">4 PRODUCTS</span>
          </section>

          <section className="module-grid" aria-label="Den Suite products">
            {modules.map((item) => (
              <Link className="module-card" href={item.href} key={item.name}>
                <div className="module-card-top">
                  <span className={`module-icon ${item.tone}`}><Icon name={item.icon} size={22} /></span>
                  <span className={`module-status ${item.tone}`}><span />{item.status}</span>
                </div>
                <p className="module-name">{item.name}</p>
                <h3>{item.product}</h3>
                <p className="module-description">{item.description}</p>
                <span className="module-open">Open product <Icon name="arrow" size={16} /></span>
              </Link>
            ))}
          </section>

          <section className="bottom-grid">
            <article className="week-card">
              <div className="bottom-card-heading"><div><h2>Your week at a glance</h2><p>Monday 5 – Saturday 10 October</p></div><Link href="/hr/rota">Full rota <Icon name="arrow" size={14} /></Link></div>
              <div className="week-days">
                {[
                  { day: "MON", date: "5", count: "10 on rota" },
                  { day: "TUE", date: "6", count: "12 on rota", today: true },
                  { day: "WED", date: "7", count: "11 on rota" },
                  { day: "THU", date: "8", count: "9 on rota" },
                  { day: "FRI", date: "9", count: "12 on rota" },
                  { day: "SAT", date: "10", count: "6 on rota" },
                ].map((item) => (
                  <div className={`week-day${item.today ? " today" : ""}`} key={item.day}>
                    <span>{item.day}</span><strong>{item.date}</strong><small>{item.count}</small>
                    <i className="rota-dots"><b /><b /><b /></i>
                  </div>
                ))}
              </div>
            </article>
            <article className="tip-card">
              <div className="tip-star">✦</div>
              <p className="eyebrow">A LITTLE TIP</p>
              <h2>Make leave planning easier</h2>
              <p>Keep your rota running smoothly by reviewing holiday requests as they come in.</p>
              <Link href="/hr/leave">Manage team leave <Icon name="arrow" size={14} /></Link>
            </article>
          </section>

          <footer className="dashboard-footer">
            <span>Made for the people behind every healthy smile.</span>
            <span><BrandMark small /> Den Suite <i /> UK dental practice software</span>
          </footer>
    </main>
  );
}
