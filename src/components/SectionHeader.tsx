import styles from "./SectionHeader.module.scss";

interface SectionHeaderProps {
  eyebrow: string;
  title: string;
  intro: string;
}

export function SectionHeader({ eyebrow, title, intro }: SectionHeaderProps) {
  return (
    <header className={styles.header}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.intro}>{intro}</p>
    </header>
  );
}
