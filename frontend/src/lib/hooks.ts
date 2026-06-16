import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export interface Paginated<T> {
  data: T[]
  meta?: { current_page: number; last_page: number; total: number }
  links?: unknown
}

// Generic paginated list query for an API resource collection.
export function useList<T>(resource: string, params: Record<string, unknown> = {}) {
  return useQuery({
    queryKey: [resource, params],
    queryFn: async () => (await api.get<Paginated<T>>(`/${resource}`, { params })).data,
  })
}
