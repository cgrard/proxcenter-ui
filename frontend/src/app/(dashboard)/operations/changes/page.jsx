'use client'

import { useMemo, useState } from 'react'

import { useTranslations } from 'next-intl'

import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Collapse,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material'

import { usePageTitle } from '@/contexts/PageTitleContext'
import { useChanges } from '@/hooks/useChanges'

import EmptyState from '@/components/EmptyState'
import { CardsSkeleton } from '@/components/skeletons'

/* --------------------------------
   Helpers
-------------------------------- */

function timeAgo(date, t) {
  const now = new Date()
  const past = new Date(date)
  const diff = Math.floor((now - past) / 1000)

  if (diff < 60) return t('changes.aFewSecondsAgo')
  if (diff < 3600) return t('changes.minutesAgo', { count: Math.floor(diff / 60) })
  if (diff < 86400) return t('changes.hoursAgo', { count: Math.floor(diff / 3600) })

  return t('changes.daysAgo', { count: Math.floor(diff / 86400) })
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(date) {
  return new Date(date).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

function getDayKey(date) {
  const d = new Date(date)

  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function isToday(date) {
  const d = new Date(date)
  const now = new Date()

  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function isYesterday(date) {
  const d = new Date(date)
  const yesterday = new Date()

  yesterday.setDate(yesterday.getDate() - 1)

  return d.getFullYear() === yesterday.getFullYear() && d.getMonth() === yesterday.getMonth() && d.getDate() === yesterday.getDate()
}

function getDayLabel(date, t) {
  if (isToday(date)) return t('changes.today')
  if (isYesterday(date)) return t('changes.yesterday')

  return formatDate(date)
}

/* --------------------------------
   Config
-------------------------------- */

const resourceTypeConfig = {
  vm: { icon: 'ri-computer-line', color: '#4fc3f7', label: 'VM' },
  ct: { icon: 'ri-instance-line', color: '#81c784', label: 'Container' },
  node: { icon: 'ri-server-line', color: '#ffb74d', label: 'Node' },
  storage: { icon: 'ri-database-2-line', color: '#ce93d8', label: 'Storage' },
  pool: { icon: 'ri-stack-line', color: '#90a4ae', label: 'Pool' }
}

const actionConfig = {
  config_changed: { icon: 'ri-settings-3-line', color: 'info', label: 'changes.actionConfigChanged' },
  created: { icon: 'ri-add-circle-line', color: 'success', label: 'changes.actionCreated' },
  deleted: { icon: 'ri-delete-bin-line', color: 'error', label: 'changes.actionDeleted' },
  migrated: { icon: 'ri-swap-box-line', color: 'warning', label: 'changes.actionMigrated' },
  started: { icon: 'ri-play-circle-line', color: 'success', label: 'changes.actionStarted' },
  stopped: { icon: 'ri-stop-circle-line', color: 'error', label: 'changes.actionStopped' }
}

/* --------------------------------
   Components
-------------------------------- */

function FieldDiff({ field }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.25 }}>
      <Typography
        variant='caption'
        sx={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 600, minWidth: 100, opacity: 0.8 }}
      >
        {field.field}
      </Typography>
      {field.oldValue && (
        <Chip
          size='small'
          label={field.oldValue}
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontFamily: 'JetBrains Mono, monospace',
            bgcolor: 'error.main',
            color: 'error.contrastText',
            opacity: 0.8,
            textDecoration: 'line-through',
            maxWidth: 200,
            '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' }
          }}
        />
      )}
      {field.oldValue && field.newValue && (
        <i className='ri-arrow-right-line' style={{ fontSize: 12, opacity: 0.5 }} />
      )}
      {field.newValue && (
        <Chip
          size='small'
          label={field.newValue}
          sx={{
            height: 20,
            fontSize: '0.65rem',
            fontFamily: 'JetBrains Mono, monospace',
            bgcolor: 'success.main',
            color: 'success.contrastText',
            maxWidth: 200,
            '& .MuiChip-label': { overflow: 'hidden', textOverflow: 'ellipsis' }
          }}
        />
      )}
    </Box>
  )
}

