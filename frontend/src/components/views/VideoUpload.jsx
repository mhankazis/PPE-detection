import { useState, useRef, useMemo, useCallback, useEffect } from "react"
import { Upload, FileVideo, X, Play, Info, CheckCircle2, AlertTriangle, Shield, ShieldAlert, Loader2, Clock, Users, BarChart3, Filter, Zap, Download, Camera, Check, Trash2, Send } from "lucide-react"

const API_BASE = "http://localhost:8000"

const ALL_CLASSES = ['Person', 'Helmet', 'Uniform', 'Hijab', 'Glasses']

const CLASS_BADGE_COLORS = {
    Person: 'bg-blue-500',
    Helmet: 'bg-green-500',
    Uniform: 'bg-teal-500',
    Hijab: 'bg-fuchsia-500',
    Glasses: 'bg-yellow-500',
}

const CLASS_DRAW_COLORS = {
    Person: '#3b82f6',
    Helmet: '#22c55e',
    Uniform: '#14b8a6',
    Hijab: '#d946ef',
    Glasses: '#eab308',
}

// English (backend) → Indonesian (UI) translation for PPE labels.
const PPE_TO_ID = {
    Helmet: 'Helm',
    Uniform: 'Seragam',
    Hijab: 'Hijab',
    Glasses: 'Kacamata',
    Person: 'Orang',
}
const ppeToId = (label) => PPE_TO_ID[label] || label

