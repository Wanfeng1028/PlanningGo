import { useEffect, useRef, useCallback, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getNearbyPois, type NearbyPoi } from "../lib/api";
import styles from "./RealMap.module.scss";

// ── 修复 Leaflet 默认图标在 Webpack/Vite 中的路径问题 ──
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface OpenStreetMapProps {
  center?: [number, number]; // [lng, lat] WGS84
  city?: string;
  onMarkerClick?: (marker: L.Marker) => void;
}

const DEFAULT_CENTER: [number, number] = [121.4379, 31.0339];

/**
 * OpenStreetMap — 基于 Leaflet + OSM 的免费开源地图
 *
 * 特点：
 * - 完全免费，无需 API Key
 * - 使用 OpenStreetMap 瓦片图层
 * - 支持 POI 搜索（复用后端 getNearbyPois，自动 fallback）
 * - 与 RealMap（高德）共享相同 UI 布局
 */
export function OpenStreetMap({
  center = DEFAULT_CENTER,
  city = "上海",
  onMarkerClick,
}: OpenStreetMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const poiMarkersRef = useRef<L.Marker[]>([]);
  const onMarkerClickRef = useRef(onMarkerClick);
  const centerRef = useRef(center);
  const cityRef = useRef(city);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poiList, setPoiList] = useState<MapPoi[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiFallback, setPoiFallback] = useState(false);
  const [poiMessage, setPoiMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mapStyle, setMapStyle] = useState<"standard" | "satellite">("standard");

  type MapPoi = {
    id: string;
    name: string;
    address?: string;
    location: [number, number];
    type: string;
    distance?: number;
    source: "amap" | "mock";
  };

  // ── 瓦片图层配置 ──
  const tileLayers = useRef<Record<string, L.TileLayer>>({});

  const standardTile = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const satelliteTile = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

  // ── 渲染 POI 标记 ──
  const renderPoiMarkers = useCallback((pois: MapPoi[]) => {
    const map = mapRef.current;
    if (!map) return;

    poiMarkersRef.current.forEach((m) => map.removeLayer(m));
    poiMarkersRef.current = [];

    const markers = pois.slice(0, 12).map((poi) => {
      const marker = L.marker(poi.location, {
        title: poi.name,
      });
      marker.bindPopup(`<b>${poi.name}</b><br/>${poi.type}${poi.address ? `<br/>${poi.address}` : ""}`);
      marker.on("click", () => {
        onMarkerClickRef.current?.(marker);
      });
      return marker;
    });
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.addLayer(group);
    }
    poiMarkersRef.current = markers;
  }, []);

  // ── 加载周边 POI ──
  const loadNearbyPois = useCallback(async (targetCenter = centerRef.current, targetCity = cityRef.current) => {
    setPoiLoading(true);
    setPoiMessage(null);
    try {
      const result = await getNearbyPois({
        lng: targetCenter[0],
        lat: targetCenter[1],
        city: targetCity || "上海",
        radius: 3000,
      });
      const pois = result.pois
        .filter((poi: NearbyPoi) => Number.isFinite(poi.location.lng) && Number.isFinite(poi.location.lat))
        .slice(0, 12)
        .map((poi) => ({
          id: poi.id,
          name: poi.name,
          address: poi.address,
          location: [poi.location.lng, poi.location.lat] as [number, number],
          type: poi.type || "周边地点",
          distance: poi.distance,
          source: poi.source,
        }));
      setPoiList(pois);
      setPoiFallback(result.fallbackUsed);
      setPoiMessage(result.hint ?? null);
      renderPoiMarkers(pois);
    } catch {
      setPoiList([]);
      setPoiFallback(false);
      setPoiMessage("周边加载失败，请稍后重试。");
    } finally {
      setPoiLoading(false);
    }
  }, [renderPoiMarkers]);

  // ── 初始化 Leaflet 地图 ──
  useEffect(() => {
    let destroyed = false;

    const initMap = async () => {
      try {
        setLoading(true);
        const mapEl = mapContainerRef.current;
        if (!mapEl) {
          setError("地图容器异常");
          setLoading(false);
          return;
        }

        const currentCenter = centerRef.current;
        const currentCity = cityRef.current;

        // 创建地图实例
        const map = L.map(mapEl, {
          center: currentCenter,
          zoom: 15,
          zoomControl: false,
          touchZoom: true,
          scrollWheelZoom: true,
        });

        mapRef.current = map;

        // 拖拽状态
        map.on("dragstart", () => setIsDragging(true));
        map.on("dragend", () => setIsDragging(false));

        // 缩放控件放到右上角
        L.control.zoom({ position: "topright" }).addTo(map);

        // 比例尺放左下角
        L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

        // 加载瓦片图层
        const standardLayer = L.tileLayer(standardTile, {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }).addTo(map);
        tileLayers.current.standard = standardLayer;

        const satelliteLayer = L.tileLayer(satelliteTile, {
          attribution: '&copy; <a href="https://www.esri.com/">Esri</a> — Source: Esri, Maxar, Earthstar Geographics',
          maxZoom: 19,
        });
        tileLayers.current.satellite = satelliteLayer;

        // 用户位置标记
        const userMarker = L.marker(currentCenter, {
          title: "你的位置",
        });
        userMarker.bindPopup("📍 你的位置");
        userMarker.addTo(map);
        userMarkerRef.current = userMarker;

        if (!destroyed) setLoading(false);
        if (!destroyed) void loadNearbyPois(currentCenter, currentCity);
      } catch (err) {
        if (destroyed) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[OpenStreetMap] 加载地图失败:", msg);
        setError("地图加载失败，请检查网络");
        setLoading(false);
      }
    };

    initMap();

    return () => {
      destroyed = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
      userMarkerRef.current = null;
      poiMarkersRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 同步 props 到 ref ──
  useEffect(() => {
    onMarkerClickRef.current = onMarkerClick;
    centerRef.current = center;
    cityRef.current = city;
  }, [onMarkerClick, center, city]);

  // ── 更新中心点 ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const currentCenter = centerRef.current;
    try {
      map.setView(currentCenter, map.getZoom());
      void loadNearbyPois(currentCenter, cityRef.current);
    } catch {
      // ignore
    }
  }, [center, city, loadNearbyPois]);

  // ── 切换瓦片图层 ──
  const handleStyleChange = useCallback((style: "standard" | "satellite") => {
    setMapStyle(style);
    const map = mapRef.current;
    if (!map) return;

    const currentLayer = map.hasLayer(tileLayers.current[mapStyle])
      ? tileLayers.current[mapStyle]
      : null;
    const targetLayer = tileLayers.current[style];

    if (currentLayer) map.removeLayer(currentLayer);
    if (targetLayer) targetLayer.addTo(map);
  }, [mapStyle]);

  // ── POI 点击 ──
  const handlePoiClick = useCallback(
    (poi: MapPoi) => {
      if (mapRef.current) {
        mapRef.current.setView(poi.location, 17);
      }
    },
    [],
  );

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    window.location.reload();
  }, []);

  if (error) {
    return (
      <div className={styles.mapContainer}>
        <div className={styles.mapError}>
          <p>{error}</p>
          <button className={styles.mapRetryBtn} onClick={handleRetry}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapLayout}>
      <div className={styles.mapContainer} ref={mapContainerRef}>
        {loading && (
          <div className={styles.mapLoading}>
            <div className={styles.mapLoadingSpinner} />
            <p>正在加载地图...</p>
          </div>
        )}
      </div>

      <div className={styles.mapControls}>
        <button
          className={`${styles.mapControlBtn} ${mapStyle === "standard" ? styles.active : ""}`}
          onClick={() => handleStyleChange("standard")}
          type="button"
        >
          标准
        </button>
        <button
          className={`${styles.mapControlBtn} ${mapStyle === "satellite" ? styles.active : ""}`}
          onClick={() => handleStyleChange("satellite")}
          type="button"
        >
          卫星
        </button>
      </div>

      <div className={`${styles.poiPanel} ${isDragging ? styles.poiPanelDragging : ""}`}>
        <div className={styles.poiPanelHeader}>
          <h3 className={styles.poiPanelTitle}>
            周边 {poiLoading ? "加载中" : `${poiList.length} 个地点`}
          </h3>
          <button className={styles.poiRefreshBtn} type="button" onClick={() => loadNearbyPois()}>
            重试
          </button>
        </div>
        {(poiFallback || poiMessage) && (
          <p className={styles.poiStatus}>{poiMessage ?? "已切换为演示推荐地点"}</p>
        )}
        <div className={styles.poiList}>
          {poiList.map((poi, index) => (
            <button
              key={`${poi.name}-${index}`}
              className={styles.poiItem}
              type="button"
              onClick={() => handlePoiClick(poi)}
            >
              <span className={styles.poiIcon}>📍</span>
              <div className={styles.poiInfo}>
                <span className={styles.poiName}>{poi.name}</span>
                <span className={styles.poiType}>
                  {poi.distance ? `${poi.distance}m · ` : ""}{poi.type}{poi.source === "mock" ? " · 推荐" : ""}
                </span>
              </div>
            </button>
          ))}
          {poiList.length === 0 && !loading && !poiLoading && (
            <p className={styles.poiEmpty}>周边暂时没有返回数据，点重试或换个区域看看。</p>
          )}
        </div>
      </div>
    </div>
  );
}
