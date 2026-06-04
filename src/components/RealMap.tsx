import { useEffect, useRef, useCallback, useState } from "react";
import AMapLoader from "@amap/amap-jsapi-loader";
import styles from "./RealMap.module.scss";

export interface RealMapProps {
  center?: [number, number]; // 高德坐标系 [lng, lat]
  city?: string;
  onMarkerClick?: (marker: any) => void;
}

/**
 * RealMap — 基于高德地图 JS API 的真实交互式地图
 * 显示用户位置、周边 POI、可缩放拖拽
 */
export function RealMap({
  center = [121.4379, 31.0339], // 默认徐家汇
  city = "上海",
  onMarkerClick,
}: RealMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poiList, setPoiList] = useState<Array<{ name: string; location: [number, number]; type: string }>>([]);

  // 加载高德地图 SDK
  useEffect(() => {
    if (!mapRef.current) return;

    const loadMap = async () => {
      try {
        setLoading(true);
        const AMap = await AMapLoader.load({
          key: import.meta.env.VITE_AMAP_KEY || "你的高德地图Web端Key", // 从环境变量读取
          version: "2.0",
          plugins: ["AMap.Marker", "AMap.InfoWindow", "AMap.AutoComplete", "AMap.PlaceSearch"],
        });

        // 创建地图实例
        const map = new AMap.Map(mapRef.current, {
          zoom: 15,
          center,
          mapStyle: "amap://styles/light", // 明亮风格
          resizeEnable: true,
        });

        mapInstanceRef.current = map;

        // 添加用户位置标记
        const userMarker = new AMap.Marker({
          position: center,
          title: "你的位置",
          icon: new AMap.Icon({
            size: new AMap.Size(25, 34),
            image: "https://a.amap.com/jsapi_demos/static/demo-center/icons/poi-marker-default.png",
            imageSize: new AMap.Size(25, 34),
          }),
        });

        map.add(userMarker);

        // 搜索周边 POI
        const placeSearch = new AMap.PlaceSearch({
          city,
          pageSize: 20,
          pageIndex: 1,
        });

        placeSearch.searchNearBy(
          "",
          center as [number, number],
          3000, // 3km 半径
          (_status: string, result: any) => {
            if (_status === "complete" && result.poiList) {
              const pois = result.poiList.pois
                .slice(0, 15)
                .map((poi: any) => ({
                  name: poi.name,
                  location: [poi.location.lng, poi.location.lat] as [number, number],
                  type: poi.type || "其他",
                }));
              setPoiList(pois);

              // 添加 POI 标记
              pois.forEach((poi: any) => {
                const marker = new AMap.Marker({
                  position: poi.location,
                  title: poi.name,
                  anchor: "bottom-center",
                });

                marker.on("click", () => {
                  if (onMarkerClick) {
                    onMarkerClick(marker);
                  }
                });

                map.add(marker);
              });
            }
          }
        );

        setLoading(false);
      } catch (err) {
        console.error("[RealMap] 加载高德地图失败:", err);
        setError(`地图加载失败: ${String(err)}`);
        setLoading(false);
      }
    };

    loadMap();

    // 清理
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.destroy();
        mapInstanceRef.current = null;
      }
    };
  }, [center, city, onMarkerClick]);

  // 处理 POI 点击
  const handlePoiClick = useCallback((poi: typeof poiList[0]) => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setCenter(poi.location);
      mapInstanceRef.current.setZoom(17);
    }
  }, []);

  if (error) {
    return (
      <div className={styles.mapContainer}>
        <div className={styles.mapError}>
          <p>{error}</p>
          <p className={styles.mapErrorHint}>
            请在 .env 文件中配置 VITE_AMAP_KEY（高德地图 Web 端 Key）
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.mapLayout}>
      {/* 地图容器 */}
      <div className={styles.mapContainer} ref={mapRef}>
        {loading && (
          <div className={styles.mapLoading}>
            <div className={styles.mapLoadingSpinner} />
            <p>正在加载地图...</p>
          </div>
        )}
      </div>

      {/* 右侧 POI 列表（移动端底部抽屉） */}
      <div className={styles.poiPanel}>
        <h3 className={styles.poiPanelTitle}>周边 {poiList.length} 个地点</h3>
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
                <span className={styles.poiType}>{poi.type}</span>
              </div>
            </button>
          ))}
          {poiList.length === 0 && !loading && (
            <p className={styles.poiEmpty}>暂无周边数据</p>
          )}
        </div>
      </div>
    </div>
  );
}
