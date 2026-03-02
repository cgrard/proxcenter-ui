import { useSettings } from '@core/hooks/useSettings'

/**
 * Returns a SWR-compatible refreshInterval (ms) based on the global setting.
 *
 * @param baseMs - The hook's original hardcoded interval in milliseconds.
 *                 If provided, the returned value scales proportionally:
 *                 `baseMs * (globalSeconds / 30)` so faster hooks stay faster.
 *                 If omitted, returns `globalSeconds * 1000`.
 * @returns 0 when refresh is disabled, otherwise the computed interval in ms.
 */
export function useRefreshInterval(baseMs?: number): number {
  const { settings } = useSettings()
  const globalSeconds: number = settings.refreshInterval ?? 30

  if (globalSeconds === 0) return 0

  if (baseMs != null) {
    return Math.round(baseMs * (globalSeconds / 30))
  }

  return globalSeconds * 1000
}
