import { useState, useRef, useMemo, useCallback, useEffect } from "react"
import { Upload, Image as ImageIcon, X, ZoomIn, Info, CheckCircle2, AlertTriangle, Shield, ShieldAlert, RotateCcw, Filter } from "lucide-react"

const API_BASE = "http://localhost:8000"

const ALL_CLASSES = ['Person', 'Helmet', 'Uniform', 'Hijab', 'Glasses']

// CSS classes for filter buttons
const CLASS_BADGE_COLORS = {
    Person: 'bg-blue-500',
    Helmet: 'bg-green-500',
    Uniform: 'bg-teal-500',
    Hijab: 'bg-fuchsia-500',
    Glasses: 'bg-yellow-500',
}

// Canvas drawing colors (hex)
const CLASS_DRAW_COLORS = {
    Person: '#3b82f6',
    Helmet: '#22c55e',
    Uniform: '#14b8a6',
    Hijab: '#d946ef',
    Glasses: '#eab308',
}

export default function ImageUploadContent() {
    const [selectedImage, setSelectedImage] = useState(null)
    const [previewUrl, setPreviewUrl] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [results, setResults] = useState(null)
    const [error, setError] = useState(null)
    const [activeFilters, setActiveFilters] = useState(new Set(ALL_CLASSES))
    const fileInputRef = useRef(null)
    const imageRef = useRef(null)
    const canvasRef = useRef(null)

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

    // Compute filtered detections for the results panel
    const filteredDetections = useMemo(() => {
        if (!results) return []
        return results.detections.filter(det => activeFilters.has(det.label))
    }, [results, activeFilters])

    // Compute filtered compliance (only show if Person filter is active)
    const filteredCompliance = useMemo(() => {
        if (!results || !activeFilters.has('Person')) return []
        return results.compliance
    }, [results, activeFilters])

    // === Canvas Bounding Box Drawing ===
    const drawBoundingBoxes = useCallback(() => {
        const canvas = canvasRef.current
        const image = imageRef.current
        if (!canvas || !image || !results) return

        // Match canvas drawing resolution to image rendered size
        const displayW = image.clientWidth
        const displayH = image.clientHeight
        canvas.width = displayW
        canvas.height = displayH

        const ctx = canvas.getContext('2d')
        ctx.clearRect(0, 0, displayW, displayH)

        if (!image.naturalWidth || !image.naturalHeight) return

        const scaleX = displayW / image.naturalWidth
        const scaleY = displayH / image.naturalHeight

        // Draw filtered detection boxes
        for (const det of results.detections) {
            if (!activeFilters.has(det.label)) continue

            const [x1, y1, x2, y2] = det.bbox
            const sx = x1 * scaleX
            const sy = y1 * scaleY
            const sw = (x2 - x1) * scaleX
            const sh = (y2 - y1) * scaleY
            const color = CLASS_DRAW_COLORS[det.label] || '#ffffff'

            // Box
            ctx.strokeStyle = color
            ctx.lineWidth = 2.5
            ctx.strokeRect(sx, sy, sw, sh)

            // Label background
            const text = `${det.label} ${(det.confidence * 100).toFixed(0)}%`
            ctx.font = 'bold 12px Inter, system-ui, sans-serif'
            const tm = ctx.measureText(text)
            const labelH = 20
            ctx.fillStyle = color
            ctx.fillRect(sx, sy - labelH, tm.width + 10, labelH)

            // Label text
            ctx.fillStyle = '#ffffff'
            ctx.fillText(text, sx + 5, sy - 5)
        }

        // Draw compliance status for each person (only when Person filter active)
        if (activeFilters.has('Person')) {
            for (const comp of results.compliance) {
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

                // Background bar
                ctx.fillStyle = bgColor
                ctx.globalAlpha = 0.9
                ctx.fillRect(sx, sy2, tm.width + 14, barH)
                ctx.globalAlpha = 1.0

                // Text
                ctx.fillStyle = '#ffffff'
                ctx.fillText(statusText, sx + 7, sy2 + barH - 5)
            }
        }
    }, [results, activeFilters])

    // Redraw bounding boxes when filters or results change
    useEffect(() => {
        drawBoundingBoxes()
    }, [drawBoundingBoxes])

    // Redraw on window resize (image display size may change)
    useEffect(() => {
        const handleResize = () => drawBoundingBoxes()
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [drawBoundingBoxes])

    const handleFileSelect = (file) => {
        if (file && file.type.startsWith('image/')) {
            setSelectedImage(file)
            setPreviewUrl(URL.createObjectURL(file))
            setResults(null)
            setError(null)
        } else {
            alert('Please select a valid image file.')
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

    const clearImage = () => {
        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setSelectedImage(null)
        setPreviewUrl(null)
        setResults(null)
        setError(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const analyzeImage = async () => {
        if (!selectedImage) return

        setIsAnalyzing(true)
        setError(null)

        try {
            const formData = new FormData()
            formData.append('file', selectedImage)

            const response = await fetch(`${API_BASE}/api/detect/image`, {
                method: 'POST',
                body: formData,
            })

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}))
                throw new Error(errData.detail || `Server error: ${response.status}`)
            }

            const data = await response.json()
            setResults(data)
            setActiveFilters(new Set(ALL_CLASSES))
        } catch (err) {
            setError(err.message || 'Detection failed. Make sure the backend server is running.')
        } finally {
            setIsAnalyzing(false)
        }
    }

    const getComplianceBadge = (comp) => {
        if (comp.is_compliant) {
            return (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/20 text-xs font-semibold">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    APD Lengkap
                </div>
            )
        }
        return (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20 text-xs font-semibold">
                <ShieldAlert className="w-3.5 h-3.5" />
                APD Tidak Lengkap
            </div>
        )
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
                                    <Upload className="w-8 h-8" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-lg font-medium">Click to upload or drag and drop</p>
                                    <p className="text-sm text-muted-foreground text-balance">
                                        PNG, JPG, JPEG, atau WEBP
                                    </p>
                                </div>
                            </div>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={onFileInputChange}
                            />
                        </div>
                    ) : (
                        <div className="relative flex flex-col overflow-hidden border rounded-2xl bg-muted/30">
                            {/* Image Header */}
                            <div className="flex items-center justify-between p-4 border-b bg-background/50 backdrop-blur-sm z-10">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 text-primary rounded-lg">
                                        <ImageIcon className="w-4 h-4" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-xs">{selectedImage.name}</p>
                                        <p className="text-xs text-muted-foreground">
                                            {(selectedImage.size / 1024 / 1024).toFixed(2)} MB
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={clearImage}
                                    className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-xl transition-colors"
                                    title="Remove image"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Image Display with Canvas Overlay */}
                            <div className="relative bg-black/5 dark:bg-black/20 flex items-center justify-center p-4">
                                <div className="relative inline-flex rounded-lg overflow-hidden">
                                    <img
                                        ref={imageRef}
                                        src={previewUrl}
                                        alt="Preview"
                                        onLoad={() => {
                                            // Redraw bounding boxes when image loads/reloads
                                            if (results) {
                                                // Small delay to ensure layout is complete
                                                requestAnimationFrame(() => drawBoundingBoxes())
                                            }
                                        }}
                                        className={`max-h-[500px] w-auto object-contain shadow-sm transition-all duration-500 block
                                            ${isAnalyzing ? 'blur-[2px] scale-[0.98]' : 'blur-0 scale-100'}
                                        `}
                                    />
                                    {/* Canvas overlay for bounding boxes */}
                                    {results && !isAnalyzing && (
                                        <canvas
                                            ref={canvasRef}
                                            className="absolute top-0 left-0 w-full h-full pointer-events-none"
                                        />
                                    )}
                                </div>

                                {/* Scanning Overlay */}
                                {isAnalyzing && (
                                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/20 backdrop-blur-[1px]">
                                        <div className="relative">
                                            <div className="absolute inset-0 border-4 border-primary rounded-full animate-ping opacity-20"></div>
                                            <div className="relative flex items-center justify-center w-16 h-16 bg-primary text-primary-foreground rounded-full shadow-xl">
                                                <ZoomIn className="w-8 h-8 animate-pulse" />
                                            </div>
                                        </div>
                                        <span className="text-primary font-medium bg-background/80 px-4 py-1.5 rounded-full shadow-sm text-sm border">
                                            Menganalisis gambar dengan YOLOv11...
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Action Buttons */}
                    {previewUrl && !isAnalyzing && (
                        <div className="flex justify-end gap-3">
                            {results && (
                                <button
                                    onClick={analyzeImage}
                                    className="flex items-center gap-2 px-5 py-2.5 border font-medium rounded-xl hover:bg-accent transition-all"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Deteksi Ulang
                                </button>
                            )}
                            {!results && (
                                <button
                                    onClick={analyzeImage}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl shadow-lg hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
                                >
                                    <ZoomIn className="w-5 h-5" />
                                    Run Detection
                                </button>
                            )}
                        </div>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3">
                            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div>
                                <p className="font-medium">Detection Error</p>
                                <p className="mt-1 opacity-80">{error}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Analysis Results Panel */}
                <div className="flex flex-col border rounded-2xl bg-card shadow-sm h-fit">
                    <div className="p-5 border-b flex items-center gap-2">
                        <Info className="w-5 h-5 text-primary" />
                        <h2 className="font-semibold text-lg">Hasil Analisis</h2>
                    </div>

                    <div className="p-5 flex-1 min-h-[300px]">
                        {!previewUrl ? (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50">
                                <ImageIcon className="w-12 h-12 text-muted-foreground" />
                                <p className="text-sm">Upload gambar untuk melihat hasil deteksi.</p>
                            </div>
                        ) : isAnalyzing ? (
                            <div className="flex flex-col items-center justify-center h-full space-y-4">
                                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-sm text-muted-foreground animate-pulse">Running YOLOv11 inference...</p>
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
                                            const count = results.detections.filter(d => d.label === cls).length
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

                                {/* Summary Stats */}
                                <div className="grid grid-cols-2 gap-3">
                                    <div className="p-3 rounded-xl bg-muted/50 text-center">
                                        <p className="text-2xl font-bold">{filteredDetections.length}</p>
                                        <p className="text-xs text-muted-foreground">Objek (filtered)</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-muted/50 text-center">
                                        <p className="text-2xl font-bold">{results.summary.total_persons}</p>
                                        <p className="text-xs text-muted-foreground">Person</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-green-500/10 text-center border border-green-500/20">
                                        <p className="text-2xl font-bold text-green-500">{results.summary.compliant}</p>
                                        <p className="text-xs text-green-600 dark:text-green-400">APD Lengkap</p>
                                    </div>
                                    <div className="p-3 rounded-xl bg-red-500/10 text-center border border-red-500/20">
                                        <p className="text-2xl font-bold text-red-500">{results.summary.non_compliant}</p>
                                        <p className="text-xs text-red-600 dark:text-red-400">APD Tidak Lengkap</p>
                                    </div>
                                </div>

                                {/* Per-Person Compliance */}
                                {filteredCompliance.length > 0 && (
                                    <div className="space-y-3">
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                            Detail Per Orang
                                        </h3>
                                        {filteredCompliance.map((comp, idx) => (
                                            <div
                                                key={idx}
                                                className={`p-4 rounded-xl border transition-all animate-in slide-in-from-right-4 ${
                                                    comp.is_compliant
                                                        ? 'bg-green-500/5 border-green-500/20'
                                                        : 'bg-red-500/5 border-red-500/20'
                                                }`}
                                                style={{ animationFillMode: "both", animationDelay: `${idx * 100}ms` }}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="text-sm font-medium">Person {comp.person_index}</span>
                                                    {getComplianceBadge(comp)}
                                                </div>

                                                {/* Found PPE Items */}
                                                <div className="space-y-1 mt-3">
                                                    {comp.items_detail
                                                        .filter(item => activeFilters.has(item.label))
                                                        .map((item, i) => (
                                                        <div key={i} className="flex items-center justify-between text-xs">
                                                            <span className="flex items-center gap-1.5">
                                                                <CheckCircle2 className="w-3 h-3 text-green-500" />
                                                                {item.label}
                                                            </span>
                                                            <span className="text-muted-foreground font-mono">
                                                                {(item.confidence * 100).toFixed(0)}%
                                                            </span>
                                                        </div>
                                                    ))}

                                                    {/* Missing PPE */}
                                                    {comp.missing_ppe
                                                        .filter(item => activeFilters.has(item))
                                                        .map((item, i) => (
                                                        <div key={`m-${i}`} className="flex items-center gap-1.5 text-xs text-red-500">
                                                            <X className="w-3 h-3" />
                                                            {item} — <span className="italic">tidak terdeteksi</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* All Detections (Filtered) */}
                                <div className="space-y-2">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                                        Deteksi ({filteredDetections.length}/{results.detections.length})
                                    </h3>
                                    <ul className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1">
                                        {filteredDetections.map((det, idx) => (
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
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-60">
                                <Shield className="w-10 h-10 text-muted-foreground mb-2" />
                                <p className="text-sm">Siap untuk analisis.</p>
                                <p className="text-xs text-balance">Klik 'Run Detection' untuk memulai deteksi APD.</p>
                            </div>
                        )}
                    </div>
                </div>
        </div>
    )
}
