import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getNearbyPois, planMapRoute, searchMapPois, type NearbyPoi } from "../lib/api";
import styles from "./RealMap.module.scss";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

export interface OpenStreetMapProps {
  /** 地图中心点，保持和高德组件一致：[lng, lat] */
  center?: [number, number];
  city?: string;
  onMarkerClick?: (marker: L.Marker) => void;
}

type MapPoi = {
  id: string;
  name: string;
  address?: string;
  /** 统一保存为 [lng, lat]，渲染到 Leaflet 前再转换 */
  location: [number, number];
  type: string;
  distance?: number;
  source: "amap" | "open" | "mock";
};

const DEFAULT_CENTER: [number, number] = [121.4379, 31.0339];
const STANDARD_TILE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const SATELLITE_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

function isValidLngLat(point: [number, number] | undefined): point is [number, number] {
  return !!point
    && Number.isFinite(point[0])
    && Number.isFinite(point[1])
    && Math.abs(point[0]) <= 180
    && Math.abs(point[1]) <= 90;
}

function normalizeLngLat(point: [number, number] | undefined): [number, number] {
  return isValidLngLat(point) ? point : DEFAULT_CENTER;
}

function toLeafletLatLng(point: [number, number]): [number, number] {
  return [point[1], point[0]];
}

function buildFallbackPois(center: [number, number], targetCity: string): MapPoi[] {
  const [lng, lat] = center;
  const cityLabel = targetCity || "当前城市";
  return [
    { id: "open-fallback-park", name: `${cityLabel}城市公园`, type: "公园 / 休闲", offset: [0.006, 0.003], distance: 680 },
    { id: "open-fallback-cafe", name: `${cityLabel}附近咖啡`, type: "咖啡 / 休息", offset: [-0.004, 0.004], distance: 520 },
    { id: "open-fallback-food", name: `${cityLabel}本地餐厅`, type: "餐厅 / 美食", offset: [0.003, -0.005], distance: 760 },
    { id: "open-fallback-metro", name: `${cityLabel}交通站点`, type: "交通 / 出行", offset: [-0.006, -0.003], distance: 840 },
  ].map((item) => ({
    id: item.id,
    name: item.name,
    type: item.type,
    distance: item.distance,
    source: "open" as const,
    address: "开源地图周边服务暂不可用，已展示可交互演示点",
    location: [lng + item.offset[0], lat + item.offset[1]] as [number, number],
  }));
}

function toMapPois(items: NearbyPoi[], fallbackType: string): MapPoi[] {
  return items
    .filter((poi) => Number.isFinite(poi.location.lng) && Number.isFinite(poi.location.lat))
    .slice(0, 12)
    .map((poi) => ({
      id: poi.id,
      name: poi.name,
      address: poi.address,
      location: [poi.location.lng, poi.location.lat],
      type: poi.type || fallbackType,
      distance: poi.distance,
      source: poi.source,
    }));
}

