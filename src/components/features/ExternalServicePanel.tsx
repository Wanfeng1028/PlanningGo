import styles from "../../pages/FeaturesPage.module.scss";

interface DeepLink {
  provider: string;
  label: string;
  url: string;
  icon: string;
}

interface ExternalServiceStep {
  stepId: string;
  poiName: string;
  links: DeepLink[];
}

export function ExternalServicePanel({
  steps,
  expanded,
  onToggle,
}: {
  steps: ExternalServiceStep[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!steps || steps.length === 0) return null;

  return (
    <div className={styles.externalServicePanel}>
      <button
        className={styles.externalServiceToggle}
        onClick={onToggle}
      >
        🔗 外部服务 {expanded ? "▲" : "▼"}
      </button>

      {expanded && (
        <div className={styles.externalServiceBody}>
          {steps.map((step) => (
            <div key={step.stepId} className={styles.externalServiceGroup}>
              <div className={styles.externalServicePoi}>📍 {step.poiName}</div>
              <div className={styles.externalServiceLinks}>
                {step.links.map((link) => (
                  <a
                    key={link.provider}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.externalServiceLink}
                  >
                    {link.icon} {link.label}
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
