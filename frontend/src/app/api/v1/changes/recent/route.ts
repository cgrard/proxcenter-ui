import { NextResponse } from 'next/server'

import { orchestratorFetch } from '@/lib/orchestrator/client'
import { checkPermission, PERMISSIONS } from '@/lib/rbac'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const permError = await checkPermission(PERMISSIONS.EVENTS_VIEW)
    if (permError) return permError

    const { searchParams } = new URL(req.url)
    const limit = searchParams.get('limit') || '10'

    const data = await orchestratorFetch<any>(`/changes/recent?limit=${limit}`)

    return NextResponse.json(data)
  } catch (error: any) {
    console.error('Error fetching recent changes:', error)

    return NextResponse.json(
      { error: error?.message || 'Server error' },
      { status: 500 }
    )
  }
}
