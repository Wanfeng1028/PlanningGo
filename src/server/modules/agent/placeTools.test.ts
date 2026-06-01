import { describe, expect, it, vi } from "vitest";

// Mock the AMap client
vi.mock("../tools/amap/client.js", () => ({
  getAmapClient: () => ({
    isConfigured: () => true,
    searchPoiText: vi.fn().mockResolvedValue({
      pois: [
        {
          id: "B001",
          name: "测试景点",
          address: "测试路1号",
          location: "120.1,30.2",
          distance: "1000",
          biz_ext: { rating: "4.5", cost: "120" },
        },
        {
          id: "B002",
          name: "测试餐厅",
          address: "测试路2号",
          location: "120.2,30.3",
          distance: "2000",
          biz_ext: { rating: "4.0", cost: "80" },
        },
      ],
      count: "2",
    }),
  }),
}));

import { executeSearchPlaces } from "./placeTools.js";

describe("placeTools", () => {
  it("returns places from AMap", async () => {
    const result = await executeSearchPlaces({ keywords: "景点" }, { city: "杭州" });
    expect(result.places).toHaveLength(2);
    expect(result.places[0].name).toBe("测试景点");
    expect(result.places[0].rating).toBe(4.5);
    expect(result.places[0].avgPrice).toBe(120);
    expect(result.total).toBe(2);
  });

  it("uses context city when not specified", async () => {
    const result = await executeSearchPlaces({ keywords: "餐厅" }, { city: "上海" });
    expect(result.places.length).toBeGreaterThan(0);
  });
});
