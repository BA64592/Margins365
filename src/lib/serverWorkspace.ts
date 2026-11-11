/**
 * GA-40 / GA-41 — sync product data with server SoT (browser = cache).
 */

export type WorkspacePayload = {
  lines: unknown[]
  costs: unknown[]
  ads: unknown[]
  scenarios: unknown[]
  savedDatasets: unknown[]
  usageUniqueOrderIds: string[]
  periodKey?: string
}

export async function listShopIds(): Promise<string[]> {
  try {
    const res = await fetch('/api/shops', { credentials: 'include' })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      shops?: { id: string }[]
    }
    if (!res.ok || !data.ok || !data.shops?.length) return []
    return data.shops.map((s) => s.id)
  } catch {
    return []
  }
}

export async function fetchWorkspace(shopId: string): Promise<{
  ok: boolean
  empty?: boolean
  shopId?: string
  lines?: unknown[]
  costs?: unknown[]
  ads?: unknown[]
  scenarios?: unknown[]
  savedDatasets?: unknown[]
  usageUniqueOrderIds?: string[]
  usageUniqueOrderCount?: number
  orderLimit?: number
  periodKey?: string
  updatedAt?: string | null
  message?: string
  code?: string
} | null> {
  try {
    const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/workspace`, {
      credentials: 'include',
    })
    const data = await res.json().catch(() => ({}))
    return data
  } catch {
    return null
  }
}

export async function pushWorkspace(
  shopId: string,
  payload: WorkspacePayload,
): Promise<{
  ok: boolean
  message?: string
  code?: string
  usageUniqueOrderIds?: string[]
  usageUniqueOrderCount?: number
  orderLimit?: number
}> {
  try {
    const res = await fetch(`/api/shops/${encodeURIComponent(shopId)}/workspace`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean
      message?: string
      code?: string
      usageUniqueOrderIds?: string[]
      usageUniqueOrderCount?: number
      orderLimit?: number
    }
    return {
      ok: Boolean(res.ok && data.ok),
      message: data.message,
      code: data.code,
      usageUniqueOrderIds: data.usageUniqueOrderIds,
      usageUniqueOrderCount: data.usageUniqueOrderCount,
      orderLimit: data.orderLimit,
    }
  } catch {
    return { ok: false, message: 'Could not reach server to save shop data.' }
  }
}
