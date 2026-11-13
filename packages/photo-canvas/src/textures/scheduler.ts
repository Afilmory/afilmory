import { textureBytes } from './tiers'

export interface WantedTexture {
  id: string
  tier: number
  distance: number
}

export interface TextureSchedulerOptions<T> {
  load: (id: string, tier: number, signal: AbortSignal) => Promise<T>
  onLoaded: (id: string, tier: number, value: T) => void
  onEvict: (id: string) => void
  concurrency?: number
  budgetBytes: number
  maxRetries?: number
}

interface LoadedEntry {
  tier: number
  lastWanted: number
}

interface FlightEntry {
  tier: number
  controller: AbortController
}

export class TextureScheduler<T> {
  private readonly loaded = new Map<string, LoadedEntry>()
  private readonly flights = new Map<string, FlightEntry>()
  private readonly failures = new Map<string, number>()
  private wanted = new Map<string, WantedTexture>()
  private moving = false
  private tick = 0
  private bytes = 0
  private disposed = false

  constructor(private readonly options: TextureSchedulerOptions<T>) {}

  update(wanted: WantedTexture[], moving: boolean) {
    this.tick += 1
    this.moving = moving
    this.wanted = new Map()
    for (const item of wanted) {
      if (item.tier > 0) {
        this.wanted.set(item.id, item)
      }
    }
    for (const [id, flight] of this.flights) {
      const item = this.wanted.get(id)
      if (!item || item.tier !== flight.tier) {
        flight.controller.abort()
        this.flights.delete(id)
      }
    }
    for (const id of this.wanted.keys()) {
      const entry = this.loaded.get(id)
      if (entry) {
        entry.lastWanted = this.tick
      }
    }
    this.pump()
    this.evict()
  }

  has(id: string) {
    return this.loaded.get(id)?.tier ?? 0
  }

  dispose() {
    this.disposed = true
    for (const flight of this.flights.values()) {
      flight.controller.abort()
    }
    this.flights.clear()
    this.wanted.clear()
  }

  private pump() {
    if (this.moving || this.disposed) {
      return
    }
    const limit = this.options.concurrency ?? 6
    const maxRetries = this.options.maxRetries ?? 1
    const queue = [...this.wanted.values()]
      .filter(
        item =>
          !this.flights.has(item.id)
          && this.has(item.id) < item.tier
          && (this.failures.get(item.id) ?? 0) <= maxRetries,
      )
      .sort((a, b) => a.distance - b.distance)
    for (const item of queue) {
      if (this.flights.size >= limit) {
        return
      }
      this.start(item)
    }
  }

  private start(item: WantedTexture) {
    const controller = new AbortController()
    this.flights.set(item.id, { tier: item.tier, controller })
    const isCurrent = () => this.flights.get(item.id)?.controller === controller
    this.options.load(item.id, item.tier, controller.signal).then(
      (value) => {
        if (!isCurrent()) {
          return
        }
        this.flights.delete(item.id)
        this.bytes += textureBytes(item.tier) - textureBytes(this.has(item.id))
        this.loaded.set(item.id, { tier: item.tier, lastWanted: this.tick })
        this.options.onLoaded(item.id, item.tier, value)
        this.pump()
        this.evict()
      },
      () => {
        if (!isCurrent()) {
          return
        }
        this.flights.delete(item.id)
        this.failures.set(item.id, (this.failures.get(item.id) ?? 0) + 1)
        this.pump()
      },
    )
  }

  private evict() {
    while (this.bytes > this.options.budgetBytes) {
      let oldestId: string | null = null
      let oldestTick = Infinity
      for (const [id, entry] of this.loaded) {
        if (!this.wanted.has(id) && entry.lastWanted < oldestTick) {
          oldestId = id
          oldestTick = entry.lastWanted
        }
      }
      if (oldestId === null) {
        return
      }
      this.bytes -= textureBytes(this.loaded.get(oldestId)!.tier)
      this.loaded.delete(oldestId)
      this.options.onEvict(oldestId)
    }
  }
}
