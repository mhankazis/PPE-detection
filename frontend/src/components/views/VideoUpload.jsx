import { useState, useRef, useMemo, useCallback, useEffect } from "react"
import { Upload, FileVideo, X, Play, Info, CheckCircle2, AlertTriangle, Shield, ShieldAlert, Loader2, Clock, Users, BarChart3, Filter, Zap } from "lucide-react"

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

            const text = `${det.label} ${(det.confidence * 100).toFixed(0)}%`
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
                    : `✗ KURANG: ${comp.missing_ppe.join(', ')}`
                const bgColor = comp.is_compliant ? '#16a34a' : '#dc2626'

                ctx.font = 'bold 11px Inter, system-ui, sans-serif'
                const tm = ctx.measureText(statusText)
                const barH = 20

                ctx.fillStyle = bgColor
                ctx.globalAlpha = 0.9
                ctx.fillRect(sx, sy2, tm.width + 14, barH)
                ctx.globalAlpha = 1.0
                ctx.fillStyle = '#ffffff'
                ctx.fillText(statusText, sx + 7, sy2 + barH - 5)
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
                                                        {det.label}
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
