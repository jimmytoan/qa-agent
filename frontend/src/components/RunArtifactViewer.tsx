import { useState } from 'react'
import { X, Film, Camera } from 'lucide-react'

import { API_BASE_URL, type RunArtifact } from '../lib/api'

interface Props {
  artifacts: RunArtifact[]
}

export function RunArtifactViewer({ artifacts }: Props) {
  const [lightbox, setLightbox] = useState<string | null>(null)

  const screenshots = [...artifacts.filter((a) => a.kind === 'screenshot')].sort((a, b) => a.id - b.id)
  const gifs = artifacts.filter((a) => a.kind === 'gif')

  if (artifacts.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No artifacts generated for this run.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {/* GIF Recording */}
      {gifs.map((gif) => (
        <div key={gif.id} className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Film className="w-3.5 h-3.5" />
            Session Recording
          </h4>
          <img
            src={`${API_BASE_URL}${gif.url}`}
            alt="Session recording GIF"
            className="w-full rounded-md border object-contain max-h-80 bg-muted cursor-zoom-in"
            onClick={() => setLightbox(`${API_BASE_URL}${gif.url}`)}
          />
        </div>
      ))}

      {/* Per-step screenshots */}
      {screenshots.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" />
            Step Screenshots ({screenshots.length})
          </h4>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {screenshots.map((s, i) => (
              <div key={s.id} className="flex-none flex flex-col items-center gap-1">
                <img
                  src={`${API_BASE_URL}${s.url}`}
                  alt={`Step ${i + 1}`}
                  className="h-28 w-44 object-cover rounded border cursor-zoom-in hover:opacity-90 transition-opacity bg-muted"
                  onClick={() => setLightbox(`${API_BASE_URL}${s.url}`)}
                />
                <span className="text-xs text-muted-foreground">Step {i + 1}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox overlay */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 text-white/80 hover:text-white"
            onClick={() => setLightbox(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightbox}
            alt="Artifact preview"
            className="max-w-full max-h-full rounded-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  )
}
