'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UploadDropzoneProps {
  onFileSelect: (file: File) => void
  disabled?: boolean
}

const ACCEPTED_TYPES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
]
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB

export function UploadDropzone({ onFileSelect, disabled }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  function validateFile(file: File): string | null {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      return 'Chỉ chấp nhận file .xlsx, .xls hoặc .csv'
    }
    if (file.size > MAX_FILE_SIZE) {
      return `File quá lớn. Tối đa ${MAX_FILE_SIZE / 1024 / 1024}MB`
    }
    return null
  }

  function handleFile(file: File) {
    setError(null)
    const err = validateFile(file)
    if (err) {
      setError(err)
      return
    }
    setSelectedFile(file)
    onFileSelect(file)
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      if (disabled) return
      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [disabled] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled) setIsDragging(true)
    },
    [disabled]
  )

  const handleDragLeave = useCallback(() => {
    setIsDragging(false)
  }, [])

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedFile(null)
    setError(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  if (selectedFile) {
    return (
      <div className="border-2 border-green-300 dark:border-green-700 rounded-xl p-6 bg-green-50 dark:bg-green-950">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={handleRemove}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !disabled && inputRef.current?.click()}
        className={cn(
          'border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer',
          isDragging
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-950 dark:border-blue-600'
            : 'border-slate-300 dark:border-slate-600 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-slate-50 dark:hover:bg-slate-800/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              'w-12 h-12 rounded-xl flex items-center justify-center transition-colors',
              isDragging
                ? 'bg-blue-100 dark:bg-blue-900'
                : 'bg-slate-100 dark:bg-slate-800'
            )}
          >
            <Upload
              className={cn(
                'w-6 h-6',
                isDragging
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-400 dark:text-slate-500'
              )}
            />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {isDragging ? 'Thả file vào đây' : 'Kéo thả file hoặc nhấn để chọn'}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Hỗ trợ: .xlsx, .xls, .csv — Tối đa 20MB
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 text-red-600 dark:text-red-400 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={handleInputChange}
        disabled={disabled}
      />
    </div>
  )
}
