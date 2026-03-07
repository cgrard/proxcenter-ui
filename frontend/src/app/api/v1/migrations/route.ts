import { NextResponse, after } from "next/server"
import { getServerSession } from "next-auth"

import { prisma } from "@/lib/db/prisma"
import { checkPermission, PERMISSIONS } from "@/lib/rbac"
import { authOptions } from "@/lib/auth/config"
import { runMigrationPipeline } from "@/lib/migration/pipeline"

export const runtime = "nodejs"

/**
 * POST /api/v1/migrations
 * Start a new ESXi → Proxmox migration
 */
export async function POST(req: Request) {
  try {
    const denied = await checkPermission(PERMISSIONS.VM_MIGRATE)
    if (denied) return denied

    const session = await getServerSession(authOptions)
    const body = await req.json().catch(() => null)
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })

    const {
      sourceConnectionId,
      sourceVmId,
      targetConnectionId,
      targetNode,
      targetStorage,
      networkBridge = "vmbr0",
      startAfterMigration = false,
    } = body

    if (!sourceConnectionId || !sourceVmId || !targetConnectionId || !targetNode || !targetStorage) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Verify connections exist
    const [esxiConn, pveConn] = await Promise.all([
      prisma.connection.findUnique({ where: { id: sourceConnectionId }, select: { id: true, type: true, name: true, baseUrl: true } }),
      prisma.connection.findUnique({ where: { id: targetConnectionId }, select: { id: true, type: true, name: true } }),
    ])

    if (!esxiConn || esxiConn.type !== "vmware") {
      return NextResponse.json({ error: "ESXi connection not found" }, { status: 404 })
    }
    if (!pveConn || pveConn.type !== "pve") {
      return NextResponse.json({ error: "Proxmox connection not found" }, { status: 404 })
    }

    // Create job record
    const job = await prisma.migrationJob.create({
      data: {
        sourceConnectionId,
        sourceVmId,
        sourceHost: esxiConn.baseUrl,
        targetConnectionId,
        targetNode,
        targetStorage,
        config: JSON.stringify({ sourceConnectionId, sourceVmId, targetConnectionId, targetNode, targetStorage, networkBridge, startAfterMigration }),
        status: "pending",
        currentStep: "pending",
        startedAt: new Date(),
        createdBy: session?.user?.id || null,
      },
    })

    // Run pipeline in background after response
    after(async () => {
      await runMigrationPipeline(job.id, {
        sourceConnectionId,
        sourceVmId,
        targetConnectionId,
        targetNode,
        targetStorage,
        networkBridge,
        startAfterMigration,
      })
    })

    return NextResponse.json({ data: { jobId: job.id, status: "pending" } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}

/**
 * GET /api/v1/migrations
 * List migration jobs
 */
export async function GET() {
  try {
    const denied = await checkPermission(PERMISSIONS.VM_MIGRATE)
    if (denied) return denied

    const jobs = await prisma.migrationJob.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    })

    return NextResponse.json({
      data: jobs.map(j => ({
        ...j,
        bytesTransferred: j.bytesTransferred ? Number(j.bytesTransferred) : null,
        totalBytes: j.totalBytes ? Number(j.totalBytes) : null,
        logs: j.logs ? JSON.parse(j.logs) : [],
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
