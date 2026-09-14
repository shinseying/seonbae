import styles from "../classroom.module.css";

// Opening a room runs several queries on the server before anything paints, and
// the /portal skeleton above does not cover this: a loading.tsx only stands in
// for the segment it sits in, and /portal is already rendered when the link is
// clicked. Without this file, "교실 열기" leaves the previous screen on the
// display with no sign that anything is happening.
//
// The shapes mirror the real page — back link, heading, code box, calendar,
// lesson rows — so the layout does not jump when the data lands.
export default function ClassroomDetailLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="교실을 여는 중">
      <section className={styles.shell}>
        <header className={styles.heading}>
          <span className={`${styles.skeleton} ${styles.skelBack}`} />
          <span className={`${styles.skeleton} ${styles.skelKicker}`} />
          <span className={`${styles.skeleton} ${styles.skelTitle}`} />
          <span className={`${styles.skeleton} ${styles.skelLine}`} />
        </header>

        <div className={styles.codeBox}>
          <div>
            <span className={`${styles.skeleton} ${styles.skelTag}`} />
            <span className={`${styles.skeleton} ${styles.skelValue}`} />
          </div>
          <div>
            <span className={`${styles.skeleton} ${styles.skelTag}`} />
            <span className={`${styles.skeleton} ${styles.skelValue}`} />
          </div>
        </div>

        <section className={styles.block}>
          <span className={`${styles.skeleton} ${styles.skelHeading}`} />
          <div className={styles.calGrid}>
            {Array.from({ length: 35 }, (_, index) => (
              <span className={styles.skelDay} key={index} />
            ))}
          </div>
        </section>

        <section className={styles.block}>
          <span className={`${styles.skeleton} ${styles.skelHeading}`} />
          {Array.from({ length: 3 }, (_, index) => (
            <span className={`${styles.skeleton} ${styles.skelRow}`} key={index} />
          ))}
        </section>
      </section>
    </main>
  );
}
