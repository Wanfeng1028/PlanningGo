import styles from "./RealMap.module.scss";

export type MapProvider = "amap" | "osm";

export interface MapSelectorProps {
  value: MapProvider;
  onChange: (provider: MapProvider) => void;
}

/**
 * MapSelector — 地图提供商切换开关
 *
 * 高德地图：国内 POI 数据更准确，但需要 API Key 且个人开发者有调用限额
 * OpenStreetMap：完全免费开源，无需 API Key，全球覆盖
 */
export function MapSelector({ value, onChange }: MapSelectorProps) {
  return (
    <div className={styles.mapSelector}>
      <button
        className={`${styles.mapSelectorBtn} ${value === "amap" ? styles.active : ""}`}
        type="button"
        onClick={() => onChange("amap")}
      >
        🗺️ 高德地图
      </button>
      <button
        className={`${styles.mapSelectorBtn} ${value === "osm" ? styles.active : ""}`}
        type="button"
        onClick={() => onChange("osm")}
      >
        🌍 OpenStreetMap
      </button>
    </div>
  );
}
