import { useQuery } from '@tanstack/react-query'
import { fetchZeroGStatus } from '@/lib/api'

export function useNetworkStatus() {
  return useQuery({
    queryKey: ['0g-status'],
    queryFn: ({ signal }) => fetchZeroGStatus(signal),
    refetchInterval: 30_000,
    retry: 1,
  })
}
