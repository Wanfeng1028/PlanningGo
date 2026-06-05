import { useEffect, useRef, useCallback, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import { getNearbyPois, type NearbyPoi } from "../lib/api";
import styles from "./RealMap.module.scss";

export interface RealMapProps {
  center?: [number, number]; // 高德坐标系 [lng, lat]
  city?: string;
  onMarkerClick?: (marker: any) => void;
}

type MapPoi = {
  id: string;
  name: string;
  address?: string;
  location: [number, number];
  type: string;
  distance?: number;
    source: "amap" | "open" | "mock";
};

/** SDK 加载超时（毫秒） */
const SDK_LOAD_TIMEOUT = 15_000;
const DEFAULT_CENTER: [number, number] = [121.4379, 31.0339];

/* ═══════════════════════════════════════════
   SDK 加载函数
   ═══════════════════════════════════════════

   每次组件挂载都重新加载 SDK，避免单例模式导致的时序问题
*/

function loadSdk(): Promise<any> {
  return Promise.race([
    AMapLoader.load({
      key: import.meta.env.VITE_AMAP_KEY || "",
      version: "2.0",
      plugins: [
        "AMap.Marker",
        "AMap.InfoWindow",
        "AMap.AutoComplete",
        "AMap.PlaceSearch",
      ],
    }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`SDK 加载超时 (${SDK_LOAD_TIMEOUT / 1000}s)`),
          ),
        SDK_LOAD_TIMEOUT,
      ),
    ),
  ]);
}

/**
 * RealMap — 基于高德地图 JS API 的真实交互式地图
 *
 * 关键设计：地图容器 div 通过 document.createElement 创建，
 * 完全不进入 React 的 fiber 树。这样 AMap SDK 对 DOM 的任意
 * 修改都不会干扰 React 的 reconciliation，避免 removeChild
 * NotFoundError。
 */