function TimelineEntry({ change, t }) {
  const [expanded, setExpanded] = useState(false)
  const resConfig = resourceTypeConfig[change.resourceType] || resourceTypeConfig.vm
  const actConfig = actionConfig[change.action] || actionConfig.config_changed
  const hasFields = change.fields && change.fields.length > 0

  return (
    <Box sx={{ display: 'flex', gap: 2, position: 'relative' }}>
      {/* Timeline dot + connector */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', pt: 0.5 }}>
        <Box
          sx={{
            width: 36,
            height: 36,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            bgcolor: resConfig.color,
            color: '#fff',
            flexShrink: 0,
            boxShadow: `0 0 0 4px var(--mui-palette-background-paper)`
          }}
        >
          <i className={resConfig.icon} style={{ fontSize: 18 }} />
        </Box>
        <Box sx={{ width: 2, flex: 1, bgcolor: 'divider', mt: 0.5, minHeight: 20 }} />
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, pb: 3, minWidth: 0 }}>
        {/* Header */}
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 1,
            cursor: hasFields ? 'pointer' : 'default',
            '&:hover': hasFields ? { opacity: 0.85 } : {}
          }}
          onClick={() => hasFields && setExpanded(!expanded)}
        >
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Chip
                size='small'
                icon={<i className={actConfig.icon} style={{ fontSize: 14 }} />}
                label={t(actConfig.label)}
                color={actConfig.color}
                variant='outlined'
                sx={{ height: 24, fontSize: '0.7rem' }}
              />
              <Typography variant='body2' fontWeight={600}>
                {resConfig.label} {change.resourceId}
              </Typography>
              {change.resourceName && (
                <Typography variant='body2' sx={{ opacity: 0.7 }}>
                  "{change.resourceName}"
                </Typography>
              )}
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
              {hasFields && (
                <Typography variant='caption' sx={{ opacity: 0.7 }}>
                  {change.fields.length} {change.fields.length === 1 ? t('changes.fieldChanged') : t('changes.fieldsChanged')}
                </Typography>
              )}
              <Typography variant='caption' sx={{ opacity: 0.4 }}>
                {hasFields ? ' \u2022 ' : ''}
              </Typography>
              <Typography variant='caption' sx={{ opacity: 0.6 }}>
                {change.user}
              </Typography>
              <Typography variant='caption' sx={{ opacity: 0.4 }}>{'\u2022'}</Typography>
              <Typography variant='caption' sx={{ opacity: 0.6 }}>
                {change.node}
              </Typography>
              <Typography variant='caption' sx={{ opacity: 0.4 }}>{'\u2022'}</Typography>
              <Typography variant='caption' sx={{ opacity: 0.6 }}>
                {change.connectionName || change.connectionId}
              </Typography>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
            <Typography variant='caption' sx={{ opacity: 0.5 }}>
              {timeAgo(change.timestamp, t)}
            </Typography>
            <Typography variant='caption' sx={{ fontFamily: 'JetBrains Mono, monospace', opacity: 0.4 }}>
              {formatTime(change.timestamp)}
            </Typography>
            {hasFields && (
              <IconButton size='small' sx={{ opacity: 0.4 }}>
                <i className={expanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'} style={{ fontSize: 16 }} />
              </IconButton>
            )}
          </Box>
        </Box>

        {/* Expandable field diffs */}
        {hasFields && (
          <Collapse in={expanded}>
            <Box
              sx={{
                mt: 1,
                p: 1.5,
                bgcolor: 'action.hover',
                borderRadius: 1,
                border: 1,
                borderColor: 'divider'
              }}
            >
              {change.fields.map((field, idx) => (
                <FieldDiff key={idx} field={field} />
              ))}
            </Box>
          </Collapse>
        )}
      </Box>
    </Box>
  )
}

/* --------------------------------
   Page
-------------------------------- */

