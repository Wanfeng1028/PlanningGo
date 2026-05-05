import { routeStops } from "../data/content";
import styles from "./RouteMap.module.scss";

const pins = [
  { x: 16, y: 82 },
  { x: 31, y: 68 },
  { x: 48, y: 60 },
  { x: 62, y: 42 },
  { x: 82, y: 34 },
  { x: 78, y: 55 },
];

export function RouteMap() {
  return (
    <div className={styles.map} aria-label="杭州西湖周末路线地图">
      <div className={styles.grid} aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <span className={styles.block} key={index} />
        ))}
      </div>
      <svg className={styles.svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <path className={styles.shadowLine} d="M16 82 L31 68 L48 60 L62 42 L82 34 L78 55" />
        <path className={styles.line} d="M16 82 L31 68 L48 60 L62 42 L82 34 L78 55" />
      </svg>
      {pins.map((pin, index) => (
        <div className={styles.pin} style={{ left: `${pin.x}%`, top: `${pin.y}%` }} key={routeStops[index]}>
          <span className={styles.pinDot} aria-hidden="true" />
          <span className={styles.pinLabel}>{routeStops[index]}</span>
        </div>
      ))}
      <aside className={styles.summary}>
        <h3>路线摘要</h3>
        <p>从浙大紫金港出发，优先 40 分钟内可达。步行段不超过 2.2km，晚餐提前锁桌。</p>
        <div className={styles.metrics}>
          <span className={styles.metric}>
            <span className={styles.value}>4.5h</span>
            <span className={styles.label}>总时长</span>
          </span>
          <span className={styles.metric}>
            <span className={styles.value}>￥420</span>
            <span className={styles.label}>预算</span>
          </span>
        </div>
      </aside>
    </div>
  );
}
