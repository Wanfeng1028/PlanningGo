import { z } from "zod";
import { getAmapClient, AmapError } from "./client";
import { registerTool } from "../registry";
import type { ToolExecutionContext } from "../types";
import { AmapRouteInputSchema, type AmapRouteInput } from "./types";

/**
 * Walking route planning
 */
registerTool({
  name: "amap.routeWalking",
  description: "Calculate walking route between two points",
  riskLevel: "read",
  budgetCost: 1,
  timeoutMs: 5000,
  inputSchema: AmapRouteInputSchema,
  outputSchema: z.object({
    distance: z.number(),
    duration: z.number(),
    steps: z.array(
      z.object({
        instruction: z.string(),
        distance: z.number(),
        duration: z.number(),
      }),
    ),
  }),
  async execute(input: AmapRouteInput, ctx: ToolExecutionContext) {
    const client = getAmapClient();

    // Mock fallback if AMap not configured
    if (!client.isConfigured()) {
      return {
        distance: 1000,
        duration: 720, // 12 minutes
        steps: [{ instruction: "Mock walking route", distance: 1000, duration: 720 }],
      };
    }

    try {
      const response = await client.routeWalking({
        origin: input.origin,
        destination: input.destination,
      });

      if (!response.route?.paths?.[0]) {
        throw new Error("No route found");
      }

      const path = response.route.paths[0];
      const distance = parseInt(path.distance, 10);
      const duration = parseInt(path.duration, 10);

      const steps = (path.steps || []).map((step) => ({
        instruction: step.instruction,
        distance: parseInt(step.distance, 10),
        duration: parseInt(step.duration, 10),
      }));

      return {
        distance,
        duration,
        steps,
      };
    } catch (error) {
      if (error instanceof AmapError) {
        throw error;
      }
      throw new Error(`Walking route failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

/**
 * Driving route planning
 */
registerTool({
  name: "amap.routeDriving",
  description: "Calculate driving route between two points",
  riskLevel: "read",
  budgetCost: 1,
  timeoutMs: 5000,
  inputSchema: AmapRouteInputSchema,
  outputSchema: z.object({
    distance: z.number(),
    duration: z.number(),
    steps: z.array(
      z.object({
        instruction: z.string(),
        distance: z.number(),
        duration: z.number(),
      }),
    ),
  }),
  async execute(input: AmapRouteInput, ctx: ToolExecutionContext) {
    const client = getAmapClient();

    // Mock fallback if AMap not configured
    if (!client.isConfigured()) {
      return {
        distance: 5000,
        duration: 900, // 15 minutes
        steps: [{ instruction: "Mock driving route", distance: 5000, duration: 900 }],
      };
    }

    try {
      const response = await client.routeDriving({
        origin: input.origin,
        destination: input.destination,
        strategy: input.strategy,
      });

      if (!response.route?.paths?.[0]) {
        throw new Error("No route found");
      }

      const path = response.route.paths[0];
      const distance = parseInt(path.distance, 10);
      const duration = parseInt(path.duration, 10);

      const steps = (path.steps || []).map((step) => ({
        instruction: step.instruction,
        distance: parseInt(step.distance, 10),
        duration: parseInt(step.duration, 10),
      }));

      return {
        distance,
        duration,
        steps,
      };
    } catch (error) {
      if (error instanceof AmapError) {
        throw error;
      }
      throw new Error(`Driving route failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

/**
 * Transit route planning
 */
registerTool({
  name: "amap.routeTransit",
  description: "Calculate public transit route between two points",
  riskLevel: "read",
  budgetCost: 1,
  timeoutMs: 5000,
  inputSchema: AmapRouteInputSchema,
  outputSchema: z.object({
    distance: z.number(),
    duration: z.number(),
    steps: z.array(
      z.object({
        instruction: z.string(),
        distance: z.number(),
        duration: z.number(),
      }),
    ),
  }),
  async execute(input: AmapRouteInput, ctx: ToolExecutionContext) {
    const client = getAmapClient();

    // Mock fallback if AMap not configured
    if (!client.isConfigured()) {
      return {
        distance: 6000,
        duration: 1800, // 30 minutes
        steps: [{ instruction: "Mock transit route", distance: 6000, duration: 1800 }],
      };
    }

    try {
      const response = await client.routeTransit({
        origin: input.origin,
        destination: input.destination,
        city: input.city,
      });

      if (!response.route?.paths?.[0]) {
        throw new Error("No route found");
      }

      const path = response.route.paths[0];
      const distance = parseInt(path.distance, 10);
      const duration = parseInt(path.duration, 10);

      const steps = (path.steps || []).map((step) => ({
        instruction: step.instruction,
        distance: parseInt(step.distance, 10),
        duration: parseInt(step.duration, 10),
      }));

      return {
        distance,
        duration,
        steps,
      };
    } catch (error) {
      if (error instanceof AmapError) {
        throw error;
      }
      throw new Error(`Transit route failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
