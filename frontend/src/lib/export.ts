/**
 * CSV and XLSX export utilities.
 *
 * xlsx (SheetJS) is imported dynamically so it is only bundled client-side
 * and only loaded when the user actually triggers an export.
 */

export interface ExportRow {
    Date: string
    Description: string
    Amount: number | string
    Balance: number | string | null
    Source?: string
    Status?: string
}

function escapeCSV(v: unknown): string {
    if (v === null || v === undefined) return ""
    const s = String(v)
    return /[,"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/**
 * Download rows as a UTF-8 CSV file with a BOM so Excel opens it correctly.
 */
export function exportToCSV(rows: ExportRow[], filename: string): void {
    if (rows.length === 0) return
    const headers = Object.keys(rows[0]) as (keyof ExportRow)[]
    const lines = [
        headers.join(","),
        ...rows.map((r) => headers.map((h) => escapeCSV(r[h])).join(",")),
    ]
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8;",
    })
    triggerDownload(URL.createObjectURL(blob), filename)
}

/**
 * Download rows as an XLSX file. Uses a dynamic import so the ~450 KB xlsx
 * bundle is only fetched when needed.
 */
export async function exportToXLSX(
    rows: ExportRow[],
    filename: string
): Promise<void> {
    if (rows.length === 0) return
    const XLSX = await import("xlsx")
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, "Transactions")
    XLSX.writeFile(wb, filename)
}

function triggerDownload(url: string, filename: string): void {
    const a = document.createElement("a")
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}