export default function VideoUploadContent() {
    const [selectedVideo, setSelectedVideo] = useState(null)
    const [previewUrl, setPreviewUrl] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [results, setResults] = useState(null)
    const [videoSrc, setVideoSrc] = useState(null)
    const [error, setError] = useState(null)
    const [activeFilters, setActiveFilters] = useState(new Set(ALL_CLASSES))
    const [currentFrameData, setCurrentFrameData] = useState(null)
    const [isRendering, setIsRendering] = useState(false)
    const [downloadError, setDownloadError] = useState(null)
    const [capturedFrames, setCapturedFrames] = useState([])
    const [isCapturing, setIsCapturing] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [submitStatus, setSubmitStatus] = useState(null)
    const [videoPaused, setVideoPaused] = useState(false)
    const fileInputRef = useRef(null)
    const videoRef = useRef(null)
    const canvasRef = useRef(null)
    const animFrameRef = useRef(null)

    // === Filter Logic ===
    const toggleFilter = (cls) => {
        setActiveFilters(prev => {
            const next = new Set(prev)
            if (next.has(cls)) {
                if (next.size > 1) next.delete(cls)
            } else {
                next.add(cls)
            }
            return next
        })
    }

    const toggleAllFilters = () => {
        if (activeFilters.size === ALL_CLASSES.length) {
            setActiveFilters(new Set(['Person']))
        } else {
            setActiveFilters(new Set(ALL_CLASSES))
        }
    }

    const handleDownloadAnnotated = async () => {
        if (!results?.video_url) return
        setDownloadError(null)
        setIsRendering(true)
        try {
            const videoFilename = results.video_url.split('/').pop()
            const res = await fetch(`${API_BASE}/api/detect/video-annotated`, {
                method: 'POST',
                body: (() => {
                    const fd = new FormData()
                    fd.append('video_filename', videoFilename)
                    return fd
                })(),
            })
            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.detail || `Render gagal (${res.status})`)
            }
            const data = await res.json()
            // Trigger download
            const a = document.createElement('a')
            a.href = `${API_BASE}${data.annotated_video_url}`
            a.download = `annotated_${videoFilename}`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
        } catch (e) {
            setDownloadError(e.message || 'Gagal membuat video annotated')
        } finally {
            setIsRendering(false)
        }
    }

    // === Capture current video frame + canvas overlay as evidence image ===
    const captureCurrentFrame = useCallback(async () => {
        const video = videoRef.current
        if (!video || !results || !currentFrameData) return

        if (!video.paused) {
            setError('Pause video di frame pelanggaran terlebih dahulu.')
            return
        }

        setIsCapturing(true)
        setError(null)
        try {
            const vidW = results.video_dimensions?.width || video.videoWidth
            const vidH = results.video_dimensions?.height || video.videoHeight
            if (!vidW || !vidH) throw new Error('Video dimensions not available')

            const captureCanvas = document.createElement('canvas')
            captureCanvas.width = vidW
            captureCanvas.height = vidH
            const ctx = captureCanvas.getContext('2d')

            ctx.drawImage(video, 0, 0, vidW, vidH)

            for (const det of currentFrameData.detections) {
                if (!activeFilters.has(det.label)) continue
                const [x1, y1, x2, y2] = det.bbox
                const color = CLASS_DRAW_COLORS[det.label] || '#ffffff'
                ctx.strokeStyle = color
                ctx.lineWidth = 3
                ctx.strokeRect(x1, y1, x2 - x1, y2 - y1)

                const text = `${ppeToId(det.label)} ${(det.confidence * 100).toFixed(0)}%`
                ctx.font = 'bold 16px Inter, system-ui, sans-serif'
                const tm = ctx.measureText(text)
                ctx.fillStyle = color
                ctx.fillRect(x1, y1 - 22, tm.width + 12, 22)
                ctx.fillStyle = '#ffffff'
                ctx.fillText(text, x1 + 6, y1 - 6)
            }

            if (currentFrameData.compliance) {
                for (const comp of currentFrameData.compliance) {
                    if (comp.is_compliant) continue
                    const [x1, , , y2] = comp.person_bbox
                    const missing = comp.missing_ppe.map(ppeToId).join(', ')
                    const statusText = `KURANG: ${missing}`
                    const nameText = comp.identified_name || null

                    ctx.font = 'bold 16px Inter, system-ui, sans-serif'
                    const tm = ctx.measureText(statusText)
                    const nameTm = nameText ? ctx.measureText(nameText) : { width: 0 }
                    const barW = Math.max(tm.width + 16, nameTm.width + 16)
                    const barH = 26
                    const nameBarH = nameText ? 22 : 0

                    ctx.fillStyle = '#dc2626'
                    ctx.globalAlpha = 0.92
                    ctx.fillRect(x1, y2, barW, barH)
                    ctx.globalAlpha = 1.0
                    ctx.fillStyle = '#ffffff'
                    ctx.fillText(statusText, x1 + 8, y2 + barH - 8)

                    if (nameText) {
                        ctx.fillStyle = '#2563eb'
                        ctx.globalAlpha = 0.95
                        ctx.fillRect(x1, y2 - nameBarH, barW, nameBarH)
                        ctx.globalAlpha = 1.0
                        ctx.fillStyle = '#ffffff'
                        ctx.fillText(nameText, x1 + 8, y2 - 6)
                    }
                }
            }

            const blob = await new Promise((resolve) => {
                captureCanvas.toBlob(resolve, 'image/jpeg', 0.92)
            })
            if (!blob) throw new Error('Failed to capture frame')

            const frameRecord = {
                id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                blob,
                url: URL.createObjectURL(blob),
                timestamp: video.currentTime,
                frame_index: currentFrameData.frame_index,
                compliance: currentFrameData.compliance,
                detections: currentFrameData.detections,
                violation_count: currentFrameData.compliance
                    ? currentFrameData.compliance.filter(c => !c.is_compliant).length
                    : 0,
            }
            setCapturedFrames(prev => [...prev, frameRecord])
        } catch (e) {
            setError(e.message || 'Gagal capture frame')
        } finally {
            setIsCapturing(false)
        }
    }, [results, currentFrameData, activeFilters])

    const removeCapturedFrame = (id) => {
        setCapturedFrames(prev => {
            const target = prev.find(f => f.id === id)
            if (target) URL.revokeObjectURL(target.url)
            return prev.filter(f => f.id !== id)
        })
    }

    // === Submit captured frames as violation logs to backend ===
    const submitViolations = async (frameRecord) => {
        const frames = frameRecord ? [frameRecord] : capturedFrames
        if (frames.length === 0) return

        setIsSubmitting(true)
        setSubmitStatus(null)
        let success = 0
        let failed = 0

        for (const frame of frames) {
            const violations = (frame.compliance || []).filter(c => !c.is_compliant)
            if (violations.length === 0) {
                failed += 1
                continue
            }
            for (const comp of violations) {
                try {
                    const missing = comp.missing_ppe.map(ppeToId).join(', ')
                    const severity = comp.missing_ppe.length >= 2 ? 'High' : 'Medium'

                    const formData = new FormData()
                    formData.append('violation_type', `Kurang: ${missing}`)
                    formData.append('severity', severity)
                    formData.append('student_id', comp.identified_student_id != null ? String(comp.identified_student_id) : '')
                    formData.append('camera_id', '')
                    formData.append('file', frame.blob, `evidence_${frame.frame_index}_${Date.now()}.jpg`)

                    const res = await fetch(`${API_BASE}/api/logs`, {
                        method: 'POST',
                        body: formData,
                    })
                    if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        throw new Error(err.detail || `HTTP ${res.status}`)
                    }
                    success += 1
                } catch (e) {
                    console.error('Submit violation failed:', e)
                    failed += 1
                }
            }
        }

        setIsSubmitting(false)
        setSubmitStatus({ success, failed })

        if (!frameRecord && failed === 0) {
            capturedFrames.forEach(f => URL.revokeObjectURL(f.url))
            setCapturedFrames([])
        }
    }

    // Get all unique detections across all frames for filter counts
    const allDetections = useMemo(() => {
        if (!results) return []
        const dets = []
        for (const fd of results.frame_detections) {
            for (const d of fd.detections) {
                dets.push(d)
            }
        }
        return dets
    }, [results])

    // === Find closest frame detection for a given time ===
    const getFrameDataAtTime = useCallback((currentTime) => {
        if (!results || !results.frame_detections.length) return null

        let closest = results.frame_detections[0]
        for (const fd of results.frame_detections) {
            if (fd.timestamp <= currentTime) {
                closest = fd
            } else {
                break
            }
        }
        return closest
    }, [results])

    // === Canvas Drawing ===
    const drawBoundingBoxes = useCallback((frameData) => {
        const canvas = canvasRef.current
        const video = videoRef.current
        if (!canvas || !video || !frameData || !results) return

        const displayW = video.clientWidth
        const displayH = video.clientHeight
        canvas.width = displayW
        canvas.height = displayH

        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, displayW, displayH)

        const vidW = results.video_dimensions?.width || video.videoWidth
        const vidH = results.video_dimensions?.height || video.videoHeight
        if (!vidW || !vidH) return

        const scaleX = displayW / vidW
        const scaleY = displayH / vidH

        // Draw filtered detection boxes
        for (const det of frameData.detections) {
            if (!activeFilters.has(det.label)) continue

            const [x1, y1, x2, y2] = det.bbox
            const sx = x1 * scaleX
            const sy = y1 * scaleY
            const sw = (x2 - x1) * scaleX
            const sh = (y2 - y1) * scaleY
            const color = CLASS_DRAW_COLORS[det.label] || '#ffffff'

            ctx.strokeStyle = color
            ctx.lineWidth = 2.5
            ctx.strokeRect(sx, sy, sw, sh)

            const text = `${ppeToId(det.label)} ${(det.confidence * 100).toFixed(0)}%`
            ctx.font = 'bold 12px Inter, system-ui, sans-serif'
            const tm = ctx.measureText(text)
            const labelH = 20
            ctx.fillStyle = color
            ctx.fillRect(sx, sy - labelH, tm.width + 10, labelH)
            ctx.fillStyle = '#ffffff'
            ctx.fillText(text, sx + 5, sy - 5)
        }

        // Compliance labels
        if (activeFilters.has('Person') && frameData.compliance) {
            for (const comp of frameData.compliance) {
                const [x1, , , y2] = comp.person_bbox
                const sx = x1 * scaleX
                const sy2 = y2 * scaleY

                const statusText = comp.is_compliant
                    ? '✓ APD LENGKAP'
                    : `✗ KURANG: ${comp.missing_ppe.map(ppeToId).join(', ')}`

                const nameText = comp.identified_name ? `👤 ${comp.identified_name}` : null
                ctx.font = 'bold 11px Inter, system-ui, sans-serif'
                const tm = ctx.measureText(statusText)
                const nameTm = nameText ? ctx.measureText(nameText) : { width: 0 }
                const barW = Math.max(tm.width + 14, nameTm.width + 14)
                const barH = 20
                const nameBarH = nameText ? 18 : 0

                // Status bar
                const bgColor = comp.is_compliant ? '#16a34a' : '#dc2626'
                ctx.fillStyle = bgColor
                ctx.globalAlpha = 0.9
                ctx.fillRect(sx, sy2, barW, barH)
                ctx.globalAlpha = 1.0
                ctx.fillStyle = '#ffffff'
                ctx.fillText(statusText, sx + 7, sy2 + barH - 5)

                // Name bar (above status)
                if (nameText) {
                    ctx.fillStyle = '#2563eb'
                    ctx.globalAlpha = 0.95
                    ctx.fillRect(sx, sy2 - nameBarH, barW, nameBarH)
                    ctx.globalAlpha = 1.0
                    ctx.fillStyle = '#ffffff'
                    ctx.fillText(nameText, sx + 7, sy2 - 5)
                }
            }
        }
    }, [results, activeFilters])

    // === Video-Canvas Sync ===
    const syncCanvas = useCallback(() => {
        const video = videoRef.current
        if (!video || !results) return

        const frameData = getFrameDataAtTime(video.currentTime)
        if (frameData) {
            setCurrentFrameData(frameData)
            drawBoundingBoxes(frameData)
        }
    }, [results, getFrameDataAtTime, drawBoundingBoxes])

    // Redraw when filters change
    useEffect(() => {
        if (currentFrameData) {
            drawBoundingBoxes(currentFrameData)
        }
    }, [activeFilters, currentFrameData, drawBoundingBoxes])

    // Set up video event listeners for canvas sync
    useEffect(() => {
        const video = videoRef.current
        if (!video || !results) return

        const onTimeUpdate = () => syncCanvas()
        const onSeeked = () => syncCanvas()
        const onPlay = () => {
            setVideoPaused(false)
            const loop = () => {
                if (!video.paused && !video.ended) {
                    syncCanvas()
                    animFrameRef.current = requestAnimationFrame(loop)
                }
            }
            animFrameRef.current = requestAnimationFrame(loop)
        }
        const onPause = () => {
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current)
            }
            syncCanvas()
            setVideoPaused(true)
        }
        const onLoadedData = () => syncCanvas()

        video.addEventListener('timeupdate', onTimeUpdate)
        video.addEventListener('seeked', onSeeked)
        video.addEventListener('play', onPlay)
        video.addEventListener('pause', onPause)
        video.addEventListener('loadeddata', onLoadedData)

        return () => {
            video.removeEventListener('timeupdate', onTimeUpdate)
            video.removeEventListener('seeked', onSeeked)
            video.removeEventListener('play', onPlay)
            video.removeEventListener('pause', onPause)
            video.removeEventListener('loadeddata', onLoadedData)
            if (animFrameRef.current) {
                cancelAnimationFrame(animFrameRef.current)
            }
        }
    }, [results, syncCanvas])

    // Redraw on window resize
    useEffect(() => {
        const handleResize = () => {
            if (currentFrameData) drawBoundingBoxes(currentFrameData)
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [currentFrameData, drawBoundingBoxes])

    // === File Handling ===
    const handleFileSelect = (file) => {
        const validTypes = ['video/mp4', 'video/avi', 'video/x-msvideo', 'video/quicktime', 'video/x-matroska', 'video/webm']
        if (file && (validTypes.includes(file.type) || file.name.match(/\.(mp4|avi|mov|mkv|webm)$/i))) {
            setSelectedVideo(file)
            setPreviewUrl(URL.createObjectURL(file))
            setResults(null)
            setVideoSrc(null)
            setError(null)
            setCurrentFrameData(null)
        } else {
            alert('Please select a valid video file (MP4, AVI, MOV, MKV, WEBM).')
        }
    }

    const onFileDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) handleFileSelect(file)
    }

    const onFileInputChange = (e) => {
        const file = e.target.files?.[0]
        if (file) handleFileSelect(file)
    }

    const clearVideo = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        setSelectedVideo(null)
        setPreviewUrl(null)
        setResults(null)
        setVideoSrc(null)
        setError(null)
        setCurrentFrameData(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const processVideo = async () => {
        if (!selectedVideo) return

        setIsProcessing(true)
        setError(null)

        try {
            const formData = new FormData()
            formData.append('file', selectedVideo)

            const response = await fetch(`${API_BASE}/api/detect/video`, {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}))
                throw new Error(errData.detail || `Server error: ${response.status}`)
            }

            const data = await response.json()
            setResults(data)
            setVideoSrc(`${API_BASE}${data.video_url}`)
            setActiveFilters(new Set(ALL_CLASSES))
        } catch (err) {
            setError(err.message || 'Video processing failed. Make sure the backend server is running.')
        } finally {
            setIsProcessing(false)
        }
    }

    const formatDuration = (seconds) => {
        const mins = Math.floor(seconds / 60)
        const secs = Math.floor(seconds % 60)
        return `${mins}:${secs.toString().padStart(2, '0')}`
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Upload & Preview Area */}
            <div className="lg:col-span-2 space-y-4">
                {!previewUrl ? (
                    <div
                        className={`
                                relative flex flex-col items-center justify-center p-12 mt-2
                                border-2 border-dashed rounded-2xl transition-all duration-200 ease-in-out
                                ${isDragging
                                ? 'border-primary bg-primary/5 scale-[1.02]'
                                : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'}
                            `}
                        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
                        onDrop={onFileDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <div className="flex flex-col items-center justify-center space-y-4 text-center cursor-pointer">
                            <div className="p-4 rounded-full bg-primary/10 text-primary">
                                <FileVideo className="w-8 h-8" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-lg font-medium">Click to upload or drag and drop</p>
                                <p className="text-sm text-muted-foreground text-balance">
                                    MP4, AVI, MOV, MKV, atau WEBM
                                </p>
                            </div>
                        </div>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={onFileInputChange}
                        />
                    </div>
                ) : (
                    <div className="relative flex flex-col overflow-hidden border rounded-2xl bg-muted/30">
                        {/* Video Header */}
                        <div className="flex items-center justify-between p-4 border-b bg-background/50 backdrop-blur-sm z-10">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary/10 text-primary rounded-lg">
                                    <FileVideo className="w-4 h-4" />
                                </div>
                                <div>
                                    <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-xs">{selectedVideo.name}</p>
                                    <p className="text-xs text-muted-foreground">
                                        {(selectedVideo.size / 1024 / 1024).toFixed(2)} MB
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={clearVideo}
                                className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-xl transition-colors"
                                title="Remove video"
                                disabled={isProcessing}
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Video Display with Canvas Overlay */}
                        <div className="relative bg-black/5 dark:bg-black/20 flex items-center justify-center p-4">
                            <div className="relative inline-flex rounded-lg overflow-hidden">
                                {videoSrc ? (
                                    <>
                                        <video
                                            ref={videoRef}
                                            src={videoSrc}
                                            crossOrigin="anonymous"
                                            controls
                                            className="max-h-[500px] w-auto shadow-sm block"
                                        />
                                        <canvas
                                            ref={canvasRef}
                                            className="absolute top-0 left-0 w-full h-full pointer-events-none"
                                        />
                                    </>
                                ) : (
                                    <video
                                        src={previewUrl}
                                        controls
                                        className={`max-h-[500px] w-auto shadow-sm block transition-all duration-500
                                                ${isProcessing ? 'blur-[2px] scale-[0.98] opacity-50' : ''}
                                            `}
                                    />
                                )}
                            </div>

                            {/* Processing Overlay */}
                            {isProcessing && (
                                <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/40 backdrop-blur-[2px]">
                                    <div className="relative">
                                        <div className="absolute inset-0 border-4 border-primary rounded-full animate-ping opacity-20"></div>
                                        <div className="relative flex items-center justify-center w-16 h-16 bg-primary text-primary-foreground rounded-full shadow-xl">
                                            <Loader2 className="w-8 h-8 animate-spin" />
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <span className="text-primary font-medium bg-background/80 px-4 py-1.5 rounded-full shadow-sm text-sm border block">
                                            Memproses video dengan YOLOv11...
                                        </span>
                                        <p className="text-xs text-muted-foreground mt-3 animate-pulse">
                                            Smart detection — hanya memproses frame dengan pergerakan
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Capture Frame Button — muncul saat video sudah dianalisis + di-pause */}
                {results && videoPaused && currentFrameData && (
                    <div className="flex items-center gap-3 p-3 rounded-xl border bg-primary/5">
                        <Camera className="w-5 h-5 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">Capture Frame sebagai Bukti</p>
                            <p className="text-xs text-muted-foreground">
                                {currentFrameData.compliance
                                    ? `${currentFrameData.compliance.filter(c => !c.is_compliant).length} pelanggaran terdeteksi di frame ini`
                                    : 'Tidak ada data compliance'}
                            </p>
                        </div>
                        <button
                            onClick={captureCurrentFrame}
                            disabled={isCapturing}
                            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                        >
                            {isCapturing ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Camera className="w-4 h-4" />
                            )}
                            {isCapturing ? 'Capturing...' : 'Capture'}
                        </button>
                    </div>
                )}

                {/* Evidence Gallery */}
                {capturedFrames.length > 0 && (
                    <div className="space-y-3 p-4 rounded-xl border bg-muted/30">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold flex items-center gap-2">
                                <Camera className="w-4 h-4 text-primary" />
                                Bukti Pelanggaran ({capturedFrames.length})
                            </h3>
                            <button
                                onClick={() => submitViolations()}
                                disabled={isSubmitting}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {isSubmitting ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <Send className="w-3.5 h-3.5" />
                                )}
                                {isSubmitting ? 'Submitting...' : `Submit Semua (${capturedFrames.length})`}
                            </button>
                        </div>

                        {submitStatus && (
                            <div className={`text-xs p-2 rounded-lg ${submitStatus.failed > 0 ? 'bg-amber-500/10 text-amber-700' : 'bg-green-500/10 text-green-700'}`}>
                                {submitStatus.success} pelanggaran berhasil dicatat
                                {submitStatus.failed > 0 && `, ${submitStatus.failed} gagal`}
                            </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {capturedFrames.map((frame) => (
                                <div key={frame.id} className="relative group rounded-lg overflow-hidden border bg-black">
                                    <img
                                        src={frame.url}
                                        alt={`Frame ${frame.frame_index}`}
                                        className="w-full h-24 object-cover"
                                    />
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-2 py-1 flex justify-between">
                                        <span>{formatDuration(frame.timestamp)}</span>
                                        <span className="text-red-400 font-medium">{frame.violation_count} pelanggaran</span>
                                    </div>
                                    <button
                                        onClick={() => submitViolations(frame)}
                                        disabled={isSubmitting}
                                        className="absolute top-1 right-1 p-1 bg-green-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-50"
                                        title="Submit frame ini"
                                    >
                                        <Check className="w-3 h-3" />
                                    </button>
                                    <button
                                        onClick={() => removeCapturedFrame(frame.id)}
                                        className="absolute top-1 left-1 p-1 bg-red-600 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Hapus"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Action Button */}
                {previewUrl && !isProcessing && !results && (
                    <div className="flex justify-end">
                        <button
                            onClick={processVideo}
                            className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl shadow-lg hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
                        >
                            <Play className="w-5 h-5" />
                            Proses Video
                        </button>
                    </div>
                )}

                {/* Error Message */}
                {error && (
                    <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                            <p className="font-medium">Processing Error</p>
                            <p className="mt-1 opacity-80">{error}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Analysis Results Panel */}
            <div className="flex flex-col border rounded-2xl bg-card shadow-sm h-fit">
                <div className="p-5 border-b flex items-center gap-2">
                    <Info className="w-5 h-5 text-primary" />
                    <h2 className="font-semibold text-lg">Hasil Analisis Video</h2>
                </div>

                <div className="p-5 flex-1 min-h-[300px]">
                    {!previewUrl ? (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50">
                            <FileVideo className="w-12 h-12 text-muted-foreground" />
                            <p className="text-sm">Upload video untuk melihat hasil deteksi.</p>
                        </div>
                    ) : isProcessing ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-4">
                            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <p className="text-sm text-muted-foreground animate-pulse">Memproses video...</p>
                        </div>
                    ) : results ? (
                        <div className="space-y-5">
                            {/* Download Annotated Video */}
                            <div className="flex items-center gap-3 p-3 rounded-xl border bg-muted/30">
                                <Download className="w-4 h-4 text-primary shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium">Download Hasil Deteksi</p>
                                    <p className="text-xs text-muted-foreground truncate">
                                        {isRendering ? 'Merender video dengan annotasi...' : 'Video MP4 dengan bounding box + nama pelanggar'}
                                    </p>
                                    {downloadError && (
                                        <p className="text-xs text-red-500 mt-1">{downloadError}</p>
                                    )}
                                </div>
                                <button
                                    onClick={handleDownloadAnnotated}
                                    disabled={isRendering}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                                >
                                    {isRendering ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Download className="w-3.5 h-3.5" />
                                    )}
                                    {isRendering ? 'Memproses...' : 'Download'}
                                </button>
                            </div>

                            {/* Class Filter */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                        <Filter className="w-3.5 h-3.5" />
                                        Filter Kelas
                                    </h3>
                                    <button
                                        onClick={toggleAllFilters}
                                        className="text-[10px] text-primary hover:underline font-medium"
                                    >
                                        {activeFilters.size === ALL_CLASSES.length ? 'Reset' : 'Tampilkan Semua'}
                                    </button>
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {ALL_CLASSES.map(cls => {
                                        const isActive = activeFilters.has(cls)
                                        const count = allDetections.filter(d => d.label === cls).length
                                        return (
                                            <button
                                                key={cls}
                                                onClick={() => toggleFilter(cls)}
                                                className={`
                                                        flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium
                                                        border transition-all duration-200
                                                        ${isActive
                                                        ? 'bg-primary/10 border-primary/30 text-primary shadow-sm'
                                                        : 'bg-muted/30 border-transparent text-muted-foreground opacity-50 hover:opacity-75'}
                                                    `}
                                            >
                                                <span className={`w-2 h-2 rounded-full ${CLASS_BADGE_COLORS[cls]} ${isActive ? '' : 'opacity-40'}`} />
                                                {cls}
                                                <span className={`text-[10px] font-mono ${isActive ? 'text-primary/70' : 'text-muted-foreground/50'}`}>
                                                    {count}
                                                </span>
                                            </button>
                                        )
                                    })}
                                </div>
                            </div>

                            {/* Video Info */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-3 rounded-xl bg-muted/50 text-center">
                                    <div className="flex items-center justify-center gap-1.5 mb-1">
                                        <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                    <p className="text-xl font-bold">{formatDuration(results.summary.duration_seconds)}</p>
                                    <p className="text-xs text-muted-foreground">Durasi</p>
                                </div>
                                <div className="p-3 rounded-xl bg-muted/50 text-center">
                                    <div className="flex items-center justify-center gap-1.5 mb-1">
                                        <Zap className="w-3.5 h-3.5 text-muted-foreground" />
                                    </div>
                                    <p className="text-xl font-bold">{results.summary.frames_detected}</p>
                                    <p className="text-xs text-muted-foreground">Frame Dideteksi</p>
                                </div>
                            </div>

                            {/* Smart Detection Info */}
                            <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 text-xs">
                                <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-medium mb-1">
                                    <Zap className="w-3.5 h-3.5" />
                                    Smart Motion Detection
                                </div>
                                <p className="text-muted-foreground">
                                    {results.summary.frames_skipped} frame dilewati (tidak ada pergerakan).
                                    Hanya {results.summary.frames_detected} dari {results.summary.total_frames} frame yang diproses.
                                </p>
                            </div>

                            {/* Detection Summary */}
                            <div className="space-y-2">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                    Ringkasan Deteksi
                                </h3>
                                <div className="grid grid-cols-1 gap-2">
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                                        <span className="flex items-center gap-2 text-sm">
                                            <Users className="w-4 h-4 text-blue-500" />
                                            Total Person Terdeteksi
                                        </span>
                                        <span className="font-bold">{results.summary.total_person_detections}</span>
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-xl bg-green-500/5 border border-green-500/10">
                                        <span className="flex items-center gap-2 text-sm">
                                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                                            APD Lengkap
                                        </span>
                                        <span className="font-bold text-green-500">{results.summary.compliant_detections}</span>
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-xl bg-red-500/5 border border-red-500/10">
                                        <span className="flex items-center gap-2 text-sm">
                                            <ShieldAlert className="w-4 h-4 text-red-500" />
                                            APD Tidak Lengkap
                                        </span>
                                        <span className="font-bold text-red-500">{results.summary.non_compliant_detections}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Violation Types */}
                            {results.summary.violation_types.length > 0 && (
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                        Jenis Pelanggaran
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {results.summary.violation_types.map((type, idx) => (
                                            <span
                                                key={idx}
                                                className="px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-medium"
                                            >
                                                Missing {type}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Compliance Rate */}
                            {results.summary.total_person_detections > 0 && (
                                <div className="p-4 rounded-xl bg-muted/30 border">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-medium">Tingkat Kepatuhan</span>
                                        <span className="text-lg font-bold">
                                            {((results.summary.compliant_detections / results.summary.total_person_detections) * 100).toFixed(1)}%
                                        </span>
                                    </div>
                                    <div className="w-full bg-muted rounded-full h-2.5 overflow-hidden">
                                        <div
                                            className="h-full rounded-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-1000"
                                            style={{
                                                width: `${(results.summary.compliant_detections / results.summary.total_person_detections) * 100}%`
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Current Frame Detections */}
                            {currentFrameData && (
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                        Frame Saat Ini ({currentFrameData.detections.filter(d => activeFilters.has(d.label)).length} objek)
                                    </h3>
                                    <ul className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                                        {currentFrameData.detections
                                            .filter(d => activeFilters.has(d.label))
                                            .map((det, idx) => (
                                                <li
                                                    key={idx}
                                                    className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30 text-sm"
                                                >
                                                    <span className="flex items-center gap-2 font-medium">
                                                        <span className={`w-2 h-2 rounded-full ${CLASS_BADGE_COLORS[det.label] || 'bg-gray-400'}`} />
                                                        {ppeToId(det.label)}
                                                    </span>
                                                    <span className="text-muted-foreground font-mono text-xs">
                                                        {(det.confidence * 100).toFixed(1)}%
                                                    </span>
                                                </li>
                                            ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-60">
                            <Shield className="w-10 h-10 text-muted-foreground mb-2" />
                            <p className="text-sm">Siap untuk analisis.</p>
                            <p className="text-xs text-balance">Klik 'Proses Video' untuk memulai deteksi APD.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
