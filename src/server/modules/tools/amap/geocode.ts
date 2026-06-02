import { z } from "zod";
import { getAmapClient, AmapError } from "./client";
import { registerTool } from "../registry";
import type { ToolExecutionContext } from "../types";
import {
  AmapGeocodeInputSchema,
  AmapReverseGeocodeInputSchema,
  type AmapGeocodeInput,
  type AmapReverseGeocodeInput,
} from "./types";

/**
 * Geocoding: address -> coordinates
 */
registerTool({
  name: "amap.geocode",
  description: "Convert address to coordinates (longitude, latitude)",
  riskLevel: "read",
  budgetCost: 1,
  timeoutMs: 5000,
  inputSchema: AmapGeocodeInputSchema,
  outputSchema: z.object({
    formattedAddress: z.string(),
    province: z.string(),
    city: z.string(),
    adcode: z.string(),
    location: z.string(), // "lng,lat"
  }),
  async execute(input: AmapGeocodeInput, _ctx: ToolExecutionContext) {
    const client = getAmapClient();

    // Mock fallback if AMap not configured
    if (!client.isConfigured()) {
      return {
        formattedAddress: input.address,
        province: "浙江",
        city: input.city || "杭州",
        adcode: "330100",
        location: "120.155,30.274",
      };
    }

    try {
      const response = await client.geocode({
        address: input.address,
        city: input.city,
      });

      if (!response.geocodes?.[0]) {
        throw new Error("No geocode result found");
      }

      const geocode = response.geocodes[0];

      return {
        formattedAddress: geocode.formatted_address,
        province: geocode.province,
        city: geocode.city,
        adcode: geocode.adcode,
        location: geocode.location,
      };
    } catch (error) {
      if (error instanceof AmapError) {
        throw error;
      }
      throw new Error(`Geocoding failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

/**
 * Reverse geocoding: coordinates -> address
 */
registerTool({
  name: "amap.reverseGeocode",
  description: "Convert coordinates to address and city information",
  riskLevel: "read",
  budgetCost: 1,
  timeoutMs: 5000,
  inputSchema: AmapReverseGeocodeInputSchema,
  outputSchema: z.object({
    formattedAddress: z.string(),
    province: z.string(),
    city: z.string(),
    district: z.string(),
    adcode: z.string(),
  }),
  async execute(input: AmapReverseGeocodeInput, _ctx: ToolExecutionContext) {
    const client = getAmapClient();

    // Mock fallback if AMap not configured
    if (!client.isConfigured()) {
      return {
        formattedAddress: "浙江省杭州市西湖区",
        province: "浙江",
        city: "杭州",
        district: "西湖区",
        adcode: "330106",
      };
    }

    try {
      const response = await client.reverseGeocode({
        location: input.location,
      });

      if (!response.regeocode) {
        throw new Error("No reverse geocode result found");
      }

      const addressComponent = response.regeocode.addressComponent;

      return {
        formattedAddress: response.regeocode.formatted_address,
        province: addressComponent.province,
        city: addressComponent.city,
        district: addressComponent.district,
        adcode: addressComponent.adcode,
      };
    } catch (error) {
      if (error instanceof AmapError) {
        throw error;
      }
      throw new Error(`Reverse geocoding failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
