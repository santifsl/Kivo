import { useId, type ReactNode } from "react";
import { APP_NAME } from "@kivo/shared";
import { isEditorial, type DirectionId } from "./directions";
import styles from "./preview.module.css";

type Mode = "light" | "dark";

const BUBBLE =
  "M5 3h14a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-7.5L6 22v-4H5a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3z";

export function Frame({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.frame} aria-labelledby={`frame-${number}`}>
      <h2 id={`frame-${number}`} className={styles.frameLabel}>
        <span className={styles.frameNumber}>{number}</span>
        {title}
      </h2>
      <div className={styles.frameBody}>{children}</div>
    </section>
  );
}

/** The app mark: outlined bubble (A), silver bubble (B), or serif "k" tile (C, C+B). */
function Mark({ direction }: { direction: DirectionId }) {
  const gradient = useId();
  if (isEditorial(direction)) {
    return (
      <span className={styles.markTile} aria-hidden="true">
        {APP_NAME.charAt(0).toLowerCase()}
      </span>
    );
  }
  const glass = direction === "glass";
  return (
    <svg className={styles.markSvg} viewBox="0 0 24 24" aria-hidden="true">
      {glass ? (
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" className={styles.silverStart} />
            <stop offset="1" className={styles.silverEnd} />
          </linearGradient>
        </defs>
      ) : null}
      <path
        d={BUBBLE}
        className={glass ? styles.markSolid : styles.markOutline}
        style={glass ? { fill: `url(#${gradient})` } : undefined}
      />
      <text
        x="12"
        y="14.2"
        textAnchor="middle"
        className={glass ? styles.markLetterOnSolid : styles.markLetter}
      >
        {APP_NAME.charAt(0)}
      </text>
    </svg>
  );
}

export function Wordmark({ direction }: { direction: DirectionId }) {
  return (
    <span className={isEditorial(direction) ? styles.wordmarkSerif : styles.wordmark}>
      {isEditorial(direction) ? APP_NAME.toLowerCase() : APP_NAME}
    </span>
  );
}

function Logo({ direction }: { direction: DirectionId }) {
  return (
    <span className={styles.logo}>
      <Mark direction={direction} />
      <Wordmark direction={direction} />
    </span>
  );
}

function PrimaryButton({ direction, children }: { direction: DirectionId; children: ReactNode }) {
  return (
    <span className={styles.btnPrimary} role="presentation">
      {children}
      {direction === "ink" ? <span aria-hidden="true"> →</span> : null}
    </span>
  );
}

function SecondaryButton({ children }: { children: ReactNode }) {
  return (
    <span className={styles.btnSecondary} role="presentation">
      {children}
    </span>
  );
}

/** One emphasized phrase: plain (A), silver (B), or serif italic (C, C+B). */
function Accent({ children }: { children: ReactNode }) {
  return <em className={styles.accent}>{children}</em>;
}

// ---------------------------------------------------------------------------
// 1 · Landing hero
// ---------------------------------------------------------------------------

