import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Camera, CheckCircle2, TrendingUp, Users, ShieldAlert, ShieldCheck, BarChart3 } from "lucide-react"

const API_BASE = "http://localhost:8000"

export default function Dashboard() {
    const [data, setData] = useState(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchDashboard = async () => {
            try {
                const token = localStorage.getItem('token')
                const res = await fetch(`${API_BASE}/api/dashboard`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (res.ok) {
                    const json = await res.json()
                    setData(json)
                }
            } catch (err) {
                console.error("Failed to fetch dashboard", err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchDashboard()
        const interval = setInterval(fetchDashboard, 30000)
        return () => clearInterval(interval)
    }, [])

    if (isLoading) {
        return (
            <div className="p-8 space-y-8 animate-in fade-in duration-500">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Ringkasan</h1>
                        <p className="text-muted-foreground mt-1">Memuat data dashboard...</p>
                    </div>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {[1, 2, 3, 4].map(i => (
                        <Card key={i} className="animate-pulse">
                            <CardHeader className="pb-2">
                                <div className="h-4 bg-muted rounded w-2/3" />
                            </CardHeader>
                            <CardContent>
                                <div className="h-8 bg-muted rounded w-1/2 mb-2" />
                                <div className="h-3 bg-muted rounded w-3/4" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

    const d = data || {
        violations_today: 0, violations_total: 0, total_students: 0,
        unresolved: 0, resolved: 0, compliance_rate: 100,
        severity_counts: { Low: 0, Medium: 0, High: 0, Critical: 0 },
        recent_violations: [], daily_violations: []
    }

    const stats = [
        { title: "Pelanggaran Hari Ini", value: d.violations_today, icon: AlertCircle, subtitle: `${d.violations_total} total keseluruhan`, color: "text-red-500" },
        { title: "Kamera Aktif", value: "1", icon: Camera, subtitle: "CCTV terhubung", color: "text-blue-500" },
        { title: "Murid Terdaftar", value: d.total_students, icon: Users, subtitle: "Dengan data wajah", color: "text-indigo-500" },
        { title: "Tingkat Kepatuhan", value: `${d.compliance_rate}%`, icon: CheckCircle2, subtitle: `${d.resolved} selesai / ${d.unresolved} menunggu`, color: "text-green-500" },
    ]

    const maxDaily = Math.max(...d.daily_violations.map(v => v.count), 1) // used for bar scaling

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Ringkasan</h1>
                    <p className="text-muted-foreground mt-1">Dashboard pemantauan kepatuhan APD secara real-time.</p>
                </div>
                <Badge variant="outline" className="px-4 py-1.5 text-sm bg-primary/5 text-primary">
                    <TrendingUp className="w-4 h-4 mr-2" /> Pemantauan Aktif
                </Badge>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat, i) => (
                    <Card key={i} className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                            <CardTitle className="text-sm font-medium text-muted-foreground">
                                {stat.title}
                            </CardTitle>
                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{stat.value}</div>
                            <p className="text-xs text-muted-foreground mt-2">
                                {stat.subtitle}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 overflow-hidden border">
                    <CardHeader>
                        <CardTitle>Pelanggaran Terbaru</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {d.recent_violations.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <ShieldCheck className="w-12 h-12 mx-auto mb-3 text-green-500" />
                                <p className="text-sm">Belum ada pelanggaran tercatat.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {d.recent_violations.map((v) => (
                                    <div key={v.id} className="flex items-center p-4 border rounded-lg bg-card/50 hover:bg-accent/50 transition-colors">
                                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                                            <AlertCircle className="w-5 h-5" />
                                        </div>
                                        <div className="ml-4 space-y-1">
                                            <p className="text-sm font-medium leading-none">{v.type}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {v.camera} • {v.time}
                                            </p>
                                        </div>
                                        <div className="ml-auto flex items-center gap-4">
                                            <Badge variant={v.severity === 'Critical' || v.severity === 'High' ? 'destructive' : 'secondary'}
                                                className={v.severity === 'Medium' ? 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20' : ''}>
                                                {v.severity}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground hidden sm:inline-block">
                                                {v.id}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" /> Pelanggaran (7 Hari)
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-2 h-40">
                            {d.daily_violations.map((item, i) => {
                                const barHeight = item.count > 0 ? Math.max((item.count / maxDaily) * 120, 8) : 4
                                return (
                                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                        <span className="text-xs text-muted-foreground font-medium">{item.count}</span>
                                        <div
                                            className={`w-full rounded-t transition-all duration-500 ${item.count > 0 ? 'bg-primary/80' : 'bg-muted-foreground/20'}`}
                                            style={{ height: `${barHeight}px`, minHeight: '4px' }}
                                        />
                                        <span className="text-xs text-muted-foreground">{item.day}</span>
                                    </div>
                                )
                            })}
                        </div>

                        <div className="mt-6 space-y-3">
                            <p className="text-sm font-medium text-muted-foreground">Distribusi Tingkat Keparahan</p>
                            <div className="grid grid-cols-2 gap-2">
                                {Object.entries(d.severity_counts).map(([sev, count]) => (
                                    <div key={sev} className="flex items-center justify-between text-sm px-3 py-1.5 rounded border">
                                        <Badge variant={sev === 'Critical' || sev === 'High' ? 'destructive' : 'secondary'}
                                            className={sev === 'Medium' ? 'bg-yellow-500/10 text-yellow-600' : ''}>
                                            {sev}
                                        </Badge>
                                        <span className="font-medium">{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="mt-6 space-y-4">
                            <p className="text-sm font-medium text-muted-foreground">Status Sistem</p>
                            <div className="flex items-center">
                                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-green-100 text-green-600">
                                    <span className="relative flex w-3 h-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full w-3 h-3 bg-green-500"></span>
                                    </span>
                                </div>
                                <div className="ml-4 space-y-1">
                                    <p className="text-sm font-medium leading-none">YOLOv11 Engine</p>
                                    <p className="text-sm text-muted-foreground">Deteksi aktif</p>
                                </div>
                            </div>
                            <div className="flex items-center">
                                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-100 text-blue-600">
                                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                                </div>
                                <div className="ml-4 space-y-1">
                                    <p className="text-sm font-medium leading-none">Koneksi Database</p>
                                    <p className="text-sm text-muted-foreground">Terhubung</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
