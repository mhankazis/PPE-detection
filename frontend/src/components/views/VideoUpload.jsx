import { useState, useRef } from "react"
import { Upload, FileVideo, X, Play, Info, CheckCircle2, AlertTriangle, Shield, ShieldAlert, Loader2, Clock, Users, BarChart3 } from "lucide-react"

const API_BASE = "http://localhost:8000"

export default function VideoUpload() {
    const [selectedVideo, setSelectedVideo] = useState(null)
    const [previewUrl, setPreviewUrl] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [isProcessing, setIsProcessing] = useState(false)
    const [results, setResults] = useState(null)
    const [annotatedVideoUrl, setAnnotatedVideoUrl] = useState(null)
    const [error, setError] = useState(null)
    const fileInputRef = useRef(null)

    const handleFileSelect = (file) => {
        const validTypes = ['video/mp4', 'video/avi', 'video/x-msvideo', 'video/quicktime', 'video/x-matroska', 'video/webm']
        if (file && (validTypes.includes(file.type) || file.name.match(/\.(mp4|avi|mov|mkv|webm)$/i))) {
            setSelectedVideo(file)
            setPreviewUrl(URL.createObjectURL(file))
            setResults(null)
            setAnnotatedVideoUrl(null)
            setError(null)
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
        setSelectedVideo(null)
        setPreviewUrl(null)
        setResults(null)
        setAnnotatedVideoUrl(null)
        setError(null)
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
            setAnnotatedVideoUrl(`${API_BASE}${data.annotated_video_url}`)
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
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Video Object Detection</h1>
                <p className="text-muted-foreground">Upload video untuk mendeteksi kelengkapan APD frame-by-frame menggunakan YOLOv11.</p>
            </div>

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

                            {/* Video Display */}
                            <div className="relative bg-black/5 dark:bg-black/20 flex items-center justify-center p-4">
                                {annotatedVideoUrl ? (
                                    <video
                                        src={annotatedVideoUrl}
                                        controls
                                        className="max-h-[500px] w-auto rounded-lg shadow-sm"
                                    />
                                ) : (
                                    <video
                                        src={previewUrl}
                                        controls
                                        className={`max-h-[500px] w-auto rounded-lg shadow-sm transition-all duration-500
                                            ${isProcessing ? 'blur-[2px] scale-[0.98] opacity-50' : 'blur-0 scale-100'}
                                        `}
                                    />
                                )}

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
                                                Proses ini mungkin memakan waktu beberapa menit
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
                                            <BarChart3 className="w-3.5 h-3.5 text-muted-foreground" />
                                        </div>
                                        <p className="text-xl font-bold">{results.summary.frames_analyzed}</p>
                                        <p className="text-xs text-muted-foreground">Frame Dianalisis</p>
                                    </div>
                                </div>

                                {/* Detection Summary */}
                                <div className="space-y-3">
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
        </div>
    )
}
