import { Map, MapPinned } from "lucide-react";
import type { MapProviderStatus } from "../lib/api";
import styles from "./RealMap.module.scss";

export type MapProvider = "amap" | "open";

export interface MapSelectorProps {
  value: MapProvider;
  onChange: (provider: MapProvider) => void;
  statuses?: Partial<Record<MapProvider, MapProviderStatus>>;
}

export function MapSelector({ value, onChange, statuses }: MapSelectorProps) {
  const amapDisabled = !statuses?.amap?.configured || !import.meta.env.VITE_AMAP_KEY;
  const amapTitle = amapDisabled
    ? "高德地图需要配置前端 VITE_AMAP_KEY 和后端 AMAP_WEB_SERVICE_KEY 后启用"
    : "切换到高德地图";

  return (
    <div className={styles.mapSelector}>
      <button
        className={`${styles.mapSelectorBtn} ${value === "open" ? styles.active : ""}`}
        type="button"
        onClick={() => onChange("open")}
        title={statuses?.open?.warnings?.[0] ?? "切换到开源地图"}
      >
        <Map size={14} />
        开源地图
      </button>
      <button
        className={`${styles.mapSelectorBtn} ${value === "amap" ? styles.active : ""}`}
        type="button"
        onClick={() => {
          if (!amapDisabled) onChange("amap");
        }}
        disabled={amapDisabled}
        title={amapTitle}
      >
        <MapPinned size={14} />
        高德地图
      </button>
      {amapDisabled && <span className={styles.mapSelectorHint}>高德待配置</span>}
    </div>
  );
}
