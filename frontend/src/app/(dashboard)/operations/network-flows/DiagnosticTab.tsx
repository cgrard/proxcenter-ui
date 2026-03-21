'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

import {
  Alert,
  Autocomplete,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'

import { formatBytes } from '@/utils/format'

// ── Types ────────────────────────────────────────────────────────────────────

interface TopTalker {
  vmid: number
  vm_name: string
  bytes_in: number
  bytes_out: number
}

interface IPPair {
  src_ip: string
  dst_ip: string
  bytes: number
  packets: number
  protocol: string
  dst_port: number
}

interface TopEndpoint {
  ip: string
  vmid?: number
  vm_name?: string
  bytes: number
  packets: number
  flow_count: number
}

interface TimeSeriesPoint {
  time: number
  bytes_in: number
  bytes_out: number
  packets: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchSFlow(endpoint: string, params?: Record<string, string>) {
  const query = new URLSearchParams({ endpoint, ...params })
  const res = await fetch(`/api/v1/orchestrator/sflow?${query}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

const SERVICES: Record<number, string> = {
  22: 'SSH', 53: 'DNS', 80: 'HTTP', 443: 'HTTPS', 3306: 'MySQL',
  5432: 'PostgreSQL', 6379: 'Redis', 8006: 'PVE API', 8080: 'HTTP-Alt',
  25: 'SMTP', 110: 'POP3', 143: 'IMAP', 3389: 'RDP', 5900: 'VNC',
  6789: 'Ceph MON', 3300: 'Ceph MON', 2049: 'NFS', 445: 'SMB',
  9090: 'Prometheus', 9100: 'Node Exp', 5044: 'Logstash',
}

function portToService(port: number): string {
  return SERVICES[port] || ''
}

const PORT_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
]

type SortKey = 'bytes' | 'packets' | 'dst_port' | 'protocol'
type SortDir = 'asc' | 'desc'

// ── Component ────────────────────────────────────────────────────────────────

export default function DiagnosticTab() {
  const t = useTranslations()
  const theme = useTheme()
  const isDark = theme.palette.mode === 'dark'

  // Data
  const [vms, setVMs] = useState<TopTalker[]>([])
  const [selectedVMs, setSelectedVMs] = useState<TopTalker[]>([])
  const [ipPairs, setIPPairs] = useState<IPPair[]>([])
  const [ipToVM, setIpToVM] = useState<Map<string, { vmid: number; vm_name: string }>>(new Map())

  // Filters
  const [protocolFilter, setProtocolFilter] = useState<string>('all')
  const [portFilter, setPortFilter] = useState<string>('')

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('bytes')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Drill-down
  const [selectedPair, setSelectedPair] = useState<IPPair | null>(null)
  const [timelineData, setTimelineData] = useState<TimeSeriesPoint[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)

  // State
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // ── Load data ──────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    try {
      setError(null)

      const [talkersData, pairsData, srcData, dstData] = await Promise.all([
        fetchSFlow('top-talkers', { n: '100' }),
        fetchSFlow('ip-pairs', { n: '500' }),
        fetchSFlow('top-sources', { n: '200' }),
        fetchSFlow('top-destinations', { n: '200' }),
      ])

      const talkers: TopTalker[] = Array.isArray(talkersData) ? talkersData : []
      setVMs(talkers)
      setIPPairs(Array.isArray(pairsData) ? pairsData : [])

      // Build IP → VM mapping
      const map = new Map<string, { vmid: number; vm_name: string }>()
      const allEndpoints: TopEndpoint[] = [
        ...(Array.isArray(srcData) ? srcData : []),
        ...(Array.isArray(dstData) ? dstData : []),
      ]
      for (const ep of allEndpoints) {
        if (ep.vmid && ep.ip) {
          map.set(ep.ip, { vmid: ep.vmid, vm_name: ep.vm_name || `VM ${ep.vmid}` })
        }
      }
      setIpToVM(map)

      if (selectedVMs.length === 0 && talkers.length > 0) {
        setSelectedVMs([talkers[0]])
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadData()
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [loadData])

  // ── Drill-down timeline ────────────────────────────────────────────────────

  const loadTimeline = useCallback(async (pair: IPPair) => {
    setTimelineLoading(true)
    try {
      const now = new Date()
      const from = new Date(now.getTime() - 60 * 60 * 1000) // 1h
      const data = await fetchSFlow('timeseries/ip', {
        src_ip: pair.src_ip,
        dst_ip: pair.dst_ip,
        from: from.toISOString(),
        to: now.toISOString(),
      })
      setTimelineData(Array.isArray(data) ? data : [])
    } catch {
      setTimelineData([])
    } finally {
      setTimelineLoading(false)
    }
  }, [])

  const handleRowClick = (pair: IPPair) => {
    if (selectedPair?.src_ip === pair.src_ip && selectedPair?.dst_ip === pair.dst_ip && selectedPair?.dst_port === pair.dst_port) {
      setSelectedPair(null)
      setTimelineData([])
    } else {
      setSelectedPair(pair)
      loadTimeline(pair)
    }
  }

  // ── Build filtered & sorted conversations ──────────────────────────────────

  const selectedVMIDs = useMemo(() => new Set(selectedVMs.map(v => v.vmid)), [selectedVMs])

  const filteredPairs = useMemo(() => {
    if (selectedVMs.length === 0) return []

    return ipPairs.filter(pair => {
      // At least one side must belong to a selected VM
      const srcVM = ipToVM.get(pair.src_ip)
      const dstVM = ipToVM.get(pair.dst_ip)
      const srcMatch = srcVM && selectedVMIDs.has(srcVM.vmid)
      const dstMatch = dstVM && selectedVMIDs.has(dstVM.vmid)
      if (!srcMatch && !dstMatch) return false

      // Protocol filter
      if (protocolFilter !== 'all' && pair.protocol !== protocolFilter) return false

      // Port filter
      if (portFilter) {
        const pNum = parseInt(portFilter, 10)
        if (!isNaN(pNum) && pair.dst_port !== pNum) return false
      }

      return true
    }).sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1
      if (sortKey === 'bytes') return mul * (a.bytes - b.bytes)
      if (sortKey === 'packets') return mul * (a.packets - b.packets)
      if (sortKey === 'dst_port') return mul * (a.dst_port - b.dst_port)
      if (sortKey === 'protocol') return mul * a.protocol.localeCompare(b.protocol)
      return 0
    })
  }, [ipPairs, selectedVMs, selectedVMIDs, ipToVM, protocolFilter, portFilter, sortKey, sortDir])

  // ── KPI ────────────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const totalBytes = filteredPairs.reduce((s, p) => s + p.bytes, 0)
    const totalPackets = filteredPairs.reduce((s, p) => s + p.packets, 0)
    const peers = new Set<string>()
    for (const p of filteredPairs) {
      peers.add(p.src_ip)
      peers.add(p.dst_ip)
    }
    return { conversations: filteredPairs.length, totalBytes, totalPackets, peers: peers.size }
  }, [filteredPairs])

  // ── Top ports from filtered data ───────────────────────────────────────────

  const topPorts = useMemo(() => {
    const portMap = new Map<string, { port: number; protocol: string; bytes: number }>()
    for (const p of filteredPairs) {
      const key = `${p.dst_port}/${p.protocol}`
      const existing = portMap.get(key)
      if (existing) {
        existing.bytes += p.bytes
      } else {
        portMap.set(key, { port: p.dst_port, protocol: p.protocol, bytes: p.bytes })
      }
    }
    const sorted = Array.from(portMap.values()).sort((a, b) => b.bytes - a.bytes).slice(0, 8)
    const max = sorted[0]?.bytes || 1
    return sorted.map(p => ({ ...p, percent: (p.bytes / max) * 100, service: portToService(p.port) }))
  }, [filteredPairs])

  // ── Available protocols ────────────────────────────────────────────────────

  const protocols = useMemo(() => {
    const set = new Set(ipPairs.map(p => p.protocol))
    return Array.from(set).sort()
  }, [ipPairs])

  // ── Sort handler ───────────────────────────────────────────────────────────

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // ── Resolve IP to display ──────────────────────────────────────────────────

  const resolveIP = (ip: string) => {
    const vm = ipToVM.get(ip)
    return vm ? { label: vm.vm_name, vmid: vm.vmid, ip, isVM: true } : { label: ip, vmid: null, ip, isVM: false }
  }

  // ── Format time ────────────────────────────────────────────────────────────

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatBandwidth = (v: number) => `${formatBytes(v)}/s`

  // ── Bandwidth from timeline ────────────────────────────────────────────────

  const timelineBandwidth = useMemo(() => {
    if (timelineData.length < 2) return []
    return timelineData.slice(1).map((p, i) => {
      const prev = timelineData[i]
      const dt = p.time - prev.time
      if (dt <= 0) return null
      return { time: p.time, bps: (p.bytes_in || 0) / dt }
    }).filter(Boolean) as { time: number; bps: number }[]
  }, [timelineData])

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading && vms.length === 0) {
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <CircularProgress size={32} />
      </Box>
    )
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 1 }}>

      {error && (
        <Alert severity="warning" icon={<i className="ri-information-line" />}>{error}</Alert>
      )}

      {/* Controls */}
      <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
        <Autocomplete
          multiple
          size="small"
          sx={{ minWidth: 350, flex: 1 }}
          options={vms}
          getOptionLabel={(vm) => `${vm.vm_name || `VM ${vm.vmid}`} (${vm.vmid})`}
          value={selectedVMs}
          onChange={(_, v) => { setSelectedVMs(v); setSelectedPair(null); setTimelineData([]) }}
          renderInput={(params) => (
            <TextField {...params} label={t('networkFlows.selectVms')} placeholder={t('common.search')} />
          )}
          renderTags={(value, getTagProps) =>
            value.map((vm, idx) => (
              <Chip
                {...getTagProps({ index: idx })}
                key={vm.vmid}
                label={vm.vm_name || `VM ${vm.vmid}`}
                size="small"
                sx={{ height: 24, borderRadius: 'calc(var(--proxcenter-button-radius, 12px) * 2)', '& .MuiChip-label': { fontSize: '0.75rem' } }}
                variant="outlined"
              />
            ))
          }
        />

        <FormControl size="small" sx={{ minWidth: 120 }}>
          <InputLabel>{t('networkFlows.protocol')}</InputLabel>
          <Select
            value={protocolFilter}
            label={t('networkFlows.protocol')}
            onChange={(e) => setProtocolFilter(e.target.value)}
          >
            <MenuItem value="all">{t('common.all')}</MenuItem>
            {protocols.map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </Select>
        </FormControl>

        <TextField
          size="small"
          label={t('networkFlows.portFilter')}
          value={portFilter}
          onChange={(e) => setPortFilter(e.target.value)}
          sx={{ width: 110 }}
          placeholder="e.g. 443"
        />
      </Box>

      {/* No VM selected */}
      {selectedVMs.length === 0 && (
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
          <Box sx={{ textAlign: 'center', opacity: 0.4 }}>
            <i className="ri-stethoscope-line" style={{ fontSize: 48 }} />
            <Typography variant="body2" sx={{ mt: 1 }}>{t('networkFlows.selectVmToDiagnose')}</Typography>
          </Box>
        </Box>
      )}

      {/* KPI Cards */}
      {selectedVMs.length > 0 && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 2 }}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                <i className="ri-link" style={{ fontSize: 12, marginRight: 4 }} />
                {t('networkFlows.conversations')}
              </Typography>
              <Typography variant="h6" fontWeight={800} color="primary">{kpi.conversations}</Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                <i className="ri-database-2-line" style={{ fontSize: 12, marginRight: 4 }} />
                {t('networkFlows.totalTraffic')}
              </Typography>
              <Typography variant="h6" fontWeight={800} color="success.main">{formatBytes(kpi.totalBytes)}</Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                <i className="ri-send-plane-line" style={{ fontSize: 12, marginRight: 4 }} />
                {t('networkFlows.totalPackets')}
              </Typography>
              <Typography variant="h6" fontWeight={800} color="warning.main">{kpi.totalPackets.toLocaleString()}</Typography>
            </CardContent>
          </Card>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 }, textAlign: 'center' }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                <i className="ri-group-line" style={{ fontSize: 12, marginRight: 4 }} />
                {t('networkFlows.uniquePeers')}
              </Typography>
              <Typography variant="h6" fontWeight={800} color="text.primary">{kpi.peers}</Typography>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Conversations Table */}
      {selectedVMs.length > 0 && (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
              <i className="ri-list-check-2" style={{ fontSize: 16, marginRight: 6 }} />
              {t('networkFlows.conversations')}
              {filteredPairs.length > 0 && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  ({filteredPairs.length})
                </Typography>
              )}
            </Typography>

            {filteredPairs.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4, opacity: 0.4 }}>
                <i className="ri-filter-off-line" style={{ fontSize: 32 }} />
                <Typography variant="body2" sx={{ mt: 1 }}>{t('networkFlows.noConversations')}</Typography>
              </Box>
            ) : (
              <TableContainer sx={{ maxHeight: 480 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>{t('networkFlows.source')}</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>{t('networkFlows.destination')}</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                        <TableSortLabel active={sortKey === 'protocol'} direction={sortKey === 'protocol' ? sortDir : 'asc'} onClick={() => handleSort('protocol')}>
                          {t('networkFlows.protocol')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                        <TableSortLabel active={sortKey === 'dst_port'} direction={sortKey === 'dst_port' ? sortDir : 'asc'} onClick={() => handleSort('dst_port')}>
                          Port
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Service</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                        <TableSortLabel active={sortKey === 'bytes'} direction={sortKey === 'bytes' ? sortDir : 'desc'} onClick={() => handleSort('bytes')}>
                          {t('networkFlows.volume')}
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>
                        <TableSortLabel active={sortKey === 'packets'} direction={sortKey === 'packets' ? sortDir : 'desc'} onClick={() => handleSort('packets')}>
                          Packets
                        </TableSortLabel>
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredPairs.map((pair, idx) => {
                      const src = resolveIP(pair.src_ip)
                      const dst = resolveIP(pair.dst_ip)
                      const service = portToService(pair.dst_port)
                      const isSelected = selectedPair?.src_ip === pair.src_ip && selectedPair?.dst_ip === pair.dst_ip && selectedPair?.dst_port === pair.dst_port

                      return (
                        <TableRow
                          key={`${pair.src_ip}-${pair.dst_ip}-${pair.dst_port}-${idx}`}
                          hover
                          onClick={() => handleRowClick(pair)}
                          sx={{
                            cursor: 'pointer',
                            bgcolor: isSelected ? `${theme.palette.primary.main}10` : undefined,
                            '&:hover': { bgcolor: `${theme.palette.primary.main}08` },
                          }}
                        >
                          <TableCell sx={{ py: 1, border: 0 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                              {src.isVM && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <i className="ri-computer-line" style={{ fontSize: 12, opacity: 0.5 }} />
                                  <Typography variant="body2" fontWeight={600} fontSize="0.8rem">{src.label}</Typography>
                                </Box>
                              )}
                              <Typography variant="caption" color="text.secondary" fontFamily="JetBrains Mono, monospace" fontSize="0.7rem">
                                {src.ip}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 1, border: 0 }}>
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                              {dst.isVM ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <i className="ri-computer-line" style={{ fontSize: 12, opacity: 0.5 }} />
                                  <Typography variant="body2" fontWeight={600} fontSize="0.8rem">{dst.label}</Typography>
                                </Box>
                              ) : (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                  <i className="ri-global-line" style={{ fontSize: 12, opacity: 0.5 }} />
                                  <Typography variant="body2" fontWeight={600} fontSize="0.8rem" color="text.secondary">{t('networkFlows.external')}</Typography>
                                </Box>
                              )}
                              <Typography variant="caption" color="text.secondary" fontFamily="JetBrains Mono, monospace" fontSize="0.7rem">
                                {dst.ip}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell sx={{ py: 1, border: 0 }}>
                            <Chip
                              label={pair.protocol}
                              size="small"
                              sx={{
                                height: 20, fontSize: '0.65rem', fontWeight: 600,
                                bgcolor: pair.protocol === 'TCP' ? `${theme.palette.primary.main}15` :
                                         pair.protocol === 'UDP' ? `${theme.palette.warning.main}15` :
                                         `${theme.palette.info.main}15`,
                                color: pair.protocol === 'TCP' ? theme.palette.primary.main :
                                       pair.protocol === 'UDP' ? theme.palette.warning.main :
                                       theme.palette.info.main,
                              }}
                            />
                          </TableCell>
                          <TableCell sx={{ py: 1, border: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>
                            {pair.dst_port}
                          </TableCell>
                          <TableCell sx={{ py: 1, border: 0, fontSize: '0.8rem', color: service ? 'text.primary' : 'text.disabled' }}>
                            {service || '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ py: 1, border: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', fontWeight: 600 }}>
                            {formatBytes(pair.bytes)}
                          </TableCell>
                          <TableCell align="right" sx={{ py: 1, border: 0, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', color: 'text.secondary' }}>
                            {pair.packets.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Drill-down Timeline */}
      {selectedPair && (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
              <Typography variant="subtitle2" fontWeight={700}>
                <i className="ri-line-chart-line" style={{ fontSize: 16, marginRight: 6 }} />
                {resolveIP(selectedPair.src_ip).label} → {resolveIP(selectedPair.dst_ip).label}
                {selectedPair.dst_port > 0 && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    :{selectedPair.dst_port} {portToService(selectedPair.dst_port) && `(${portToService(selectedPair.dst_port)})`}
                  </Typography>
                )}
              </Typography>
              <IconButton size="small" onClick={() => { setSelectedPair(null); setTimelineData([]) }}>
                <i className="ri-close-line" style={{ fontSize: 16 }} />
              </IconButton>
            </Box>

            {timelineLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress size={24} />
              </Box>
            ) : timelineBandwidth.length > 0 ? (
              <Box sx={{ height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={timelineBandwidth}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} />
                    <XAxis dataKey="time" tickFormatter={formatTime} tick={{ fontSize: 10 }} stroke={theme.palette.text.secondary} />
                    <YAxis tickFormatter={formatBandwidth} tick={{ fontSize: 10 }} width={80} stroke={theme.palette.text.secondary} />
                    <RechartsTooltip
                      labelFormatter={(v) => new Date(Number(v) * 1000).toLocaleString()}
                      formatter={(v: number) => [formatBandwidth(v), t('networkFlows.bandwidthRate')]}
                      contentStyle={{ backgroundColor: theme.palette.background.paper, borderColor: theme.palette.divider, color: theme.palette.text.primary, fontSize: 12, borderRadius: 8 }}
                    />
                    <Area type="monotone" dataKey="bps" stroke={theme.palette.primary.main} fill={theme.palette.primary.main} fillOpacity={0.2} strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
            ) : (
              <Box sx={{ textAlign: 'center', py: 4, opacity: 0.4 }}>
                <i className="ri-time-line" style={{ fontSize: 32 }} />
                <Typography variant="body2" sx={{ mt: 1 }}>{t('networkFlows.noTimelineData')}</Typography>
              </Box>
            )}
          </CardContent>
        </Card>
      )}

      {/* Top Ports */}
      {selectedVMs.length > 0 && topPorts.length > 0 && (
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="subtitle2" fontWeight={700} sx={{ mb: 1.5 }}>
              <i className="ri-door-lock-line" style={{ fontSize: 16, marginRight: 6 }} />
              {t('networkFlows.topPorts')}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {topPorts.map((p, idx) => (
                <Box key={`${p.port}-${p.protocol}`}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.25 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" fontWeight={700} fontFamily="JetBrains Mono, monospace">
                        {p.port}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {p.service || p.protocol}
                      </Typography>
                    </Box>
                    <Typography variant="caption" fontFamily="JetBrains Mono, monospace" fontWeight={600}>
                      {formatBytes(p.bytes)}
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={p.percent}
                    sx={{
                      height: 6,
                      borderRadius: 3,
                      bgcolor: 'action.hover',
                      '& .MuiLinearProgress-bar': {
                        borderRadius: 3,
                        bgcolor: PORT_COLORS[idx % PORT_COLORS.length],
                      },
                    }}
                  />
                </Box>
              ))}
            </Box>
          </CardContent>
        </Card>
      )}
    </Box>
  )
}
