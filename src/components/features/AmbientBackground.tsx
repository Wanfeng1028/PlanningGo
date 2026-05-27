import styles from "../../pages/FeaturesPage.module.scss";

/* ── Ambient Background ── */
export function AmbientBackground() {
  return (
    <div className={styles.featureAmbient} aria-hidden="true">
      <div className={styles.ambientGrid} />
      <div className={`${styles.ambientOrb} ${styles.ambientOrb1}`} />
      <div className={`${styles.ambientOrb} ${styles.ambientOrb2}`} />
      <div className={`${styles.ambientCard} ${styles.ambientCard1}`}>
        <div className={`${styles.ambientCardContent} ${styles.ambientCardContent1}`}>
          <span className={styles.ambientLabel}>今日路线</span>
          <span className={styles.ambientTitle}>朝阳公园 → 三里屯</span>
          <span className={styles.ambientMeta}><span>📍</span> 2.3km · 步行28min</span>
        </div>
      </div>
      <div className={`${styles.ambientCard} ${styles.ambientCard2}`}>
        <div className={`${styles.ambientCardContent} ${styles.ambientCardContent2}`}>
          <span className={styles.ambientIcon}>🌧️</span>
          <div className={styles.ambientText}>
            <span className={styles.ambientLabel}>备选方案</span>
            <span className={styles.ambientTitle}>雨天室内路线</span>
          </div>
        </div>
      </div>
      <div className={styles.ambientRoute}>
        <svg viewBox="0 0 200 150">
          <path d="M 10 10 C 50 10, 40 80, 100 75 S 160 130, 190 120" />
        </svg>
        <div className={styles.ambientRouteDot} />
        <div className={styles.ambientRouteDot} />
      </div>
      <div className={`${styles.ambientLine} ${styles.ambientLine1}`} />
      <div className={`${styles.ambientLine} ${styles.ambientLine2}`} />
      <div className={`${styles.ambientLine} ${styles.ambientLine3}`} />
      <div className={`${styles.ambientDot} ${styles.ambientDot1}`} />
      <div className={`${styles.ambientDot} ${styles.ambientDot2}`} />
      <div className={`${styles.ambientDot} ${styles.ambientDot3}`} />
    </div>
  );
}
