import type { ReactNode } from "react";
import styles from "./PageTransition.module.scss";

interface PageTransitionProps {
  pageKey: string;
  children: ReactNode;
}

export function PageTransition({ pageKey, children }: PageTransitionProps) {
  return (
    <div key={pageKey} className={styles.pageEnter}>
      {children}
    </div>
  );
}
