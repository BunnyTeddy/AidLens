import { useEffect, useRef, useState } from 'react'
import { Mic, Square, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VoiceRecorderProps {
  onChange: (file: File | null, durationSeconds: number) => void
}

export function VoiceRecorder({ onChange }: VoiceRecorderProps) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [previewUrl, setPreviewUrl] = useState<string>()
  const recorderRef = useRef<MediaRecorder | undefined>(undefined)
  const streamRef = useRef<MediaStream | undefined>(undefined)
  const chunksRef = useRef<Blob[]>([])
  const secondsRef = useRef(0)

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current >= 59) recorderRef.current?.stop()
        const next = Math.min(current + 1, 60)
        secondsRef.current = next
        return next
      })
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [recording])

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    if (previewUrl) URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    streamRef.current = stream
    recorderRef.current = recorder
    chunksRef.current = []
    secondsRef.current = 0
    setSeconds(0)
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
      const file = new File([blob], 'claim-report.webm', { type: 'audio/webm' })
      const nextUrl = URL.createObjectURL(blob)
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return nextUrl
      })
      setRecording(false)
      stream.getTracks().forEach((track) => track.stop())
      onChange(file, secondsRef.current)
    }
    recorder.start()
    setRecording(true)
  }

  function stopRecording() {
    recorderRef.current?.stop()
  }

  function clearRecording() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(undefined)
    secondsRef.current = 0
    setSeconds(0)
    onChange(null, 0)
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-white/12 bg-white/[0.025] p-4">
      {recording ? (
        <Button type="button" variant="destructive" onClick={stopRecording}>
          <Square className="size-4" /> Stop · {seconds}s
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={() => void startRecording()}>
          <Mic className="size-4" /> Record voice report
        </Button>
      )}
      {previewUrl && <audio className="h-9 max-w-full" controls src={previewUrl} aria-label="Voice report preview" />}
      {previewUrl && (
        <Button type="button" size="icon" variant="ghost" onClick={clearRecording} aria-label="Remove voice report">
          <Trash2 className="size-4" />
        </Button>
      )}
      <p className="basis-full text-xs text-muted-foreground">Optional · maximum 60 seconds · processed by Whisper on 0G in live mode.</p>
    </div>
  )
}
