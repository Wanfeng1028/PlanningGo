import type {
  MapProvider,
  PoiQuery,
  PoiResult,
  WeatherQuery,
  WeatherResult,
  RouteQuery,
  RouteResult,
} from './types.js'

const MOCK_POIS: PoiResult[] = [
  { id: 'poi-1', name: '故宫博物院', address: '景山前街4号', type: '风景名胜', location: { lng: 116.397, lat: 39.918 }, rating: 4.8, cost: 60, source: 'mock' },
  { id: 'poi-2', name: '南锣鼓巷', address: '南锣鼓巷', type: '风景名胜', location: { lng: 116.403, lat: 39.937 }, rating: 4.3, cost: 0, source: 'mock' },
  { id: 'poi-3', name: '什刹海', address: '什刹海', type: '风景名胜', location: { lng: 116.383, lat: 39.938 }, rating: 4.5, cost: 0, source: 'mock' },
  { id: 'poi-4', name: '颐和园', address: '新建宫门路19号', type: '风景名胜', location: { lng: 116.275, lat: 39.999 }, rating: 4.7, cost: 30, source: 'mock' },
  { id: 'poi-5', name: '全聚德(前门店)', address: '前门大街30号', type: '餐饮服务', location: { lng: 116.397, lat: 39.899 }, rating: 4.2, cost: 150, source: 'mock' },
  { id: 'poi-6', name: '簋街美食', address: '东直门内大街', type: '餐饮服务', location: { lng: 116.418, lat: 39.939 }, rating: 4.4, cost: 80, source: 'mock' },
  { id: 'poi-7', name: '北京国贸大酒店', address: '建国门外大街1号', type: '住宿服务', location: { lng: 116.461, lat: 39.908 }, rating: 4.6, cost: 800, source: 'mock' },
  { id: 'poi-8', name: '798艺术区', address: '酒仙桥路4号', type: '风景名胜', location: { lng: 116.488, lat: 39.984 }, rating: 4.4, cost: 0, source: 'mock' },
]

export class MockMapProvider implements MapProvider {
  async searchPois(query: PoiQuery, signal?: AbortSignal): Promise<PoiResult[]> {
    await simulateDelay(100, 300)
    const keyword = query.keywords?.toLowerCase() || ''
    const type = query.types || ''
    return MOCK_POIS.filter((p) => {
      const matchKeyword = !keyword || p.name.toLowerCase().includes(keyword) || p.address.toLowerCase().includes(keyword)
      const matchType = !type || p.type.includes(type)
      return matchKeyword && matchType
    })
  }

  async getWeather(_query: WeatherQuery): Promise<WeatherResult> {
    await simulateDelay(80, 200)
    return {
      date: _query.date,
      tempMax: 28,
      tempMin: 18,
      condition: '晴',
      windDir: '北风',
      windScale: '2级',
      humidity: 45,
      uvIndex: 5,
      aqi: 72,
      suggestion: '天气不错，适合户外活动',
    }
  }

  async planRoute(query: RouteQuery): Promise<RouteResult> {
    await simulateDelay(100, 400)
    const waypointCount = query.waypoints?.length || 0
    const distance = 5000 + waypointCount * 3000
    const duration = 600 + waypointCount * 300
    return {
      distance,
      duration,
      cost: 0,
      strategy: query.strategy || '最快到达',
      steps: [
        { instruction: `从${query.from.name}出发`, road: '主路', distance: 1000, duration: 120 },
        { instruction: `到达${query.to.name}`, road: '主路', distance: distance - 1000, duration: duration - 120 },
      ],
    }
  }
}

function simulateDelay(min: number, max: number): Promise<void> {
  const ms = Math.floor(Math.random() * (max - min) + min)
  return new Promise((resolve) => setTimeout(resolve, ms))
}
