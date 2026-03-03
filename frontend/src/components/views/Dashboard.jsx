import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertCircle, Camera, CheckCircle2, TrendingUp, Users } from "lucide-react"

export default function Dashboard() {
    const stats = [
        { title: "Total Violations Today", value: "24", icon: AlertCircle, change: "+12%", color: "text-red-500" },
        { title: "Active Cameras", value: "8/10", icon: Camera, change: "All systems operational", color: "text-blue-500" },
        { title: "Students Detected", value: "142", icon: Users, change: "Current shift", color: "text-indigo-500" },
        { title: "Compliance Rate", value: "94%", icon: CheckCircle2, change: "+2.4% from yesterday", color: "text-green-500" },
    ]

    const recentViolations = [
        { id: "V-1042", time: "10:24 AM", camera: "Cam 04 - Entrance", type: "No Helmet", severity: "High" },
        { id: "V-1041", time: "10:15 AM", camera: "Cam 02 - Processing", type: "No Vest", severity: "Medium" },
        { id: "V-1040", time: "09:50 AM", camera: "Cam 04 - Entrance", type: "No Helmet, No Goggles", severity: "Critical" },
        { id: "V-1039", time: "09:12 AM", camera: "Cam 01 - Loading Dock", type: "No Gloves", severity: "Low" },
    ]

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
                    <p className="text-muted-foreground mt-1">Real-time PPE compliance monitoring dashboard.</p>
                </div>
                <Badge variant="outline" className="px-4 py-1.5 text-sm bg-primary/5 text-primary">
                    <TrendingUp className="w-4 h-4 mr-2" /> Live Monitoring Active
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
                                {stat.change}
                            </p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <Card className="col-span-4 overflow-hidden border">
                    <CardHeader>
                        <CardTitle>Recent Violations</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            {recentViolations.map((violation) => (
                                <div key={violation.id} className="flex items-center p-4 border rounded-lg bg-card/50 hover:bg-accent/50 transition-colors">
                                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400">
                                        <AlertCircle className="w-5 h-5" />
                                    </div>
                                    <div className="ml-4 space-y-1">
                                        <p className="text-sm font-medium leading-none">{violation.type}</p>
                                        <p className="text-sm text-muted-foreground">
                                            {violation.camera} • {violation.time}
                                        </p>
                                    </div>
                                    <div className="ml-auto flex items-center gap-4">
                                        <Badge variant={violation.severity === 'Critical' ? 'destructive' : 'secondary'}>
                                            {violation.severity}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground hidden sm:inline-block">
                                            {violation.id}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>

                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>System Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-8">
                            <div className="flex items-center">
                                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-green-100 text-green-600">
                                    <span className="relative flex w-3 h-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full w-3 h-3 bg-green-500"></span>
                                    </span>
                                </div>
                                <div className="ml-4 space-y-1">
                                    <p className="text-sm font-medium leading-none">YOLOv11 Engine</p>
                                    <p className="text-sm text-muted-foreground">Inference running at 45 FPS</p>
                                </div>
                            </div>

                            <div className="flex items-center">
                                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-blue-100 text-blue-600">
                                    <div className="w-2 h-2 rounded-full bg-blue-600" />
                                </div>
                                <div className="ml-4 space-y-1">
                                    <p className="text-sm font-medium leading-none">Database Connection</p>
                                    <p className="text-sm text-muted-foreground">Connected • Latency 12ms</p>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
