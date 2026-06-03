/**
 * 外部服务深度链接生成器。
 * 为 POI 生成美团、大众点评、饿了么、高德等平台的跳转链接。
 */

export interface DeepLinkInput {
  provider: "meituan" | "dianping" | "eleme" | "amap";
  poiName: string;
  lat?: number;
  lng?: number;
  action?: "search" | "navigate" | "order";
}

export interface DeepLink {
  provider: string;
  label: string;
  url: string;
  icon: string;
}

/**
 * 生成单个深度链接
 */
export function generateDeepLink(input: DeepLinkInput): DeepLink {
  const { provider, poiName, lat, lng, action = "search" } = input;
  const encodedName = encodeURIComponent(poiName);

  switch (provider) {
    case "meituan":
      return {
        provider: "meituan",
        label: "查看美团",
        url: `https://i.meituan.com/s/${encodedName}`,
        icon: "🟡",
      };

    case "dianping":
      return {
        provider: "dianping",
        label: "去大众点评看看",
        url: `https://m.dianping.com/search?keyword=${encodedName}`,
        icon: "🟠",
      };

    case "eleme":
      return {
        provider: "eleme",
        label: "饿了么外卖",
        url: `https://h5.ele.me/search/?keyword=${encodedName}`,
        icon: "🔵",
      };

    case "amap":
      if (lat && lng && action === "navigate") {
        return {
          provider: "amap",
          label: "打开高德导航",
          url: `https://uri.amap.com/navigation?to=${lng},${lat},${encodedName}&mode=car&coordinate=gaode`,
          icon: "🧭",
        };
      }
      return {
        provider: "amap",
        label: "在高德查看",
        url: `https://www.amap.com/search?query=${encodedName}`,
        icon: "🗺️",
      };
  }
}

/**
 * 为 POI 生成所有可用的深度链接
 */
export function generateAllDeepLinks(poiName: string, lat?: number, lng?: number): DeepLink[] {
  const providers: DeepLinkInput["provider"][] = ["meituan", "dianping", "eleme", "amap"];
  return providers.map((provider) =>
    generateDeepLink({ provider, poiName, lat, lng }),
  );
}
