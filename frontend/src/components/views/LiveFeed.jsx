import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Camera, Maximize, AlertTriangle, ShieldCheck, Loader2, ShieldAlert, Eye, EyeOff, Scan, Plug, Unplug, Bell, BellOff } from "lucide-react"
import { useAlarmSound } from "../../hooks/useAlarmSound"

const API_BASE = "http://localhost:8000"

export default function LiveFeed() {
    const [isStreamLoading, setIsStreamLoading] = useState(false)
    const [detectionMode, setDetectionMode] = useState(false)
    const [isConnected, setIsConnected] = useState(false)
    const imgRef = useRef(null)
    const loadingTimerRef = useRef(null)
    const { isPlaying, acknowledge } = useAlarmSound(API_BASE, detectionMode)

    // Cleanup the stream when navigating away to prevent hanging requests
    useEffect(() => {
        return () => {
            if (imgRef.current) {
                imgRef.current.src = "";
            }
            if (loadingTimerRef.current) {
                clearTimeout(loadingTimerRef.current);
            }
            // Stop backend camera on unmount
            fetch(`${API_BASE}/api/camera/stop`, { method: "POST" }).catch(() => { })
        }
    }, [])

    // When toggling detection mode while connected, show loading briefly.
    // MJPEG onLoad fires only on first frame; safety timeout guarantees dismissal.
    useEffect(() => {
        if (!isConnected) return

        setIsStreamLoading(true)

        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
        loadingTimerRef.current = setTimeout(() => {
            setIsStreamLoading(false)
        }, 2500)

        return () => {
            if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
        }
    }, [detectionMode, isConnected])

    const handleConnect = () => {
        setIsConnected(true)
        setIsStreamLoading(true)
        // Stream src will be set by the useEffect above
        if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current)
        loadingTimerRef.current = setTimeout(() => {
            setIsStreamLoading(false)
        }, 8000)
    }

    const handleDisconnect = () => {
        setIsConnected(false)
        setIsStreamLoading(false)
        setDetectionMode(false)
        if (imgRef.current) {
            imgRef.current.src = ""
        }
        if (loadingTimerRef.current) {
            clearTimeout(loadingTimerRef.current)
            loadingTimerRef.current = null
        }
        // Stop backend camera stream + release RTSP resources
        fetch(`${API_BASE}/api/camera/stop`, { method: "POST" }).catch(() => { })
    }

    const streamUrl = detectionMode
        ? `${API_BASE}/api/detect/live`
        : `${API_BASE}/api/video_feed`

    return (
        <div className="p-8 h-full flex flex-col animate-in fade-in duration-500 relative">
            {/* Alarm Popup Overlay — fixed top, doesn't shift layout */}
            {isPlaying && (
                <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 p-4 rounded-xl bg-red-600 shadow-2xl shadow-red-600/40 flex items-center gap-4 animate-in slide-in-from-top duration-300">
                    <Bell className="w-6 h-6 text-white animate-bounce flex-shrink-0" />
                    <div className="flex-shrink-0">
                        <p className="font-bold text-white text-lg leading-tight">PELANGGARAN APD TERDETEKSI!</p>
                        <p className="text-sm text-white/80">Alarm berbunyi — periksa area kerja</p>
                    </div>
                    <button
                        onClick={acknowledge}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-red-600 font-medium hover:bg-red-50 transition-colors flex-shrink-0"
                    >
                        <BellOff className="w-4 h-4" />
                        Hentikan
                    </button>
                </div>
            )}
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Live CCTV Feed</h1>
                    <p className="text-muted-foreground mt-1">
                        {!isConnected
                            ? "Klik Connect Camera untuk memulai live feed CCTV."
                            : detectionMode
                                ? "YOLOv11 real-time PPE detection active."
                                : "Raw camera stream. Aktifkan Detection Mode untuk deteksi APD."}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Connect / Disconnect Button */}
                    <button
                        onClick={isConnected ? handleDisconnect : handleConnect}
                        className={`
                            flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm
                            border transition-all duration-300
                            ${isConnected
                                ? 'bg-red-600 text-white border-red-600 shadow-lg shadow-red-600/25 hover:bg-red-700'
                                : 'bg-green-600 text-white border-green-600 shadow-lg shadow-green-600/25 hover:bg-green-700'}
                        `}
                    >
                        {isConnected ? (
                            <>
                                <Unplug className="w-4 h-4" />
                                Disconnect
                            </>
                        ) : (
                            <>
                                <Plug className="w-4 h-4" />
                                Connect Camera
                            </>
                        )}
                    </button>

                    {/* Detection Mode Toggle — only when connected */}
                    {isConnected && (
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
                    )}

                    <Badge variant="outline" className={`${!isConnected ? 'text-gray-500 border-gray-500/50' : detectionMode ? 'text-green-500 border-green-500/50' : 'text-blue-500 border-blue-500/50'}`}>
                        <span className={`w-2 h-2 rounded-full mr-2 ${isConnected ? 'animate-pulse' : ''} ${!isConnected ? 'bg-gray-500' : detectionMode ? 'bg-green-500' : 'bg-blue-500'}`} />
                        {!isConnected ? 'Offline' : detectionMode ? 'YOLOv11 Active' : 'Raw Stream'}
                    </Badge>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 flex-1 min-h-0">
                {/* Video Player */}
                <Card className="lg:col-span-3 flex flex-col overflow-hidden border-2 border-muted bg-black/5 dark:bg-black/40">
                    <div className="flex-1 relative flex items-center justify-center min-h-[400px] bg-black overflow-hidden">
                        {/* Disconnected Placeholder */}
                        {!isConnected && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black text-muted-foreground">
                                <Camera className="w-16 h-16 mb-4 text-muted-foreground/40" />
                                <p className="text-lg font-medium text-muted-foreground/60">Camera Offline</p>
                                <p className="text-sm text-muted-foreground/40 mt-1">Klik "Connect Camera" untuk memulai live feed</p>
                            </div>
                        )}

                        {/* Loading Overlay */}
                        {isConnected && isStreamLoading && (
                            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 text-muted-foreground">
                                <Loader2 className="w-10 h-10 animate-spin mb-4 text-primary" />
                                <p className="text-sm font-medium animate-pulse">
                                    {detectionMode ? 'Loading Detection Stream...' : 'Connecting to Camera...'}
                                </p>
                            </div>
                        )}

                        {/* Live Stream from backend — key forces remount on mode switch so MJPEG connection resets */}
                        <img
                            key={`stream-${detectionMode}-${isConnected}`}
                            ref={imgRef}
                            src={isConnected ? streamUrl : ""}
                            alt="Live CCTV Feed"
                            onLoad={() => {
                                setIsStreamLoading(false)
                                if (loadingTimerRef.current) {
                                    clearTimeout(loadingTimerRef.current)
                                    loadingTimerRef.current = null
                                }
                            }}
                            onError={(e) => {
                                console.error("Stream load error:", e)
                                setIsStreamLoading(false)
                                if (loadingTimerRef.current) {
                                    clearTimeout(loadingTimerRef.current)
                                    loadingTimerRef.current = null
                                }
                            }}
                            className={`absolute inset-0 w-full h-full object-contain z-10 transition-opacity duration-500 ${!isConnected || isStreamLoading ? 'opacity-0' : 'opacity-100'}`}
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
