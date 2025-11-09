import { z } from 'zod'

export const ViewDtoSchema = z.object({
  refKey: z.string().min(1),
})
export type ViewDto = z.infer<typeof ViewDtoSchema>

export const ReactionDtoSchema = z.object({
  refKey: z.string().min(1),
  reaction: z.string().min(1).max(20),
})
export type ReactionDto = z.infer<typeof ReactionDtoSchema>

export const AnalysisDtoSchema = z.object({
  refKey: z.string().min(1),
})
export type AnalysisDto = z.infer<typeof AnalysisDtoSchema>

export interface AnalysisResponse {
  data: {
    view: number
    reactions: Record<string, number>
  }
}

export class Client {
  constructor(private readonly baseUrl: string) {}

  private buildUrl(path: string) {
    return `${this.baseUrl}${path}`
  }

  async actView(data: ViewDto) {
    return fetch(this.buildUrl('/api/act/views'), {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  async actReaction(data: ReactionDto) {
    return fetch(this.buildUrl('/api/reactions/add'), {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  async analysis(data: AnalysisDto) {
    const query = new URLSearchParams(data).toString()
    return (await fetch(this.buildUrl(`/api/reactions?${query}`), {
      method: 'GET',
    }).then((res) => res.json())) as Promise<AnalysisResponse>
  }
}
