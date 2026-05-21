export interface PoiQuery {
  city: string
  keywords: string
  types?: string
  radius?: number
  location?: { lng: number; lat: number }
  page?: number
  pageSize?: number
}

export interface PoiResult {
  id: string
  name: string
  address: string
  type: string
  location: { lng: number; lat: number }
  rating?: number
  cost?: number
  photos?: string[]
  tel?: string
  distance?: number
  source?: string
  city?: string
  adcode?: string
}

export interface WeatherQuery {
  city: string
  date: string
}

export interface WeatherResult {
  date: string
  tempMax: number
  tempMin: number
  condition: string
  windDir: string
  windScale: string
  humidity: number
  uvIndex?: number
  aqi?: number
  suggestion?: string
}

export interface RouteQuery {
  from: { name: string; lng?: number; lat?: number }
  to: { name: string; lng?: number; lat?: number }
  strategy?: string
  waypoints?: Array<{ name: string; lng?: number; lat?: number }>
}

export interface RouteResult {
  distance: number
  duration: number
  cost?: number
  strategy: string
  steps: Array<{ instruction: string; road: string; distance: number; duration: number }>
  polyline?: string
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmQuery {
  messages: LlmMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface LlmResult {
  content: string
  model: string
  usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  latencyMs: number
}

export interface BookingItem {
  type: 'restaurant' | 'hotel' | 'ticket' | 'transport'
  name: string
  dateTime: string
  partySize?: number
  contact?: string
  notes?: string
  metadata?: Record<string, unknown>
}

export interface BookingResult {
  confirmationCode: string
  status: 'confirmed' | 'pending' | 'failed'
  item: BookingItem
  estimatedCost?: number
  notes?: string
}

export interface MapProvider {
  searchPois(query: PoiQuery): Promise<PoiResult[]>
  getWeather(query: WeatherQuery): Promise<WeatherResult>
  planRoute(query: RouteQuery): Promise<RouteResult>
}

export interface LlmProvider {
  chat(query: LlmQuery): Promise<LlmResult>
}

export interface BookingProvider {
  createBooking(item: BookingItem): Promise<BookingResult>
  cancelBooking(confirmationCode: string): Promise<{ success: boolean }>
  getBookingStatus(confirmationCode: string): Promise<{ status: string }>
}