export function OpenStreetMap({ center: rawCenter = DEFAULT_CENTER, city = "上海", onMarkerClick }: OpenStreetMapProps) {
  const center = normalizeLngLat(rawCenter);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const poiMarkersRef = useRef<L.Marker[]>([]);
  const routeLayerRef = useRef<L.Polyline | null>(null);
  const tileLayers = useRef<Record<"standard" | "satellite", L.TileLayer | null>>({ standard: null, satellite: null });
  const centerRef = useRef(center);
  const cityRef = useRef(city);
  const onMarkerClickRef = useRef(onMarkerClick);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poiList, setPoiList] = useState<MapPoi[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiMessage, setPoiMessage] = useState<string | null>(null);
  const [routeMessage, setRouteMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mapStyle, setMapStyle] = useState<"standard" | "satellite">("standard");
  const [poiPanelVisible, setPoiPanelVisible] = useState(true);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    centerRef.current = center;
    cityRef.current = city;
    onMarkerClickRef.current = onMarkerClick;
  }, [center, city, onMarkerClick]);

  const clearPoiMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    poiMarkersRef.current.forEach((marker) => map.removeLayer(marker));
    poiMarkersRef.current = [];
  }, []);

  const renderPoiMarkers = useCallback((pois: MapPoi[]) => {
    const map = mapRef.current;
    if (!map) return;
    clearPoiMarkers();
    const markers = pois.map((poi) => {
      const marker = L.marker(toLeafletLatLng(poi.location), { title: poi.name });
      marker.bindPopup(`<b>${poi.name}</b><br/>${poi.type}${poi.address ? `<br/>${poi.address}` : ""}`);
      marker.on("click", () => onMarkerClickRef.current?.(marker));
      marker.addTo(map);
      return marker;
    });
    poiMarkersRef.current = markers;
  }, [clearPoiMarkers]);

  const loadNearbyPois = useCallback(async (targetCenter = centerRef.current, targetCity = cityRef.current) => {
    setPoiLoading(true);
    setPoiMessage(null);
    try {
      const result = await getNearbyPois({
        lng: targetCenter[0],
        lat: targetCenter[1],
        city: targetCity || "上海",
        radius: 3000,
        provider: "open",
      });
      const pois = toMapPois(result.pois, "周边地点");
      const visiblePois = pois.length > 0 ? pois : buildFallbackPois(targetCenter, targetCity);
      setPoiList(visiblePois);
      setPoiMessage(pois.length > 0 ? (result.hint ?? result.warnings?.[0] ?? null) : "开源周边服务暂未返回数据，已显示可交互演示点。");
      renderPoiMarkers(visiblePois);
    } catch {
      const fallbackPois = buildFallbackPois(targetCenter, targetCity);
      setPoiList(fallbackPois);
      setPoiMessage("开源周边服务暂不可用，已显示可交互演示点。");
      renderPoiMarkers(fallbackPois);
    } finally {
      setPoiLoading(false);
    }
  }, [renderPoiMarkers]);

  const runSearch = useCallback(async () => {
    const keyword = searchText.trim();
    if (!keyword) {
      void loadNearbyPois();
      return;
    }
    setPoiLoading(true);
    setPoiMessage(null);
    try {
      const result = await searchMapPois({
        provider: "open",
        keywords: keyword,
        city: cityRef.current || "上海",
        lng: centerRef.current[0],
        lat: centerRef.current[1],
        radius: 5000,
        pageSize: 12,
      });
      const pois = toMapPois(result.pois, "搜索结果");
      setPoiList(pois);
      setPoiMessage(result.hint ?? result.warnings?.[0] ?? null);
      renderPoiMarkers(pois);
      if (pois[0] && mapRef.current) mapRef.current.setView(toLeafletLatLng(pois[0].location), 15);
    } catch {
      setPoiList([]);
      setPoiMessage("搜索失败，请稍后重试。");
    } finally {
      setPoiLoading(false);
    }
  }, [loadNearbyPois, renderPoiMarkers, searchText]);

  const drawRouteToPoi = useCallback(async (poi: MapPoi) => {
    const map = mapRef.current;
    if (!map) return;
    setRouteMessage("正在规划路线...");
    try {
      const result = await planMapRoute({
        provider: "open",
        from: { name: "当前位置", location: { lng: centerRef.current[0], lat: centerRef.current[1] } },
        to: { name: poi.name, location: { lng: poi.location[0], lat: poi.location[1] } },
        mode: "driving",
      });
      if (routeLayerRef.current) map.removeLayer(routeLayerRef.current);
      const coordinates = result.route.coordinates ?? [];
      if (coordinates.length > 1) {
        const latLngs = coordinates.map((point) => [point.lat, point.lng] as [number, number]);
        const line = L.polyline(latLngs, { color: "#2563eb", weight: 5, opacity: 0.82 }).addTo(map);
        routeLayerRef.current = line;
        map.fitBounds(line.getBounds(), { padding: [40, 40] });
      }
      setRouteMessage(`${Math.round(result.route.distance / 1000)}km · 约 ${Math.round(result.route.duration / 60)} 分钟`);
    } catch {
      setRouteMessage("路线规划失败，请稍后重试。");
    }
  }, []);

  useEffect(() => {
    let destroyed = false;
    const mapEl = mapContainerRef.current;
    if (!mapEl) return;

    try {
      const map = L.map(mapEl, {
        center: toLeafletLatLng(center),
        zoom: 15,
        zoomControl: false,
        touchZoom: true,
        scrollWheelZoom: true,
      });
      mapRef.current = map;
      map.on("dragstart", () => setIsDragging(true));
      map.on("dragend", () => setIsDragging(false));
      L.control.zoom({ position: "topright" }).addTo(map);
      L.control.scale({ imperial: false, position: "bottomleft" }).addTo(map);

      const standard = L.tileLayer(STANDARD_TILE, {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      const satellite = L.tileLayer(SATELLITE_TILE, {
        attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
        maxZoom: 19,
      });
      tileLayers.current = { standard, satellite };
      userMarkerRef.current = L.marker(toLeafletLatLng(center), { title: "你的位置" }).bindPopup("你的位置").addTo(map);
      setTimeout(() => {
        if (!destroyed) map.invalidateSize();
      }, 100);
      setLoading(false);
      void loadNearbyPois(center, city);
    } catch {
      setError("地图加载失败，请检查网络");
      setLoading(false);
    }

    return () => {
      destroyed = true;
      clearPoiMarkers();
      if (routeLayerRef.current && mapRef.current) mapRef.current.removeLayer(routeLayerRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
      routeLayerRef.current = null;
      userMarkerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextCenter = normalizeLngLat(center);
    centerRef.current = nextCenter;
    cityRef.current = city;
    map.setView(toLeafletLatLng(nextCenter), map.getZoom());
    userMarkerRef.current?.setLatLng(toLeafletLatLng(nextCenter));
    void loadNearbyPois(nextCenter, city);
  }, [center, city, loadNearbyPois]);

  const handleStyleChange = useCallback((style: "standard" | "satellite") => {
    const map = mapRef.current;
    if (!map) return;
    const currentLayer = tileLayers.current[mapStyle];
    const nextLayer = tileLayers.current[style];
    if (currentLayer) map.removeLayer(currentLayer);
    if (nextLayer) nextLayer.addTo(map);
    setMapStyle(style);
  }, [mapStyle]);

  if (error) {
    return (
      <div className={styles.mapContainer}>
        <div className={styles.mapError}>
          <p>{error}</p>
          <button className={styles.mapRetryBtn} type="button" onClick={() => window.location.reload()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapLayout}>
      <form className={styles.mapSearch} onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
        <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索地点、餐厅、景点" />
        <button type="submit">搜索</button>
      </form>

      <div className={styles.mapContainer} ref={mapContainerRef}>
        {loading && (
          <div className={styles.mapLoading}>
            <div className={styles.mapLoadingSpinner} />
            <p>正在加载地图...</p>
          </div>
        )}
      </div>

      <div className={styles.mapControls}>
        <button className={`${styles.mapControlBtn} ${mapStyle === "standard" ? styles.active : ""}`} onClick={() => handleStyleChange("standard")} type="button">
          标准
        </button>
        <button className={`${styles.mapControlBtn} ${mapStyle === "satellite" ? styles.active : ""}`} onClick={() => handleStyleChange("satellite")} type="button">
          卫星
        </button>
      </div>

      <div className={`${styles.poiPanel} ${isDragging ? styles.poiPanelDragging : ""} ${!poiPanelVisible ? styles.poiPanelHidden : ""}`}>
        <div className={styles.poiPanelHeader}>
          <h3 className={styles.poiPanelTitle}>周边 {poiLoading ? "加载中" : `${poiList.length} 个地点`}</h3>
          <div style={{ display: "flex", gap: "4px" }}>
            <button className={styles.poiRefreshBtn} type="button" onClick={() => loadNearbyPois()} title="刷新">刷新</button>
            <button className={styles.poiRefreshBtn} type="button" onClick={() => setPoiPanelVisible(false)} title="隐藏">隐藏</button>
          </div>
        </div>
        {poiMessage && <p className={styles.poiStatus}>{poiMessage}</p>}
        {routeMessage && <p className={styles.poiStatus}>{routeMessage}</p>}
        <div className={styles.poiList}>
          {poiList.map((poi, index) => (
            <button key={`${poi.id}-${index}`} className={styles.poiItem} type="button" onClick={() => mapRef.current?.setView(toLeafletLatLng(poi.location), 17)}>
              <span className={styles.poiIcon}>点</span>
              <div className={styles.poiInfo}>
                <span className={styles.poiName}>{poi.name}</span>
                <span className={styles.poiType}>{poi.distance ? `${poi.distance}m · ` : ""}{poi.type}</span>
              </div>
              <span className={styles.poiRouteLink} onClick={(event) => { event.stopPropagation(); void drawRouteToPoi(poi); }}>
                路线
              </span>
            </button>
          ))}
          {poiList.length === 0 && !loading && !poiLoading && (
            <p className={styles.poiEmpty}>周边暂时没有返回数据，点重试或换个区域看看。</p>
          )}
        </div>
      </div>

      {!poiPanelVisible && (
        <button className={styles.poiExpandBtn} type="button" onClick={() => setPoiPanelVisible(true)}>
          显示周边地点
        </button>
      )}
    </div>
  );
}