export default function ChangesPage() {
  const t = useTranslations()

  usePageTitle(t('changes.title'))

  // Filters
  const [resourceType, setResourceType] = useState('')
  const [action, setAction] = useState('')
  const [search, setSearch] = useState('')

  const { data: response, isLoading, error } = useChanges({ limit: 300, resourceType: resourceType || undefined, action: action || undefined })

  const changes = response?.data || []

  // Group by day
  const groupedChanges = useMemo(() => {
    let filtered = changes

    if (search) {
      const q = search.toLowerCase()

      filtered = filtered.filter(c =>
        c.resourceId?.toLowerCase().includes(q) ||
        c.resourceName?.toLowerCase().includes(q) ||
        c.node?.toLowerCase().includes(q) ||
        c.user?.toLowerCase().includes(q) ||
        c.connectionName?.toLowerCase().includes(q)
      )
    }

    const groups = []
    let currentDayKey = null
    let currentGroup = null

    for (const change of filtered) {
      const dayKey = getDayKey(change.timestamp)

      if (dayKey !== currentDayKey) {
        currentDayKey = dayKey
        currentGroup = { dayKey, label: getDayLabel(change.timestamp, t), changes: [] }
        groups.push(currentGroup)
      }

      currentGroup.changes.push(change)
    }

    return groups
  }, [changes, search, t])

  // Stats
  const stats = useMemo(() => {
    const byType = {}
    const byAction = {}

    for (const c of changes) {
      byType[c.resourceType] = (byType[c.resourceType] || 0) + 1
      byAction[c.action] = (byAction[c.action] || 0) + 1
    }

    return { total: changes.length, byType, byAction }
  }, [changes])

  if (isLoading) return <CardsSkeleton count={3} />

  return (
    <Stack spacing={3}>
      {/* Stats row */}
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Card sx={{ flex: 1, minWidth: 150 }}>
          <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant='caption' sx={{ opacity: 0.6 }}>{t('changes.totalChanges')}</Typography>
            <Typography variant='h5' fontWeight={700}>{stats.total}</Typography>
          </CardContent>
        </Card>
        {Object.entries(stats.byType).map(([type, count]) => {
          const cfg = resourceTypeConfig[type] || resourceTypeConfig.vm

          return (
            <Card key={type} sx={{ flex: 1, minWidth: 120 }}>
              <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <i className={cfg.icon} style={{ fontSize: 14, color: cfg.color }} />
                  <Typography variant='caption' sx={{ opacity: 0.6 }}>{cfg.label}</Typography>
                </Box>
                <Typography variant='h5' fontWeight={700}>{count}</Typography>
              </CardContent>
            </Card>
          )
        })}
      </Box>

      {/* Filters */}
      <Card>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              size='small'
              placeholder={t('changes.search')}
              value={search}
              onChange={e => setSearch(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position='start'>
                      <i className='ri-search-line' style={{ fontSize: 16 }} />
                    </InputAdornment>
                  )
                }
              }}
              sx={{ minWidth: 200 }}
            />
            <FormControl size='small' sx={{ minWidth: 140 }}>
              <Select
                value={resourceType}
                onChange={e => setResourceType(e.target.value)}
                displayEmpty
              >
                <MenuItem value=''>{t('changes.allTypes')}</MenuItem>
                <MenuItem value='vm'>VM</MenuItem>
                <MenuItem value='ct'>Container</MenuItem>
                <MenuItem value='node'>Node</MenuItem>
                <MenuItem value='storage'>Storage</MenuItem>
              </Select>
            </FormControl>
            <FormControl size='small' sx={{ minWidth: 160 }}>
              <Select
                value={action}
                onChange={e => setAction(e.target.value)}
                displayEmpty
              >
                <MenuItem value=''>{t('changes.allActions')}</MenuItem>
                <MenuItem value='config_changed'>{t('changes.actionConfigChanged')}</MenuItem>
                <MenuItem value='created'>{t('changes.actionCreated')}</MenuItem>
                <MenuItem value='deleted'>{t('changes.actionDeleted')}</MenuItem>
                <MenuItem value='migrated'>{t('changes.actionMigrated')}</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && (
        <Alert severity='error'>{t('common.error')}</Alert>
      )}

      {/* Timeline */}
      {changes.length === 0 && !isLoading ? (
        <EmptyState
          icon='ri-git-commit-line'
          title={t('changes.emptyTitle')}
          description={t('changes.emptyDescription')}
        />
      ) : (
        <Card>
          <CardContent>
            {groupedChanges.map(group => (
              <Box key={group.dayKey}>
                {/* Day separator */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, mt: 1 }}>
                  <Typography
                    variant='overline'
                    fontWeight={700}
                    sx={{ color: 'text.secondary', letterSpacing: 1.5 }}
                  >
                    {group.label}
                  </Typography>
                  <Box sx={{ flex: 1, height: 1, bgcolor: 'divider' }} />
                  <Chip size='small' label={group.changes.length} sx={{ height: 20, fontSize: '0.65rem' }} />
                </Box>

                {/* Changes in this day */}
                {group.changes.map(change => (
                  <TimelineEntry key={change.id} change={change} t={t} />
                ))}
              </Box>
            ))}
          </CardContent>
        </Card>
      )}
    </Stack>
  )
}
