import type { Upload, UploadResponse, StoredTransaction, TransactionCreate, TransactionUpdate, Category, CategoryCreate, CategoryUpdate, TxnBBox, PdfPagesResponse, ReuploadPreviewResponse, ReuploadConfirmResponse } from "@/lib/types"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api"

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

/**
 * Pydantic v2 serialises Decimal fields as strings in JSON.
 * Coerce them to JS numbers here so arithmetic works correctly throughout the app.
 * If parseing fails (genuinely bad data), the value becomes NaN which the UI
 * flags and allows the user to correct manually.
 */
function coerceTransaction(t: Record<string, unknown>): StoredTransaction {
  return {
    ...(t as unknown as StoredTransaction),
    amount: t.amount !== null && t.amount !== undefined ? Number(t.amount) : NaN,
    override_amount:
      t.override_amount !== null && t.override_amount !== undefined
        ? Number(t.override_amount)
        : null,
    balance:
      t.balance !== null && t.balance !== undefined ? Number(t.balance) : null,
    category_id: (t.category_id as string | null) ?? null,
    category_name: (t.category_name as string | null) ?? null,
    classification_level: (t.classification_level as number | null) ?? null,
    similarity_score: (t.similarity_score as number | null) ?? null,
    bbox: (t.bbox as TxnBBox | null) ?? null,
  }
}

export const api = {
  getUploads: () => apiFetch<Upload[]>("/uploads"),

  getUpload: (id: string) => apiFetch<Upload>(`/uploads/${id}`),

  getUploadTransactions: (id: string) =>
    apiFetch<Record<string, unknown>[]>(`/uploads/${id}/transactions`).then(
      (rows) => rows.map(coerceTransaction)
    ),

  createUpload: (file: File): Promise<UploadResponse> => {
    const form = new FormData()
    form.append("file", file)
    return apiFetch<UploadResponse>("/uploads", { method: "POST", body: form })
  },

  getPdfUrl: (id: string) => `${API_URL}/uploads/${id}/pdf`,

  getPdfPageCount: (id: string) =>
    apiFetch<PdfPagesResponse>(`/uploads/${id}/pages`),

  getPdfPageUrl: (id: string, page: number, scale = 2) =>
    `${API_URL}/uploads/${id}/pages/${page}?scale=${scale}`,

  createTransaction: (uploadId: string, body: TransactionCreate) =>
    apiFetch<Record<string, unknown>>(`/uploads/${uploadId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(coerceTransaction),

  updateTransaction: (uploadId: string, txnId: string, body: TransactionUpdate) =>
    apiFetch<Record<string, unknown>>(`/uploads/${uploadId}/transactions/${txnId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(coerceTransaction),

  deleteTransaction: (uploadId: string, txnId: string) =>
    fetch(`${API_URL}/uploads/${uploadId}/transactions/${txnId}`, { method: "DELETE" }).then(
      (res) => {
        if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
      }
    ),

  archiveUpload: (id: string) =>
    fetch(`${API_URL}/uploads/${id}`, { method: "DELETE" }).then((res) => {
      if (!res.ok) throw new Error(`Archive failed: ${res.status}`)
    }),

  reclassifyUpload: (id: string) =>
    apiFetch<{ status: string }>(`/uploads/${id}/classify`, { method: "POST" }),

  assignCategory: (uploadId: string, txnId: string, categoryId: string | null, learn: boolean = true) =>
    apiFetch<Record<string, unknown>>(
      `/uploads/${uploadId}/transactions/${txnId}/category`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: categoryId, learn }),
      }
    ).then(coerceTransaction),

  setOverrideAmount: (uploadId: string, txnId: string, amount: number | null) =>
    apiFetch<Record<string, unknown>>(
      `/uploads/${uploadId}/transactions/${txnId}/override`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ override_amount: amount }),
      }
    ).then(coerceTransaction),

  getCategories: () => apiFetch<Category[]>("/categories"),

  getCategoryExamples: (id: string) =>
    apiFetch<{ description: string; count: number; last_used_at: string | null }[]>(
      `/categories/${id}/examples`
    ),

  getCategoriesSpending: () =>
    apiFetch<{
      category_id: string
      category_name: string
      color: string | null
      reporting_rule: string
      month: string
      amount: number
    }[]>("/categories/spending"),

  createCategory: (body: CategoryCreate) =>
    apiFetch<Category>("/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  updateCategory: (id: string, body: CategoryUpdate) =>
    apiFetch<Category>(`/categories/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  deleteCategory: (id: string) =>
    fetch(`${API_URL}/categories/${id}`, { method: "DELETE" }).then((res) => {
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
    }),

  reuploadPreview: (uploadId: string, file: File): Promise<ReuploadPreviewResponse> => {
    const form = new FormData()
    form.append("file", file)
    return apiFetch<ReuploadPreviewResponse>(`/uploads/${uploadId}/reupload/preview`, {
      method: "POST",
      body: form,
    })
  },

  reuploadConfirm: (uploadId: string, file: File): Promise<ReuploadConfirmResponse> => {
    const form = new FormData()
    form.append("file", file)
    return apiFetch<ReuploadConfirmResponse>(`/uploads/${uploadId}/reupload/confirm`, {
      method: "POST",
      body: form,
    })
  },
}
