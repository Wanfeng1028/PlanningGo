/**
 * 深度链接生成器单元测试
 * 覆盖：有坐标/无坐标高德导航、美团搜索、点评搜索、饿了么搜索、空 keyword 处理
 */

import { describe, it, expect } from "vitest";
import { generateDeepLink, generateAllDeepLinks } from "./deepLinks.js";

describe("generateDeepLink", () => {
  it("should generate meituan search link", () => {
    const result = generateDeepLink({
      provider: "meituan",
      poiName: "海底捞",
      action: "search",
    });
    expect(result.provider).toBe("meituan");
    expect(result.label).toBe("查看美团");
    expect(result.url).toBe("https://i.meituan.com/s/%E6%B5%B7%E5%BA%95%E6%8D%9E");
    expect(result.icon).toBe("🟡");
  });

  it("should generate dianping search link", () => {
    const result = generateDeepLink({
      provider: "dianping",
      poiName: "星巴克",
      action: "search",
    });
    expect(result.provider).toBe("dianping");
    expect(result.label).toBe("去大众点评看看");
    expect(result.url).toBe("https://m.dianping.com/search?keyword=%E6%98%9F%E5%B7%B4%E5%85%8B");
    expect(result.icon).toBe("🟠");
  });

  it("should generate eleme search link", () => {
    const result = generateDeepLink({
      provider: "eleme",
      poiName: "肯德基",
      action: "search",
    });
    expect(result.provider).toBe("eleme");
    expect(result.label).toBe("饿了么外卖");
    expect(result.url).toBe("https://h5.ele.me/search/?keyword=%E8%82%AF%E5%BE%B7%E5%9F%BA");
    expect(result.icon).toBe("🔵");
  });

  it("should generate amap navigation link with coordinates", () => {
    const result = generateDeepLink({
      provider: "amap",
      poiName: "西湖",
      lat: 30.2485,
      lng: 120.1461,
      action: "navigate",
    });
    expect(result.provider).toBe("amap");
    expect(result.label).toBe("打开高德导航");
    expect(result.url).toContain("uri.amap.com/navigation");
    expect(result.url).toContain("120.1461,30.2485");
    expect(result.url).toContain("%E8%A5%BF%E6%B9%96");
    expect(result.icon).toBe("🧭");
  });

  it("should generate amap search link without coordinates", () => {
    const result = generateDeepLink({
      provider: "amap",
      poiName: "雷峰塔",
      action: "search",
    });
    expect(result.provider).toBe("amap");
    expect(result.label).toBe("在高德查看");
    expect(result.url).toBe("https://www.amap.com/search?query=%E9%9B%B7%E5%B3%B0%E5%A1%94");
    expect(result.icon).toBe("🗺️");
  });

  it("should generate amap search link when action is not navigate", () => {
    const result = generateDeepLink({
      provider: "amap",
      poiName: "灵隐寺",
      lat: 30.2572,
      lng: 120.1093,
      action: "order",
    });
    expect(result.provider).toBe("amap");
    expect(result.label).toBe("在高德查看");
    expect(result.url).toBe("https://www.amap.com/search?query=%E7%81%B5%E9%9A%90%E5%AF%BA");
  });

  it("should handle empty poiName gracefully", () => {
    const result = generateDeepLink({
      provider: "meituan",
      poiName: "",
      action: "search",
    });
    expect(result.url).toBe("https://i.meituan.com/s/");
  });

  it("should handle special characters in poiName", () => {
    const result = generateDeepLink({
      provider: "meituan",
      poiName: "KFC (人民广场店)",
      action: "search",
    });
    // encodeURIComponent does not encode parentheses, so they remain as-is
    expect(result.url).toContain("KFC");
    expect(result.url).toContain("(");
  });
});

describe("generateAllDeepLinks", () => {
  it("should generate all 5 provider links", () => {
    const links = generateAllDeepLinks("西湖");
    expect(links).toHaveLength(5);
    expect(links.map((l) => l.provider)).toEqual(["meituan", "dianping", "eleme", "open", "amap"]);
  });

  it("should generate open map navigation link", () => {
    const openLink = generateDeepLink({
      provider: "open",
      poiName: "雷峰塔",
      action: "navigate",
    });
    expect(openLink.provider).toBe("open");
    expect(openLink.url).toContain("openstreetmap.org/directions");
  });

  it("should include coordinates in amap link when provided with navigate action", () => {
    const amapLink = generateDeepLink({
      provider: "amap",
      poiName: "雷峰塔",
      lat: 30.2476,
      lng: 120.1482,
      action: "navigate",
    });
    expect(amapLink.url).toContain("120.1482,30.2476");
    expect(amapLink.url).toContain("uri.amap.com/navigation");
  });

  it("should not contain null or undefined in any URL", () => {
    const links = generateAllDeepLinks("测试POI");
    for (const link of links) {
      expect(link.url).not.toContain("null");
      expect(link.url).not.toContain("undefined");
    }
  });

  it("should not contain null or undefined when coordinates are missing", () => {
    const links = generateAllDeepLinks("测试POI");
    for (const link of links) {
      expect(link.url).not.toContain("null");
      expect(link.url).not.toContain("undefined");
    }
  });
});
