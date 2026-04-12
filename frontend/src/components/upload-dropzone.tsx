"use client"

import { useCallback } from "react"
import { useDropzone } from "react-dropzone"
import { Upload, FileText } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card, CardContent } from "@/components/ui/card"

interface UploadDropzoneProps {
  onFile: (file: File) => void
  disabled?: boolean
}

export function UploadDropzone({ onFile, disabled }: UploadDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles[0]) onFile(acceptedFiles[0])
    },
    [onFile]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled,
  })

  return (
    <Card>
      <CardContent className="p-0">
        <div
          {...getRootProps()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 sm:gap-4 p-6 sm:p-14 rounded-xl border-2 border-dashed cursor-pointer transition-colors",
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <FileText className="h-10 w-10 sm:h-14 sm:w-14 text-primary" />
          ) : (
            <Upload className="h-10 w-10 sm:h-14 sm:w-14 text-muted-foreground" />
          )}
          <div className="text-center space-y-1">
            <p className="font-semibold text-base sm:text-lg">
              {isDragActive ? "Drop to extract" : "Drop your ANZ statement here"}
            </p>
            <p className="text-sm text-muted-foreground">or tap to browse · PDF only</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
