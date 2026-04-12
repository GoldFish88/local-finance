"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle } from "lucide-react"
import { api } from "@/lib/api"
import { UploadDropzone } from "@/components/upload-dropzone"
import { LoadingScreen } from "@/components/loading-screen"
import { Alert, AlertDescription } from "@/components/ui/alert"

type State =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "polling"; uploadId: string; transactionCount: number }
  | { status: "error"; message: string }

export default function UploadPage() {
  const router = useRouter()
  const [state, setState] = useState<State>({ status: "idle" })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Poll upload status until done or failed
  useEffect(() => {
    if (state.status !== "polling") return

    const { uploadId } = state
    pollRef.current = setInterval(async () => {
      try {
        const upload = await api.getUpload(uploadId)
        if (upload.status === "done") {
          clearInterval(pollRef.current!)
          router.push(`/uploads/${uploadId}/review`)
        } else if (upload.status === "failed") {
          clearInterval(pollRef.current!)
          setState({ status: "error", message: upload.error_message ?? "Processing failed." })
        } else {
          setState((prev) =>
            prev.status === "polling"
              ? { ...prev, transactionCount: upload.transaction_count }
              : prev
          )
        }
      } catch {
        // transient network error — keep polling
      }
    }, 2000)

    return () => clearInterval(pollRef.current!)
  }, [state, router])

  const handleFile = useCallback(async (file: File) => {
    setState({ status: "uploading" })
    try {
      const { upload_id } = await api.createUpload(file)
      setState({ status: "polling", uploadId: upload_id, transactionCount: 0 })
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Upload failed.",
      })
    }
  }, [])

  if (state.status === "uploading" || state.status === "polling") {
    return (
      <LoadingScreen
        uploading={state.status === "uploading"}
        transactionCount={state.status === "polling" ? state.transactionCount : 0}
      />
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-16 space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Upload Statement</h1>
        <p className="text-muted-foreground">
          Drop an ANZ bank statement PDF to extract and store transactions
        </p>
      </div>

      {state.status === "error" && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <UploadDropzone onFile={handleFile} />
    </div>
  )
}
