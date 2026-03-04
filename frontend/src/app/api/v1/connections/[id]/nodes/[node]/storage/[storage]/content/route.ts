import { NextResponse } from "next/server"

import { pveFetch } from "@/lib/proxmox/client"
import { getConnectionById } from "@/lib/connections/getConnection"
import { checkPermission, PERMISSIONS } from "@/lib/rbac"

export const runtime = "nodejs"

// GET /api/v1/connections/{id}/nodes/{node}/storage/{storage}/content?content=iso
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; node: string; storage: string }> }
) {
  try {
    const { id, node, storage } = await ctx.params

    const denied = await checkPermission(PERMISSIONS.VM_VIEW, "connection", id)
    if (denied) return denied

    const conn = await getConnectionById(id)

    const url = new URL(req.url)
    const contentType = url.searchParams.get("content") || ""

    const query = contentType ? `?content=${encodeURIComponent(contentType)}` : ""
    const data = await pveFetch<any[]>(
      conn,
      `/nodes/${encodeURIComponent(node)}/storage/${encodeURIComponent(storage)}/content${query}`
    )

    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    console.error("Error fetching storage content:", e)
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 })
  }
}
