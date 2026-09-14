import styles from "./classroom.module.css";

// Same gap as the room page: entering 내 교실 from the dashboard changes this
// segment, so the /portal skeleton does not stand in for it. The room list is
// what appears here, so that is what the placeholder holds.
export default function ClassroomListLoading() {
  return (
    <main className={styles.page} aria-busy="true" aria-label="내 교실을 불러오는 중">
      <section className={styles.shell}>
        <header className={styles.heading}>
          <span className={`${styles.skeleton} ${styles.skelKicker}`} />
          <span className={`${styles.skeleton} ${styles.skelTitle}`} />
          <span className={`${styles.skeleton} ${styles.skelLine}`} />
        </header>

        <div className={styles.roomList}>
          {Array.from({ length: 3 }, (_, index) => (
            <span className={`${styles.skeleton} ${styles.skelRoom}`} key={index} />
          ))}
        </div>
      </section>
    </main>
  );
}
