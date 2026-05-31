import { describe, it, expect } from 'vitest'
import {
  hasPermission,
  requiresPermission,
  filterActionsByPermissions,
} from './permissionGuard.js'
import type { UserPermissionSnapshot } from './permissionGuard.js'

const fullPermissions: UserPermissionSnapshot = {
  locationEnabled: true,
  memoryEnabled: true,
  calendarEnabled: true,
  shareEnabled: true,
  developerEnabled: true,
  grantedScopes: [
    'location.read',
    'profile.read',
    'memory.write',
    'calendar.write',
    'navigation.open',
    'reservation.create',
    'share.send',
    'notification.send',
    'mobile.continue',
  ],
}

const minimalPermissions: UserPermissionSnapshot = {
  locationEnabled: true,
  memoryEnabled: false,
  calendarEnabled: false,
  shareEnabled: true,
  developerEnabled: false,
  grantedScopes: ['location.read', 'profile.read'],
}

describe('hasPermission', () => {
  it('should return true when scope is granted', () => {
    expect(hasPermission(fullPermissions, 'calendar.write')).toBe(true)
  })

  it('should return false when scope is not granted', () => {
    expect(hasPermission(minimalPermissions, 'calendar.write')).toBe(false)
  })

  it('should return true for profile.read on minimal permissions', () => {
    expect(hasPermission(minimalPermissions, 'profile.read')).toBe(true)
  })
})

describe('requiresPermission', () => {
  it('should map navigation to navigation.open', () => {
    expect(requiresPermission('navigation')).toBe('navigation.open')
  })

  it('should map calendar_event to calendar.write', () => {
    expect(requiresPermission('calendar_event')).toBe('calendar.write')
  })

  it('should map share_message to share.send', () => {
    expect(requiresPermission('share_message')).toBe('share.send')
  })

  it('should map restaurant_reservation to reservation.create', () => {
    expect(requiresPermission('restaurant_reservation')).toBe('reservation.create')
  })

  it('should map ticket_lock to reservation.create', () => {
    expect(requiresPermission('ticket_lock')).toBe('reservation.create')
  })

  it('should map notification to notification.send', () => {
    expect(requiresPermission('notification')).toBe('notification.send')
  })

  it('should return null for unknown action types', () => {
    expect(requiresPermission('unknown_action')).toBeNull()
    expect(requiresPermission('')).toBeNull()
  })
})

describe('filterActionsByPermissions', () => {
  const actions = [
    { type: 'navigation', title: '导航' },
    { type: 'calendar_event', title: '日历' },
    { type: 'share_message', title: '分享' },
    { type: 'unknown_type', title: '未知' },
  ]

  it('should allow all actions with full permissions', () => {
    const { allowed, blocked } = filterActionsByPermissions(actions, fullPermissions)
    expect(allowed).toHaveLength(4)
    expect(blocked).toHaveLength(0)
  })

  it('should block actions without required scope', () => {
    const { allowed, blocked } = filterActionsByPermissions(actions, minimalPermissions)
    // share.send is NOT in minimalPermissions.grantedScopes, so share_message is blocked too
    expect(allowed).toHaveLength(1) // only unknown_type (no permission needed)
    expect(blocked).toHaveLength(3) // navigation, calendar, share_message
  })

  it('should allow actions that do not require any permission', () => {
    const noPermActions = [{ type: 'view_details', title: '查看详情' }]
    const { allowed, blocked } = filterActionsByPermissions(noPermActions, minimalPermissions)
    expect(allowed).toHaveLength(1)
    expect(blocked).toHaveLength(0)
  })

  it('should handle empty actions list', () => {
    const { allowed, blocked } = filterActionsByPermissions([], fullPermissions)
    expect(allowed).toHaveLength(0)
    expect(blocked).toHaveLength(0)
  })
})