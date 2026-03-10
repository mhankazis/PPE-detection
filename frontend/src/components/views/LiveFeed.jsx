import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Camera, Maximize, AlertTriangle, ShieldCheck } from "lucide-react"

export default function LiveFeed() {
    const [events, setEvents] = useState([
        { id: 1, text: "Worker detected with full PPE", type: "safe", time: "10:42:01" },
        { id: 2, text: "Group of 3 detected, compliant", type: "safe", time: "10:41:45" },
        { id: 3, text: "Missing Helmet - Alert Generated", type: "violation", time: "10:40:12" },
    ])

    // Simulate incoming real-time events
    useEffect(() => {
        const interval = setInterval(() => {
            const isViolation = Math.random() > 0.8
            const newEvent = {
                id: Date.now(),
                text: isViolation ? "Missing Vest - Processing..." : "Worker detected, compliant",
                type: isViolation ? "violation" : "safe",
                time: new Date().toLocaleTimeString(),
            }
            setEvents((prev) => [newEvent, ...prev].slice(0, 20)) // Keep last 20
        }, 4500)
        return () => clearInterval(interval)
    }, [])

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
                        {/* Live Stream from backend */}
                        <img
                            src="http://localhost:8000/api/video_feed"
                            alt="Live CCTV Feed"
                            className="absolute inset-0 w-full h-full object-contain z-10"
                        />

                        {/* Simulated Bounding Box */}
                        <div className="absolute top-[30%] left-[40%] w-[120px] h-[240px] border-2 border-red-500/80 bg-red-500/10 rounded pointer-events-none">
                            <div className="absolute -top-6 left-[-2px] bg-red-500/80 text-white text-xs px-2 py-0.5 whitespace-nowrap rounded-t">
                                No Helmet 96%
                            </div>
                        </div>

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
                            {events.map((event) => (
                                <div key={event.id} className="flex justify-between items-start text-sm border-b pb-3 last:border-0 last:pb-0">
                                    <div className="flex gap-3">
                                        {event.type === 'violation' ? (
                                            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                        ) : (
                                            <ShieldCheck className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                                        )}
                                        <span className={event.type === 'violation' ? 'font-medium text-red-500 dark:text-red-400' : 'text-muted-foreground'}>
                                            {event.text}
                                        </span>
                                    </div>
                                    <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                                        {event.time}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </Card>
            </div>
        </div>
    )
}
