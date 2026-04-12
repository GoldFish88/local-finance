export type ExtractionMethod = "docling" | "vision_fallback"

// ── Stateless extraction (POST /extract) ──────────────────────────────────

export interface Transaction {
  date: string
  description: string
  amount: number
  balance: number | null
  extraction_method: ExtractionMethod
}

export interface ExtractionSummary {
  docling_count: number
  vision_fallback_count: number
  failed_count: number
}

export interface ExtractionResult {
  upload_filename: string
  transaction_count: number
  transactions: Transaction[]
  extraction_summary: ExtractionSummary
}

// ── Persisted uploads (POST /uploads, GET /uploads) ───────────────────────

export type UploadStatus = "processing" | "done" | "failed"

export interface Upload {
  id: string
  filename: string
  bank_name: string
  account_type: string | null
  period_start: string | null
  period_end: string | null
  uploaded_at: string | null
  status: UploadStatus
  error_message: string | null
  transaction_count: number
  archived_at: string | null
}

export interface StoredTransaction {
  id: string
  upload_id: string
  date: string
  description: string
  amount: number
  override_amount: number | null
  balance: number | null
  status: string
  category_id: string | null
  category_name: string | null
  classification_level: number | null
  similarity_score: number | null
  dedup_hash: string
  created_at: string | null
  bbox: TxnBBox | null
}

export interface TxnBBox {
  page: number
  x1: number
  y1: number
  x2: number
  y2: number
  page_w: number
  page_h: number
}

export interface PageInfo {
  width_pt: number
  height_pt: number
}

export interface PdfPagesResponse {
  page_count: number
  pages: PageInfo[]
}

export interface UploadResponse {
  upload_id: string
  status: string
}

export interface ReuploadPreviewTransaction {
  date: string
  description: string
  amount: number
  balance: number | null
  dedup_hash: string
}

export interface ReuploadPreviewResponse {
  new_count: number
  existing_count: number
  total_in_file: number
  filename_changed: boolean
  original_filename: string
  new_filename: string
  date_range_warning: string | null
  new_transactions: ReuploadPreviewTransaction[]
}

export interface ReuploadConfirmResponse {
  added_count: number
  classified_count: number
}

export interface TransactionCreate {
  date: string        // ISO date: "YYYY-MM-DD"
  description: string
  amount: number
  balance?: number
  bbox?: TxnBBox
}

export interface TransactionUpdate {
  date?: string
  description?: string
  amount?: number
  balance?: number
  bbox?: TxnBBox
}

export type ReportingRule = "default" | "expense" | "income" | "transfer"

export interface Category {
  id: string
  name: string
  parent_id: string | null
  color: string | null
  icon: string | null
  reporting_rule: ReportingRule
  example_count: number
}

export interface CategoryCreate {
  name: string
  color?: string
  reporting_rule?: ReportingRule
  seed_phrases: string[]
}

export interface CategoryUpdate {
  name?: string
  color?: string
  reporting_rule?: ReportingRule
  seed_phrases?: string[]
}
