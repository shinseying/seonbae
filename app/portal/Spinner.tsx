import styles from "./spinner.module.css";

// Shown wherever the portal is waiting on the server, so a slow request reads
// as work in progress rather than a frozen screen.
export default function Spinner({
  label,
  block = false,
}: {
  label?: string;
  block?: boolean;
}) {
  return (
    <span className={block ? styles.block : styles.inline} role="status" aria-live="polite">
      <span className={styles.ring} aria-hidden="true" />
      {label ? <span className={styles.label}>{label}</span> : <span className={styles.sr}>불러오는 중</span>}
    </span>
  );
}
