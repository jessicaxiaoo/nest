import { useRef, useState } from 'react'
import { compressImage } from '../lib/image'
import PhotoGuidelines from './PhotoGuidelines'

export default function PhotoUpload({
  photo,
  onPhotoChange,
  error,
  showGuidelines = true,
  label = 'Drop a photo here, or click to browse',
  hint = null,
  compress = true,
}) {
  const inputRef = useRef(null)
  const [processing, setProcessing] = useState(false)
  const [processError, setProcessError] = useState('')

  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) return

    setProcessing(true)
    setProcessError('')

    try {
      const result = compress ? await compressImage(file) : await readAsDataUrl(file)
      onPhotoChange(result)
      if (inputRef.current) inputRef.current.value = ''
    } catch {
      setProcessError('Could not process that image — try a different photo.')
    } finally {
      setProcessing(false)
    }
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  function handleDrop(e) {
    e.preventDefault()
    if (!processing) handleFile(e.dataTransfer.files[0])
  }

  const displayError = error || processError

  return (
    <div className="space-y-4">
      {showGuidelines && <PhotoGuidelines />}

      {photo ? (
        <div className="relative overflow-hidden rounded-lg border border-gray-200">
          <img
            src={photo}
            alt="Upload preview"
            className="aspect-[4/3] w-full object-cover"
          />
          <button
            type="button"
            onClick={() => {
              onPhotoChange(null)
              if (inputRef.current) inputRef.current.value = ''
            }}
            className="absolute right-3 top-3 rounded-md bg-white/90 px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:bg-white"
          >
            Replace photo
          </button>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => !processing && inputRef.current?.click()}
          onKeyDown={(e) =>
            e.key === 'Enter' && !processing && inputRef.current?.click()
          }
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-16 transition-colors ${
            processing
              ? 'cursor-wait border-gray-200 bg-gray-50'
              : 'cursor-pointer border-gray-200 hover:border-nest/40 hover:bg-nest-muted/50'
          }`}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="mb-3 h-8 w-8 text-gray-300"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="text-sm font-medium text-gray-700">
            {processing ? 'Processing photo…' : label}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {hint ?? 'JPEG or PNG'}
          </p>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files[0])}
      />

      {displayError && <p className="text-sm text-red-600">{displayError}</p>}
    </div>
  )
}
