/**
 * SafeBookingProvider — 只创建草稿，不做真实预订
 * 
 * 用于生产环境：v1 不接入真实预订 API，所有 booking 操作仅记录意图
 */

import type {
  BookingProvider,
  BookingItem,
  BookingResult,
} from "./types.js";

let nextId = 1;

export class SafeBookingProvider implements BookingProvider {
  async createBooking(item: BookingItem): Promise<BookingResult> {
    const code = `DRAFT-${Date.now()}-${(nextId++).toString().padStart(4, "0")}`;

    return {
      confirmationCode: code,
      status: "pending",
      item,
      estimatedCost: item.metadata?.estimatedCost as number | undefined,
      notes: `草稿预订，需人工确认。预订类型: ${item.type}，名称: ${item.name}，时间: ${item.dateTime}`,
    };
  }

  async cancelBooking(confirmationCode: string): Promise<{ success: boolean }> {
    if (!confirmationCode.startsWith("DRAFT-")) {
      return { success: false };
    }
    return { success: true };
  }

  async getBookingStatus(confirmationCode: string): Promise<{ status: string }> {
    return { status: confirmationCode.startsWith("DRAFT-") ? "draft" : "unknown" };
  }
}
