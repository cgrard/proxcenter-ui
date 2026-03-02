import { useSWRFetch } from './useSWRFetch'
import { useRefreshInterval } from './useRefreshInterval'

export function useRunningTasks() {
  const refreshInterval = useRefreshInterval(10000)
  return useSWRFetch('/api/v1/tasks/running', { refreshInterval })
}
