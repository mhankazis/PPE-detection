import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Camera, Maximize, AlertTriangle, ShieldCheck, Loader2, ShieldAlert, Eye, EyeOff, Scan } from "lucide-react"

const API_BASE = "http://localhost:8000"

export default function LiveFeed() {
    const [isStreamLoading, setIsStreamLoading] = useState(true)
    const [detectionMode, setDetectionMode] = useState(false)
    const imgRef = useRef(null)

    // Cleanup the stream when navigating away to prevent hanging requests
    useEffect(() => {
        return () => {
            if (imgRef.current) {
                // Setting src to empty string forces the browser to abort the active stream request
                imgRef.current.src = "";
            }
        }
    }, [])

    // When toggling detection mode, reset loading state and update stream URL
    useEffect(() => {
        setIsStreamLoading(true)
        if (imgRef.current) {
            // Force stream restart by resetting src
            const newSrc = detectionMode
                ? `${API_BASE}/api/detect/live`
                : `${API_BASE}/api/video_feed`
            imgRef.current.src = ""
            // Small delay to ensure old stream is aborted
            setTimeout(() => {
                if (imgRef.current) {
                    imgRef.current.src = newSrc
                }
            }, 100)
        }
    }, [detectionMode])

    const streamUrl = detectionMode
        ? `${API_BASE}/api/detect/live`
        : `${API_BASE}/api/video_feed`

    return (
        <div className="p-8 h-full flex flex-col animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Live CCTV Feed</h1>
                    <p className="text-muted-foreground mt-1">
                        {detectionMode
                            ? "YOLOv11 real-time PPE detection active."
                            : "Raw camera stream. Aktifkan Detection Mode untuk deteksi APD."}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Detection Mode Toggle */}
                    <button
                        onClick={() => setDetectionMode(!detectionMode)}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm
                            border transition-all duration-300
                            ${detectionMode
                                ? 'bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25 hover:bg-primary/90'
                                : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-accent-foreground'}
                        `}
                    >
                        {detectionMode ? (
                            <>
                                <Scan className="w-4 h-4 animate-pulse" />
                                Detection ON
                            </>
                        ) : (
                            <>
                                <Eye className="w-4 h-4" />
                                Detection OFF
                            </>
                        )}
                    </button>

                    <Badge variant="outline" className={`${detectionMode ? 'text-green-500 border-green-500/50' : 'text-blue-500 border-blue-500/50'}`}>
                        <span className={`w-2 h-2 rounded-full mr-2 animate-pulse ${detectionMode ? 'bg-green-500' : 'bg-blue-500'}`} />
                        {detectionMode ? 'YOLOv11 Active' : 'Raw Stream'}
                    </Badge>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
                {/* Video Player */}
                <Card className="lg:col-span-3 flex flex-col overflow-hidden border-2 border-muted bg-black/5 dark:bg-black/40">
                    <div className="flex-1 relative flex items-center justify-center min-h-[400px] bg-black overflow-hidden">
                        {/* Loading Overlay */}
                        {isStreamLoading && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 text-muted-foreground">
                                <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
                                <p className="text-sm font-medium animate-pulse">
                                    {detectionMode ? 'Loading Detection Stream...' : 'Connecting to Camera...'}
                                </p>
                            </div>
                        )}

                        {/* Live Stream from backend */}
                        <img
                            ref={imgRef}
                            src={streamUrl}
                            alt="Live CCTV Feed"
                            onLoad={() => setIsStreamLoading(false)}
                            onError={() => setIsStreamLoading(false)}
                            className={`absolute inset-0 w-full h-full object-contain z-10 transition-opacity duration-500 ${isStreamLoading ? 'opacity-0' : 'opacity-100'}`}
                        />

                        {/* Detection Mode Badge Overlay */}
                        {detectionMode && !isStreamLoading && (
                            <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600/80 backdrop-blur-sm text-white text-xs font-semibold shadow-lg">
                                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                                YOLO DETECTION ACTIVE
                            </div>
                        )}

                        {/* Controls */}
                        <div className="absolute bottom-4 right-4 flex gap-2">
                            <button className="p-2 rounded-md bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition">
                                <Maximize className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </Card>

                {/* Real-time Info Panel */}
                <Card className="flex flex-col h-[500px] lg:h-auto">
                    <CardHeader className="py-4 border-b">
                        <CardTitle className="text-lg flex justify-between items-center">
                            {detectionMode ? 'Detection Info' : 'Event Log'}
                            <span className="relative flex w-2 h-2">
                                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${detectionMode ? 'bg-green-400' : 'bg-blue-400'}`}></span>
                                <span className={`relative inline-flex rounded-full w-2 h-2 ${detectionMode ? 'bg-green-500' : 'bg-blue-500'}`}></span>
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-4">
                            {detectionMode ? (
                                <div className="space-y-4">
                                    {/* Detection Mode Info */}
                                    <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
                                        <div className="flex items-center gap-2 text-green-500 mb-2">
                                            <ShieldCheck className="w-5 h-5" />
                                            <span className="font-semibold text-sm">Detection Mode Aktif</span>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            Model YOLOv11 sedang mendeteksi kelengkapan APD secara real-time pada feed CCTV.
                                        </p>
                                    </div>

                                    {/* PPE Classes Legend */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kelas Deteksi</h4>
                                        <div className="space-y-1.5">
                                            {[
                                                { label: 'Person', color: 'bg-blue-500', required: false },
                                                { label: 'Helmet', color: 'bg-green-500', required: true },
                                                { label: 'Uniform', color: 'bg-teal-500', required: true },
                                                { label: 'Hijab', color: 'bg-fuchsia-500', required: false },
                                                { label: 'Glasses', color: 'bg-yellow-500', required: false },
                                            ].map(item => (
                                                <div key={item.label} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/30">
                                                    <span className="flex items-center gap-2">
                                                        <span className={`w-3 h-3 rounded-sm ${item.color}`} />
                                                        {item.label}
                                                    </span>
                                                    {item.required && (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-500/50 text-amber-500">
                                                            Wajib
                                                        </Badge>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Compliance Legend */}
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status APD</h4>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-green-500/5 border border-green-500/10">
                                                <ShieldCheck className="w-4 h-4 text-green-500" />
                                                <span className="text-green-600 dark:text-green-400 font-medium">APD LENGKAP</span>
                                                <span className="text-muted-foreground ml-auto">Helmet + Uniform ✓</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs p-2 rounded-lg bg-red-500/5 border border-red-500/10">
                                                <ShieldAlert className="w-4 h-4 text-red-500" />
                                                <span className="text-red-600 dark:text-red-400 font-medium">KURANG</span>
                                                <span className="text-muted-foreground ml-auto">Missing items</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                                    <Eye className="w-8 h-8 mb-3 opacity-50" />
                                    <p className="text-sm font-medium">Raw Stream Mode</p>
                                    <p className="text-xs text-center mt-2 opacity-70">
                                        Aktifkan "Detection" untuk menampilkan overlay deteksi APD YOLOv11.
                                    </p>
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                </Card>
            </div>
        </div>
    )
}
