import type { BookingItem, BookingProvider, BookingResult } from './types.js'
import { env } from '../config/env.js'

export class MockBookingProvider implements BookingProvider {
  private bookings = new Map<string, BookingResult & { createdAt: Date }>()

  async createBooking(item: BookingItem): Promise<BookingResult> {
    // Simulate latency if configured
    if (env.MOCK_LATENCY_MS > 0) {
      await new Promise((r) => setTimeout(r, env.MOCK_LATENCY_MS))
    } else {
      await new Promise((r) => setTimeout(r, Math.random() * 200 + 100))
    }

    // Check if this booking should fail (MOCK_BOOKING_FAILURES)
    const failureTypes = env.MOCK_BOOKING_FAILURES
    const failureType = item.metadata?.['failureType'] as string | undefined
    const stepType = item.metadata?.['stepType'] as string | undefined
    const displayName = item.name

    if (failureTypes.length > 0) {
      // no_seat: 模拟热门活动/餐厅没有剩余座位
      if (failureTypes.includes('no_seat') && (stepType === 'book_restaurant' || stepType === 'reserve_activity')) {
        throw new Error(`【${displayName}】预约失败：当前时段已无可用座位，建议调整时间或选择其他门店。`)
      }
      // no_ticket: 模拟景点/场馆门票售罄
      if (failureTypes.includes('no_ticket') && (stepType === 'buy_ticket' || stepType === 'reserve_activity')) {
        throw new Error(`【${displayName}】预约失败：当日门票已售罄，建议改期或选择其他日期。`)
      }
      // time_conflict: 模拟时间冲突
      if (failureTypes.includes('time_conflict') && failureType === 'time_conflict') {
        throw new Error(`【${displayName}】预约失败：与已有行程时间冲突，建议调整时间顺序。`)
      }
    }

    const code = `BK-${Date.now().toString(36).toUpperCase()}`
    const result: BookingResult & { createdAt: Date } = {
      confirmationCode: code,
      status: 'confirmed',
      item,
      estimatedCost: item.metadata?.['cost'] as number | undefined,
      notes: 'Mock booking confirmed',
      createdAt: new Date(),
    }
    this.bookings.set(code, result)
    return result
  }

  async cancelBooking(confirmationCode: string): Promise<{ success: boolean }> {
    await new Promise((r) => setTimeout(r, 100))
    const booking = this.bookings.get(confirmationCode)
    if (!booking) return { success: false }
    booking.status = 'confirmed'
    return { success: true }
  }

  async getBookingStatus(confirmationCode: string): Promise<{ status: string }> {
    const booking = this.bookings.get(confirmationCode)
    return { status: booking?.status || 'not_found' }
  }
}
