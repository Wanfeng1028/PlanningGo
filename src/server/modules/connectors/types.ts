/**
 * Connector 统一接口定义
 * V3: 所有外部服务统一通过 Connector 协议访问
 */

// ============================================================================
// Provider & Capability
// ============================================================================

export type ConnectorProvider =
  | "amap"
  | "open"
  | "calendar"
  | "meituan"
  | "dianping"
  | "eleme"
  | "ticketing"
  | "mock";

export type ConnectorCapability =
  | "poi_search"
  | "route"
  | "calendar_event"
  | "restaurant_search"
  | "restaurant_reservation"
  | "food_delivery"
  | "group_buy"
  | "ticket_lock"
  | "payment_redirect"
  | "status_query";

// ============================================================================
// Search Input / Result
// ============================================================================

export interface ConnectorSearchInput {
  keyword: string;
  city?: string;
  around?: {
    lat: number;
    lng: number;
    radiusMeters?: number;
  };
  category?: string;
  limit?: number;
  userContext?: Record<string, unknown>;
}

export interface ConnectorSearchResult {
  provider: ConnectorProvider;
  externalId?: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  category?: string;
  rating?: number;
  avgPrice?: number;
  distanceMeters?: number;
  openingHours?: string;
  isOpenNow?: boolean;
  sourceUrl?: string;
  raw?: unknown;
}

// ============================================================================
// Quote / Prepare / Commit
// ============================================================================

export interface QuoteInput {
  provider: ConnectorProvider;
  actionType: string;
  poi?: ConnectorSearchResult;
  items?: Array<{
    id?: string;
    name: string;
    quantity: number;
    price?: number;
  }>;
  partySize?: number;
  startTime?: string;
  userId?: string;
}

export interface QuoteResult {
  quoteId: string;
  provider: ConnectorProvider;
  actionType: string;
  status: "available" | "unavailable" | "partial" | "unknown";
  priceMin?: number;
  priceMax?: number;
  currency?: "CNY";
  expiresAt?: string;
  warnings?: string[];
  sourceUrl?: string;
  raw?: unknown;
}

export interface PreparedAction {
  preparedActionId: string;
  provider: ConnectorProvider;
  actionType: string;
  status: "prepared" | "waiting_user_confirm" | "redirect_required" | "unavailable";
  title: string;
  description: string;
  confirmText?: string;
  redirectUrl?: string;
  expiresAt?: string;
  quote?: QuoteResult;
  payload: Record<string, unknown>;
}

export interface CommitResult {
  provider: ConnectorProvider;
  actionType: string;
  status:
    | "committed"
    | "redirected_to_payment"
    | "waiting_external_confirm"
    | "failed"
    | "expired";
  externalOrderId?: string;
  externalReservationId?: string;
  paymentUrl?: string;
  message: string;
  raw?: unknown;
}

// ============================================================================
// Service Connector Interface
// ============================================================================

export interface ServiceConnector {
  provider: ConnectorProvider;
  capabilities: ConnectorCapability[];

  search?(input: ConnectorSearchInput): Promise<ConnectorSearchResult[]>;
  quote?(input: QuoteInput): Promise<QuoteResult>;
  prepare?(input: QuoteInput): Promise<PreparedAction>;
  commit?(preparedActionId: string, userConfirmPayload?: unknown): Promise<CommitResult>;
  cancel?(preparedActionId: string): Promise<CommitResult>;
  status?(externalId: string): Promise<CommitResult>;
}

// ============================================================================
// Connector Registry
// ============================================================================

export interface ConnectorRegistry {
  get(provider: ConnectorProvider): ServiceConnector | undefined;
  register(connector: ServiceConnector): void;
  getAll(): ServiceConnector[];
}

// ============================================================================
// ServiceActionDraft — 可执行服务入口数据结构
// V3: 所有外部服务入口统一使用此结构，前端直接渲染
// ============================================================================

export type ServiceActionProvider =
  | "meituan"
  | "dianping"
  | "eleme"
  | "taobao_flash"
  | "amap"
  | "open"
  | "calendar"
  | "mock";

export type ServiceActionType =
  | "restaurant_reservation"
  | "group_buy"
  | "food_delivery"
  | "coffee_order"
  | "movie_ticket"
  | "navigation"
  | "calendar_event"
  | "copy_booking_info";

export type ServiceActionStatus =
  | "prepared"
  | "redirect_required"
  | "redirected_to_payment"
  | "waiting_external_confirm";

export interface ServiceActionDraft {
  id: string;
  provider: ServiceActionProvider;
  actionType: ServiceActionType;
  title: string;
  description: string;
  poiName?: string;
  poiAddress?: string;
  lat?: number;
  lng?: number;
  recommendedItems?: Array<{
    name: string;
    quantity: number;
    estimatedPrice?: number;
    note?: string;
  }>;
  estimatedTotalPrice?: number;
  priceNote?: string;
  userConfirmText: string;
  riskNotice: string;
  redirectUrl?: string;
  copyText?: string;
  status: ServiceActionStatus;
}
