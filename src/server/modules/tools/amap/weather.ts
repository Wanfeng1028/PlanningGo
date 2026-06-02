import { z } from "zod";
import { getAmapClient, AmapError } from "./client";
import { registerTool } from "../registry";
import type { ToolExecutionContext } from "../types";
import {
  AmapWeatherLiveInputSchema,
  AmapWeatherForecastInputSchema,
  type AmapWeatherLiveInput,
  type AmapWeatherForecastInput,
} from "./types";

/**
 * Live weather query
 */
registerTool({
  name: "amap.weatherLive",
  description: "Get current weather conditions for a city",
  riskLevel: "read",
  budgetCost: 1,
  timeoutMs: 5000,
  inputSchema: AmapWeatherLiveInputSchema,
  outputSchema: z.object({
    province: z.string(),
    city: z.string(),
    weather: z.string(),
    temperature: z.string(),
    windDirection: z.string(),
    windPower: z.string(),
    humidity: z.string(),
    reportTime: z.string(),
  }),
  async execute(input: AmapWeatherLiveInput, _ctx: ToolExecutionContext) {
    const client = getAmapClient();

    // Mock fallback if AMap not configured
    if (!client.isConfigured()) {
      return {
        province: "浙江",
        city: input.city,
        weather: "晴",
        temperature: "25",
        windDirection: "东南风",
        windPower: "3级",
        humidity: "60",
        reportTime: new Date().toISOString(),
      };
    }

    try {
      const response = await client.weatherLive({ city: input.city });

      if (!response.lives?.[0]) {
        throw new Error("No weather data found");
      }

      const live = response.lives[0];

      return {
        province: live.province,
        city: live.city,
        weather: live.weather,
        temperature: live.temperature,
        windDirection: live.winddirection,
        windPower: live.windpower,
        humidity: live.humidity,
        reportTime: live.reporttime,
      };
    } catch (error) {
      if (error instanceof AmapError) {
        throw error;
      }
      throw new Error(`Live weather query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});

/**
 * Weather forecast query
 */
registerTool({
  name: "amap.weatherForecast",
  description: "Get weather forecast for a city",
  riskLevel: "read",
  budgetCost: 1,
  timeoutMs: 5000,
  inputSchema: AmapWeatherForecastInputSchema,
  outputSchema: z.object({
    city: z.string(),
    reportTime: z.string(),
    forecasts: z.array(
      z.object({
        date: z.string(),
        week: z.string(),
        dayWeather: z.string(),
        nightWeather: z.string(),
        dayTemp: z.string(),
        nightTemp: z.string(),
      }),
    ),
  }),
  async execute(input: AmapWeatherForecastInput, _ctx: ToolExecutionContext) {
    const client = getAmapClient();

    // Mock fallback if AMap not configured
    if (!client.isConfigured()) {
      return {
        city: input.city,
        reportTime: new Date().toISOString(),
        forecasts: [
          {
            date: new Date().toISOString().split("T")[0],
            week: "今天",
            dayWeather: "晴",
            nightWeather: "晴",
            dayTemp: "28",
            nightTemp: "18",
          },
          {
            date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
            week: "明天",
            dayWeather: "多云",
            nightWeather: "小雨",
            dayTemp: "26",
            nightTemp: "17",
          },
        ],
      };
    }

    try {
      const response = await client.weatherForecast({ city: input.city });

      if (!response.forecasts?.[0]) {
        throw new Error("No forecast data found");
      }

      const forecast = response.forecasts[0];

      const forecasts = (forecast.casts || []).map((cast) => ({
        date: cast.date,
        week: cast.week,
        dayWeather: cast.dayweather,
        nightWeather: cast.nightweather,
        dayTemp: cast.daytemp,
        nightTemp: cast.nighttemp,
      }));

      return {
        city: forecast.city,
        reportTime: forecast.reporttime,
        forecasts,
      };
    } catch (error) {
      if (error instanceof AmapError) {
        throw error;
      }
      throw new Error(`Weather forecast query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  },
});
