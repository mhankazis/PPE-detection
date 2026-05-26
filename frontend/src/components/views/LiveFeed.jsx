import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Camera, Maximize, AlertTriangle, ShieldCheck, Loader2 } from "lucide-react"

export default function LiveFeed() {
    const [isStreamLoading, setIsStreamLoading] = useState(true)
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

    // Simulating incoming real-time events is temporarily disabled

    return (
        <div className="p-8 h-full flex flex-col animate-in fade-in duration-500">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Live CCTV Feed</h1>
                    <p className="text-muted-foreground mt-1">YOLOv11 real-time detection stream.</p>
                </div>
                <div className="flex space-x-2">
                    <Badge variant="outline" className="text-green-500 border-green-500/50">
                        <span className="w-2 h-2 rounded-full bg-green-500 mr-2 animate-pulse" />
                        Model: YOLOv11x (45 FPS)
                    </Badge>
                    <Badge className="bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer">
                        <Camera className="w-4 h-4 mr-2" /> Cam 04 - Entrance
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
                                <p className="text-sm font-medium animate-pulse">Connecting to Camera...</p>
                            </div>
                        )}

                        {/* Live Stream from backend */}
                        <img
                            ref={imgRef}
                            src="http://localhost:8000/api/video_feed"
                            alt="Live CCTV Feed"
                            onLoad={() => setIsStreamLoading(false)}
                            onError={() => setIsStreamLoading(false)}
                            className={`absolute inset-0 w-full h-full object-contain z-10 transition-opacity duration-500 ${isStreamLoading ? 'opacity-0' : 'opacity-100'}`}
                        />

                        {/* Controls */}
                        <div className="absolute bottom-4 right-4 flex gap-2">
                            <button className="p-2 rounded-md bg-black/50 text-white hover:bg-black/70 backdrop-blur-sm transition">
                                <Maximize className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </Card>

                {/* Real-time Log */}
                <Card className="flex flex-col h-[500px] lg:h-auto">
                    <CardHeader className="py-4 border-b">
                        <CardTitle className="text-lg flex justify-between items-center">
                            Event Log
                            <span className="relative flex w-2 h-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full w-2 h-2 bg-blue-500"></span>
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <ScrollArea className="flex-1">
                        <div className="p-4 space-y-4">
                            <div className="flex flex-col items-center justify-center h-full py-12 text-muted-foreground">
                                <AlertTriangle className="w-8 h-8 mb-3 opacity-50" />
                                <p className="text-sm">Event logging is temporarily disabled.</p>
                            </div>
                        </div>
                    </ScrollArea>
                </Card>
            </div>
        </div>
    )
}