export function RealMap({
  center = DEFAULT_CENTER,
  city = "上海",
  onMarkerClick,
}: RealMapProps) {
  /** React 管理的挂载点（空的 wrapper div） */
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  /** AMap 实际使用的容器（由 document.createElement 创建，不在 React 树中） */
  const mapContainerElRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  // 用 ref 存储最新 props，避免每次渲染创建新数组导致 useEffect 无限循环
  const centerRef = useRef(center);
  const cityRef = useRef(city);
  const onMarkerClickRef = useRef(onMarkerClick);
  const poiMarkersRef = useRef<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poiList, setPoiList] = useState<MapPoi[]>([]);
  const [poiLoading, setPoiLoading] = useState(false);
  const [poiFallback, setPoiFallback] = useState(false);
  const [poiMessage, setPoiMessage] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [mapStyle, setMapStyle] = useState<"standard" | "satellite">("standard");
  const [poiPanelVisible, setPoiPanelVisible] = useState(true);

  // 将 ref 更新移到 useEffect 中，避免在渲染期间修改 ref
  useEffect(() => {
    centerRef.current = center;
    cityRef.current = city;
    onMarkerClickRef.current = onMarkerClick;
  }, [center, city, onMarkerClick]);

  const renderPoiMarkers = useCallback((pois: MapPoi[]) => {
    const map = mapInstanceRef.current;
    const AMap = (window as any).AMap;
    if (!map || !AMap) return;

    if (poiMarkersRef.current.length > 0) {
      try {
        map.remove(poiMarkersRef.current);
      } catch {
        // ignore stale marker cleanup
      }
      poiMarkersRef.current = [];
    }

    const markers = pois.slice(0, 12).map((poi) => {
      const marker = new AMap.Marker({
        position: poi.location,
        title: poi.name,
        anchor: "bottom-center",
      });
      marker.on("click", () => {
        onMarkerClickRef.current?.(marker);
      });
      return marker;
    });
    if (markers.length > 0) map.add(markers);
    poiMarkersRef.current = markers;
  }, []);

  const loadNearbyPois = useCallback(async (targetCenter = centerRef.current, targetCity = cityRef.current) => {
    setPoiLoading(true);
    setPoiMessage(null);
    try {
      const result = await getNearbyPois({
        lng: targetCenter[0],
        lat: targetCenter[1],
        city: targetCity || "上海",
        radius: 3000,
        provider: "amap",
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

  // 只在 mount 时加载地图（空依赖数组），通过 ref 获取最新 center/city
  useEffect(() => {
    let destroyed = false;
    const abortController = new AbortController();

    // ── 在 React 树之外创建地图容器 ──
    // AMap SDK 初始化后会深度修改容器内部 DOM（添加 canvas、
    // 覆盖层等），如果这个 div 在 React fiber 树中，React 卸载时
    // 会因 DOM 不一致而抛出 removeChild NotFoundError。
    const mapContainer = document.createElement("div");
    mapContainer.style.width = "100%";
    mapContainer.style.height = "100%";
    mapContainer.style.position = "relative";
    mapContainerElRef.current = mapContainer;

    const wrapper = mapWrapperRef.current;
    if (wrapper) {
      wrapper.appendChild(mapContainer);
    }

    const loadMap = async () => {
      try {
        setLoading(true);

        // ── 检查组件是否已卸载 ──
        if (destroyed || abortController.signal.aborted) {
          console.warn("[RealMap] 组件已卸载，取消地图初始化");
          return;
        }

        // ── 加载 SDK ──
        const AMap = await loadSdk();

        // ── 再次检查组件是否已卸载 ──
        if (destroyed || abortController.signal.aborted) {
          console.warn("[RealMap] 组件已卸载，取消地图初始化");
          return;
        }

        // ── 确保容器在 DOM 中 ──
        const wrapper = mapWrapperRef.current;
        if (!wrapper || !mapContainerElRef.current) {
          console.warn("[RealMap] 地图容器或 wrapper 不存在，跳过初始化");
          setError("地图容器异常，请退出地图视图后重新进入");
          setLoading(false);
          return;
        }

        // ── 如果容器不在 DOM 中，重新添加 ──
        if (!mapContainerElRef.current.isConnected && wrapper) {
          wrapper.appendChild(mapContainerElRef.current);
        }

        // ── 创建地图实例 ──
        const currentCenter = centerRef.current;
        const currentCity = cityRef.current;

        const map = new AMap.Map(mapContainer, {
          zoom: 15,
          center: currentCenter,
          mapStyle: mapStyle === "satellite" ? "amap://styles/satellite" : "amap://styles/normal",
          viewMode: "2D",
          pitch: 0,
          resizeEnable: true,
          dragEnable: true,
          zoomEnable: true,
          rotateEnable: false,
          pitchEnable: false,
        });

        mapInstanceRef.current = map;
        map.on("dragstart", () => setIsDragging(true));
        map.on("dragend", () => setIsDragging(false));

        // 用户位置标记
        const userMarker = new AMap.Marker({
          position: currentCenter,
          title: "你的位置",
          icon: new AMap.Icon({
            size: new AMap.Size(25, 34),
            image: "https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png",
            imageSize: new AMap.Size(25, 34),
          }),
        });
        map.add(userMarker);

        if (!destroyed) setLoading(false);
        if (!destroyed) void loadNearbyPois(currentCenter, currentCity);
      } catch (err) {
        if (destroyed) return;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[RealMap] 加载高德地图失败:", msg);

        if (msg.includes("timeout") || msg.includes("超时")) {
          setError(
            "地图 SDK 加载超时，可能被浏览器插件拦截。请关闭 AdBlock / uBlock 后刷新",
          );
        } else if (msg.includes("container") || msg.includes("not exist")) {
          setError("地图容器异常，请退出地图视图后重新进入");
        } else {
          setError("地图加载失败，请检查网络或 VITE_AMAP_KEY 配置");
        }
        setLoading(false);
      }
    };

    loadMap();

    return () => {
      destroyed = true;
      abortController.abort();

      // 先 destroy 地图（释放 WebGL 等资源）
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.destroy();
        } catch {
          // AMap destroy 可能因 DOM 变化而异常，忽略
        }
        mapInstanceRef.current = null;
      }
      poiMarkersRef.current = [];

      // 手动移除 React 树之外的容器，React 不需要知道
      if (mapContainerElRef.current?.parentNode) {
        try {
          mapContainerElRef.current.parentNode.removeChild(
            mapContainerElRef.current,
          );
        } catch {
          // 可能已被移除
        }
      }
      mapContainerElRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 当 center/city 变化时，更新地图中心和重新搜索 POI
  useEffect(() => {
    centerRef.current = center;
    cityRef.current = city;

    const map = mapInstanceRef.current;
    if (!map) return;

    // 更新中心点
    const currentCenter = centerRef.current;
    if (currentCenter && map.setCenter) {
      try {
        map.setCenter(currentCenter);
        void loadNearbyPois(currentCenter, cityRef.current);
      } catch {
        // ignore
      }
    }
  }, [center, city, loadNearbyPois]);

  // 当 mapStyle 变化时，更新地图样式
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      console.log("[RealMap] 地图实例不存在");
      return;
    }

    console.log("[RealMap] 更新地图样式:", { mapStyle });

    try {
      const style = mapStyle === "satellite" ? "amap://styles/satellite" : "amap://styles/normal";
      map.setMapStyle(style);
      console.log("[RealMap] 地图样式更新完成");
    } catch (error) {
      console.error("[RealMap] 更新地图样式失败:", error);
    }
  }, [mapStyle]);

  // 处理 POI 点击
  const handlePoiClick = useCallback(
    (poi: typeof poiList[0]) => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.setCenter(poi.location);
        mapInstanceRef.current.setZoom(17);
      }
    },
    [],
  );

  const handleRetry = useCallback(() => {
    setError(null);
    setLoading(true);
    // 重新触发初始化（通过强制重新挂载组件）
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
      {/*
        mapWrapper：React 管理的空壳 div。
        地图容器由 useEffect 中 document.createElement 创建并 append 进去，
        不在 React fiber 树中，AMap SDK 可以任意修改其内部 DOM
        而不会导致 React removeChild 错误。
      */}
      <div className={styles.mapContainer} ref={mapWrapperRef}>
        {loading && (
          <div className={styles.mapLoading}>
            <div className={styles.mapLoadingSpinner} />
            <p>正在加载地图...</p>
          </div>
        )}
      </div>

      <div className={styles.mapControls}>
        <button
          className={`${styles.mapControlBtn} ${styles.active}`}
          type="button"
          disabled
        >
          2D
        </button>
        <button
          className={`${styles.mapControlBtn} ${mapStyle === "standard" ? styles.active : ""}`}
          onClick={() => setMapStyle("standard")}
          type="button"
        >
          标准
        </button>
        <button
          className={`${styles.mapControlBtn} ${mapStyle === "satellite" ? styles.active : ""}`}
          onClick={() => setMapStyle("satellite")}
          type="button"
        >
          卫星
        </button>
      </div>

      <div className={`${styles.poiPanel} ${isDragging ? styles.poiPanelDragging : ""} ${!poiPanelVisible ? styles.poiPanelHidden : ""}`}>
        <div className={styles.poiPanelHeader}>
          <h3 className={styles.poiPanelTitle}>
            周边 {poiLoading ? "加载中" : `${poiList.length} 个地点`}
          </h3>
          <div style={{ display: "flex", gap: "4px" }}>
            <button
              className={styles.poiRefreshBtn}
              type="button"
              onClick={() => loadNearbyPois()}
              title="刷新"
            >
              🔄
            </button>
            <button
              className={styles.poiRefreshBtn}
              type="button"
              onClick={() => setPoiPanelVisible(false)}
              title="隐藏"
            >
              ✕
            </button>
          </div>
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

      {/* POI 隐藏后显示的展开按钮 */}
      {!poiPanelVisible && (
        <button
          className={styles.poiExpandBtn}
          type="button"
          onClick={() => setPoiPanelVisible(true)}
        >
          📍 显示周边地点
        </button>
      )}
    </div>
  );
}
