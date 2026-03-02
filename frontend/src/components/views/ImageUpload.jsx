import { useState, useRef } from "react"
import { Upload, Image as ImageIcon, X, ZoomIn, Info } from "lucide-react"

export default function ImageUpload() {
    const [selectedImage, setSelectedImage] = useState(null)
    const [previewUrl, setPreviewUrl] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [isAnalyzing, setIsAnalyzing] = useState(false)
    const [results, setResults] = useState(null)
    const fileInputRef = useRef(null)

    const handleFileSelect = (file) => {
        if (file && file.type.startsWith('image/')) {
            setSelectedImage(file)
            setPreviewUrl(URL.createObjectURL(file))
            setResults(null) // Clear previous results
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
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const analyzeImage = () => {
        if (!selectedImage) return

        setIsAnalyzing(true)

        // Simulating an API call to a detection backend
        setTimeout(() => {
            setIsAnalyzing(false)
            setResults([
                { id: 1, label: 'Hardhat', confidence: 0.98, color: 'bg-green-500/20 text-green-500 border-green-500/50' },
                { id: 2, label: 'Safety Vest', confidence: 0.95, color: 'bg-green-500/20 text-green-500 border-green-500/50' },
                { id: 3, label: 'Goggles', confidence: 0.12, color: 'bg-destructive/10 text-destructive border-destructive/20', warning: true },
            ])
        }, 2000)
    }

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col gap-2">
                <h1 className="text-3xl font-bold tracking-tight">Image Object Detection</h1>
                <p className="text-muted-foreground">Upload a static image to detect Personal Protective Equipment (PPE).</p>
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
                                    <Upload className="w-8 h-8" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-lg font-medium">Click to upload or drag and drop</p>
                                    <p className="text-sm text-muted-foreground text-balance">
                                        SVG, PNG, JPG or GIF (max. 800x400px)
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

                            {/* Image Display */}
                            <div className="relative aspect-video bg-black/5 flex items-center justify-center p-4">
                                <img
                                    src={previewUrl}
                                    alt="Preview"
                                    className={`max-h-[500px] w-auto rounded-lg object-contain shadow-sm transition-all duration-500
                                        ${isAnalyzing ? 'blur-[2px] scale-[0.98]' : 'blur-0 scale-100'}
                                    `}
                                />

                                {/* Scanning Overlay Simulation */}
                                {isAnalyzing && (
                                    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/20 backdrop-blur-[1px]">
                                        <div className="relative">
                                            <div className="absolute inset-0 border-4 border-primary rounded-full animate-ping opacity-20"></div>
                                            <div className="relative flex items-center justify-center w-16 h-16 bg-primary text-primary-foreground rounded-full shadow-xl">
                                                <ZoomIn className="w-8 h-8 animate-pulse" />
                                            </div>
                                        </div>
                                        <span className="text-primary font-medium bg-background/80 px-4 py-1.5 rounded-full shadow-sm text-sm border">
                                            Analyzing image...
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {previewUrl && !isAnalyzing && !results && (
                        <div className="flex justify-end">
                            <button
                                onClick={analyzeImage}
                                className="flex items-center gap-2 px-6 py-2.5 bg-primary text-primary-foreground font-semibold rounded-xl shadow-lg hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                <ZoomIn className="w-5 h-5" />
                                Run Detection
                            </button>
                        </div>
                    )}
                </div>

                {/* Analysis Results */}
                <div className="flex flex-col border rounded-2xl bg-card shadow-sm h-fit">
                    <div className="p-5 border-b flex items-center gap-2">
                        <Info className="w-5 h-5 text-primary" />
                        <h2 className="font-semibold text-lg">Analysis Results</h2>
                    </div>

                    <div className="p-5 flex-1 min-h-[300px]">
                        {!previewUrl ? (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-50">
                                <ImageIcon className="w-12 h-12 text-muted-foreground" />
                                <p className="text-sm">Upload an image to see detection results here.</p>
                            </div>
                        ) : isAnalyzing ? (
                            <div className="flex flex-col items-center justify-center h-full space-y-4">
                                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                                <p className="text-sm text-muted-foreground animate-pulse">Running inference model...</p>
                            </div>
                        ) : results ? (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground">Objects Detected:</span>
                                    <span className="font-bold">{results.length}</span>
                                </div>

                                <ul className="space-y-3 mt-4">
                                    {results.map((item) => (
                                        <li
                                            key={item.id}
                                            className={`flex items-center justify-between p-3 rounded-xl border ${item.color} transition-all animate-in slide-in-from-right-4`}
                                            style={{ animationFillMode: "both", animationDelay: `${item.id * 100}ms` }}
                                        >
                                            <span className="font-medium">{item.label}</span>
                                            <span className="text-sm font-semibold tracking-wider">
                                                {(item.confidence * 100).toFixed(0)}%
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                {results.some(r => r.warning) && (
                                    <div className="mt-6 p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-3">
                                        <X className="w-5 h-5 shrink-0 mt-0.5" />
                                        <p>Warning: Missing critical PPE equipment detected in the image.</p>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full text-center space-y-2 opacity-60">
                                <p className="text-sm">Ready for analysis.</p>
                                <p className="text-xs text-balance">Click 'Run Detection' to scan the image.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
