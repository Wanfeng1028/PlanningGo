import { z } from "zod";
import { getAmapClient, AmapError } from "./client";
import { registerTool } from "../registry";
import type { ToolExecutionContext } from "../types";
import {
  AmapSearchPoiTextInputSchema,
  AmapSearchPoiAroundInputSchema,
  type AmapSearchPoiTextInput,
  type AmapSearchPoiAroundInput,
} from "./types";

/**
 * Search POI by text keywords
 */
registerTool({
  name: "amap.searchPoiText",
  description: "Search for points of interest by keywords in a specific city",
  riskLevel: "read",
  budgetCost: 1,
  timeoutMs: 5000,
  inputSchema: AmapSearchPoiTextInputSchema,
  outputSchema: z.object({
    pois: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        address: z.string(),
        location: z.string(),
        distance: z.string().optional(),
        rating: z.number().optional(),
        avgPrice: z.number().optional(),
      }),
    ),
    count: z.number(),
  }),
  async execute(input: AmapSearchPoiTextInput, ctx: ToolExecutionContext) {
    const client = getAmapClient();

    // Mock fallback if AMap not configured
    if (!client.isConfigured()) {
      return {
        pois: [],
        count: 0,
      };
    }

    try {
      const response = await client.searchPoiText({
        keywords: input.keywords,
        city: input.city,
        citylimit: input.citylimit,
        offset: input.offset,
        page: input.page,
      });

      if (!response.pois) {
        return { pois: [], count: 0 };
      }

      const pois = response.pois.map((poi) => ({
        id: poi.id,
        name: poi.name,
        address: poi.address,
        location: poi.location,
        distance: poi.distance,
        rating: poi.biz_ext?.rating ? parseFloat(poi.biz_ext.rating) : undefined,
        avgPrice: poi.biz_ext?.cost ? parseFloat(poi.biz_ext.cost) : undefined,
      }));

      return {
        pois,
        count: parseInt(response.count || "0", 10),
      };
    } catch (error) {
      if (error instanceof AmapError) {
        throw error;
      }
      throw new Error(`POI search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

/**
 * Search POI around a location
 */
registerTool({
  name: "amap.searchPoiAround",
  description: "Search for points of interest around a specific location",
  riskLevel: "read",
  budgetCost: 1,
  timeoutMs: 5000,
  inputSchema: AmapSearchPoiAroundInputSchema,
  outputSchema: z.object({
    pois: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        address: z.string(),
        location: z.string(),
        distance: z.string(),
        rating: z.number().optional(),
        avgPrice: z.number().optional(),
      }),
    ),
    count: z.number(),
  }),
  async execute(input: AmapSearchPoiAroundInput, ctx: ToolExecutionContext) {
    const client = getAmapClient();

    // Mock fallback if AMap not configured
    if (!client.isConfigured()) {
      return {
        pois: [],
        count: 0,
      };
    }

    try {
      const response = await client.searchPoiAround({
        location: input.location,
        keywords: input.keywords,
        radius: input.radius,
        offset: input.offset,
      });

      if (!response.pois) {
        return { pois: [], count: 0 };
      }

      const pois = response.pois.map((poi) => ({
        id: poi.id,
        name: poi.name,
        address: poi.address,
        location: poi.location,
        distance: poi.distance,
        rating: poi.biz_ext?.rating ? parseFloat(poi.biz_ext.rating) : undefined,
        avgPrice: poi.biz_ext?.cost ? parseFloat(poi.biz_ext.cost) : undefined,
      }));

      return {
        pois,
        count: parseInt(response.count || "0", 10),
      };
    } catch (error) {
      if (error instanceof AmapError) {
        throw error;
      }
      throw new Error(`POI around search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
