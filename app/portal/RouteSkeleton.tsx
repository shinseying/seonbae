import styles from "./route-skeleton.module.css";

// Every portal tab is a force-dynamic server page, so each one waits on its
// queries before anything paints. app/portal/loading.tsx does not cover them:
// a loading.tsx only stands in for the segment it sits in, and /portal is
// already on screen when a tab is opened from the rail. Each tab therefore
// needs its own boundary, and they all draw from this one placeholder.
//
// The variant decides the shapes below the heading so a tab's placeholder
// matches what actually lands there.
type Variant = "rows" | "cards" | "form" | "stage";

export default function RouteSkeleton({
  label,
  variant = "rows",
  stats = false,
  back = false,
  rows = 4,
}: {
  /** Read out by screen readers while the tab loads. Korean, like the portal. */
  label: string;
  variant?: Variant;
  /** The counter strip some tabs carry beside the title. */
  stats?: boolean;
  /** Detail routes open with a back link above the title. */
  back?: boolean;
  rows?: number;
}) {
  return (
    <main className={styles.page} aria-busy="true" aria-label={label}>
      <section className={styles.shell}>
        <header>
          {back && <span className={`${styles.bar} ${styles.back}`} />}
          <span className={`${styles.bar} ${styles.kicker}`} />
          <span className={`${styles.bar} ${styles.title}`} />
          <span className={`${styles.bar} ${styles.copy}`} />
          {stats && (
            <div className={styles.stats}>
              {Array.from({ length: 3 }, (_, index) => (
                <span className={`${styles.bar} ${styles.stat}`} key={index} />
              ))}
            </div>
          )}
        </header>

        {variant === "rows" && (
          <div className={styles.rows}>
            {Array.from({ length: rows }, (_, index) => (
              <span className={`${styles.bar} ${styles.row}`} key={index} />
            ))}
          </div>
        )}

        {variant === "cards" && (
          <div className={styles.cards}>
            {Array.from({ length: rows }, (_, index) => (
              <span className={`${styles.bar} ${styles.card}`} key={index} />
            ))}
          </div>
        )}

        {variant === "form" && (
          <div className={styles.fields}>
            {Array.from({ length: rows }, (_, index) => (
              <div key={index}>
                <span className={`${styles.bar} ${styles.label}`} />
                <span className={`${styles.bar} ${styles.field}`} />
              </div>
            ))}
          </div>
        )}

        {variant === "stage" && <span className={`${styles.bar} ${styles.stage}`} />}
      </section>
    </main>
  );
}
