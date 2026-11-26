import Link from "next/link";
import { DIRECTIONS, directionFrom } from "./directions";
import styles from "./preview.module.css";
import {
  DashboardShell,
  Frame,
  HeroSurface,
  PricingSurface,
  SignInCard,
  WidgetSurface,
} from "./surfaces";

// Preview only (URK-T01): static fake data, no API calls, no Clerk. Never merged.
export default async function DesignPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const direction = directionFrom((await searchParams).dir);
  const current = DIRECTIONS.find((item) => item.id === direction) ?? DIRECTIONS[3];

  return (
    <div className={styles.page}>
      <header className={styles.toolbar}>
        <p className={styles.toolbarTitle}>Design preview · not shipped</p>
        <nav aria-label="Design directions" className={styles.tabs}>
          {DIRECTIONS.map((item) => (
            <Link
              key={item.id}
              href={`/design-preview?dir=${item.id}`}
              aria-current={item.id === direction ? "page" : undefined}
              className={styles.tab}
              scroll={false}
            >
              {item.tab}
              {item.id === "cb" ? <span className={styles.tabNote}>PO pick</span> : null}
            </Link>
          ))}
        </nav>
        <p className={styles.toolbarSummary}>{current.summary}</p>
      </header>

      <main className={styles.root} data-dir={direction}>
        <Frame number={1} title="Landing hero (dark)">
          <HeroSurface direction={direction} />
        </Frame>
        <Frame number={2} title="Landing pricing (dark)">
          <PricingSurface direction={direction} />
        </Frame>
        <Frame number={3} title="Dashboard shell · light and dark">
          <div className={styles.pair}>
            <DashboardShell direction={direction} mode="light" />
            <DashboardShell direction={direction} mode="dark" />
          </div>
        </Frame>
        <Frame number={4} title="Sign-in card · light and dark (static mock, not Clerk)">
          <div className={styles.pairNarrow}>
            <SignInCard direction={direction} mode="light" />
            <SignInCard direction={direction} mode="dark" />
          </div>
        </Frame>
        <Frame number={5} title="Chat widget on a light customer page">
          <WidgetSurface direction={direction} />
        </Frame>
      </main>
    </div>
  );
}