export function HeroSurface({ direction }: { direction: DirectionId }) {
  return (
    <div className={`${styles.dark} ${styles.landing}`}>
      <div className={styles.navPill}>
        <Logo direction={direction} />
        <span className={styles.navLinks}>
          <span>How it works</span>
          <span>Pricing</span>
          <span>Sign in</span>
        </span>
        <span className={styles.navCta}>
          <PrimaryButton direction={direction}>Start free</PrimaryButton>
        </span>
      </div>

      <div className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>AI support chat for any website</p>
          <h3 className={styles.heroTitle}>
            Support that answers from <Accent>your docs</Accent>. Nothing else.
          </h3>
          <p className={styles.heroText}>
            Upload your docs, paste one script tag, and {APP_NAME} answers visitors right away. When
            the answer isn&apos;t in your docs, it says so.
          </p>
          <div className={styles.buttonRow}>
            <PrimaryButton direction={direction}>Start free</PrimaryButton>
            <SecondaryButton>See how it works</SecondaryButton>
          </div>
        </div>

        <div className={`${styles.panel} ${styles.chatMock}`} aria-label="Chat preview">
          <div className={styles.chatHeader}>
            <span className={styles.statusDot} aria-hidden="true" />
            Acme support
          </div>
          <div className={styles.chatBody}>
            <p className={styles.msgVisitor}>Do you ship to Canada?</p>
            <p className={styles.msgBot}>
              Yes. Orders to Canada ship in 3–5 business days, tracked.
              <span className={styles.source}>From: Shipping policy.pdf</span>
            </p>
            <p className={styles.msgVisitor}>Can I pay in CAD?</p>
            <p className={styles.msgBot}>
              I don&apos;t know the answer to that. Please reach out to the team directly.
            </p>
          </div>
          <div className={styles.chatInput}>
            <span>Ask a question…</span>
            <span className={styles.sendMini}>Send</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 · Pricing
// ---------------------------------------------------------------------------

const PLAN_ROWS: [string, string, string][] = [
  ["Projects", "1", "5"],
  ["Messages / month", "100", "2,000"],
  ["Knowledge sources", "3", "25"],
  ["Button color, label, position", "Default", "Any"],
  ["“Powered by” badge", "Shown", "Hidden"],
];

export function PricingSurface({ direction }: { direction: DirectionId }) {
  return (
    <div className={`${styles.dark} ${styles.landing} ${styles.pricingWrap}`}>
      <p className={styles.eyebrow}>Pricing</p>
      <h3 className={styles.sectionTitle}>
        Start free. <Accent>Upgrade</Accent> when you grow.
      </h3>
      <div className={styles.pricing}>
        {(["Free", "Pro"] as const).map((plan, index) => (
          <div
            key={plan}
            className={`${styles.panel} ${styles.planCard} ${index === 1 ? styles.planPro : ""}`}
          >
            <div className={styles.planHead}>
              <p className={styles.planName}>{plan}</p>
              {index === 1 ? <span className={styles.badge}>Most popular</span> : null}
            </div>
            <p className={styles.planPrice}>
              <span className={styles.num}>{index === 0 ? "$0" : "$9"}</span>
              <span className={styles.planPer}>/month</span>
            </p>
            <p className={styles.planBlurb}>
              {index === 0
                ? "Everything you need to try it on one site."
                : "More sites, more messages, your own look."}
            </p>
            <dl className={styles.planRows}>
              {PLAN_ROWS.map(([label, free, pro]) => (
                <div key={label} className={styles.planRow}>
                  <dt>{label}</dt>
                  <dd className={styles.num}>{index === 0 ? free : pro}</dd>
                </div>
              ))}
            </dl>
            {index === 0 ? (
              <SecondaryButton>Start free</SecondaryButton>
            ) : (
              <PrimaryButton direction={direction}>Start free, upgrade anytime</PrimaryButton>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 · Dashboard shell
// ---------------------------------------------------------------------------

export function DashboardShell({ direction, mode }: { direction: DirectionId; mode: Mode }) {
  return (
    <div className={`${styles[mode]} ${styles.shell}`}>
      <p className={styles.modeTag}>{mode === "light" ? "Light" : "Dark"}</p>
      <aside className={styles.sidebar}>
        <Logo direction={direction} />
        <nav className={styles.sideNav} aria-label={`Dashboard (${mode})`}>
          <span className={styles.sideItemActive}>Projects</span>
          <span className={styles.sideItem}>Billing</span>
        </nav>
        <div className={styles.sideFoot}>
          <div className={styles.segmented} role="group" aria-label="Theme">
            {(["Light", "Dark", "System"] as const).map((option) => (
              <span
                key={option}
                className={option.toLowerCase() === mode ? styles.segmentActive : styles.segment}
              >
                {option}
              </span>
            ))}
          </div>
          <div className={styles.account}>
            <span className={styles.badge}>Free</span>
            <span className={styles.avatar} aria-hidden="true">
              JD
            </span>
          </div>
        </div>
      </aside>

      <div className={styles.content}>
        <div className={styles.contentHead}>
          <h3 className={styles.pageTitle}>Projects</h3>
          <p className={styles.muted}>Each project is one website with its own chat widget.</p>
        </div>

        <div className={`${styles.panel} ${styles.newProject}`}>
          <p className={styles.panelTitle}>New project</p>
          <div className={styles.inlineForm}>
            <span className={styles.input}>My website</span>
            <PrimaryButton direction={direction}>Create project</PrimaryButton>
          </div>
          <p className={styles.hint}>Free includes 1 project. Pro includes 5.</p>
        </div>

        <div className={`${styles.panel} ${styles.projectCard}`}>
          <div className={styles.projectTop}>
            <div>
              <p className={styles.projectName}>Acme Help Center</p>
              <p className={styles.hint}>Created Nov 26, 2026</p>
            </div>
            <span className={styles.statusPill}>
              <span className={styles.statusDot} aria-hidden="true" />
              Live
            </span>
          </div>
          <div className={styles.usage}>
            <p className={styles.usageLine}>
              <span className={styles.num}>38 / 100</span> messages this month
            </p>
            <div className={styles.track} aria-hidden="true">
              <span className={styles.fill} />
            </div>
            <p className={styles.hint}>Resets Dec 1</p>
          </div>
          <div className={styles.actions}>
            <PrimaryButton direction={direction}>Install</PrimaryButton>
            <SecondaryButton>Rename</SecondaryButton>
            <span className={styles.btnGhost}>Delete</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 · Sign-in card
// ---------------------------------------------------------------------------

export function SignInCard({ direction, mode }: { direction: DirectionId; mode: Mode }) {
  return (
    <div className={`${styles[mode]} ${styles.authStage}`}>
      <p className={styles.modeTag}>{mode === "light" ? "Light" : "Dark"}</p>
      <div className={`${styles.panel} ${styles.authCard}`}>
        <Logo direction={direction} />
        <h3 className={styles.authTitle}>
          Welcome <Accent>back</Accent>
        </h3>
        <p className={styles.muted}>Sign in to {APP_NAME} to manage your projects.</p>
        <span className={styles.btnSecondaryWide}>
          <span className={styles.googleDot} aria-hidden="true">
            G
          </span>
          Continue with Google
        </span>
        <p className={styles.divider}>
          <span>or</span>
        </p>
        <label className={styles.fieldLabel}>
          Email address
          <span className={styles.input}>you@company.com</span>
        </label>
        <span className={styles.btnPrimaryWide}>
          Continue
          {direction === "ink" ? <span aria-hidden="true"> →</span> : null}
        </span>
        <p className={styles.authFoot}>
          No account? <span className={styles.link}>Sign up</span>
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5 · Widget on a customer page
// ---------------------------------------------------------------------------

export function WidgetSurface({ direction }: { direction: DirectionId }) {
  return (
    <div className={styles.customerPage}>
      <div className={styles.siteNav}>
        <span className={styles.siteLogo}>Northwind Coffee</span>
        <span className={styles.siteLinks}>
          <span>Shop</span>
          <span>Subscriptions</span>
          <span>Help</span>
        </span>
      </div>
      <div className={styles.siteBody}>
        <div className={styles.siteCopy}>
          <p className={styles.siteHeading}>Fresh roasted, delivered weekly.</p>
          <span className={styles.siteLine} />
          <span className={styles.siteLine} />
          <span className={styles.siteLineShort} />
          <div className={styles.darkSwatch}>
            <span className={styles.swatchLabel}>Same launcher on a dark site</span>
            <span className={styles.launcher}>Chat</span>
          </div>
        </div>

        <div className={styles.widgetColumn}>
          <div className={styles.widgetPanel} aria-label="Open chat panel">
            <div className={styles.widgetHeader}>
              <span className={styles.statusDot} aria-hidden="true" />
              <span className={styles.widgetTitle}>How can we help?</span>
              <span className={styles.close} aria-hidden="true">
                ×
              </span>
            </div>
            <div className={styles.widgetBody}>
              <p className={styles.wBot}>Hi! Ask me anything about Northwind orders.</p>
              <p className={styles.wVisitor}>Can I change my grind size after ordering?</p>
              <p className={styles.wBot}>
                Yes, within 2 hours of ordering. Reply to your confirmation email with the new
                grind.
              </p>
            </div>
            <div className={styles.widgetInput}>
              <span className={styles.widgetField}>Ask a question…</span>
              <span className={styles.widgetSend}>Send</span>
            </div>
            <p className={styles.poweredBy}>
              Powered by <Wordmark direction={direction} />
            </p>
          </div>
          <span className={styles.launcher}>Chat</span>
        </div>
      </div>
    </div>
  );
}
