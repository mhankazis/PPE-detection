import { useState } from "react"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Filter, Download, Eye, Calendar } from "lucide-react"

const mockLogs = [
    { id: "V-1042", date: "2023-10-24", time: "10:24 AM", camera: "Cam 04", type: "No Helmet", workerId: "W-294", severity: "High" },
    { id: "V-1041", date: "2023-10-24", time: "10:15 AM", camera: "Cam 02", type: "No Vest", workerId: "W-112", severity: "Medium" },
    { id: "V-1040", date: "2023-10-24", time: "09:50 AM", camera: "Cam 04", type: "No Helmet, No Vest", workerId: "Unknown", severity: "Critical" },
    { id: "V-1039", date: "2023-10-24", time: "09:12 AM", camera: "Cam 01", type: "No Gloves", workerId: "W-550", severity: "Low" },
    { id: "V-1038", date: "2023-10-23", time: "15:44 PM", camera: "Cam 03", type: "Unauthorized Area", workerId: "W-104", severity: "Critical" },
    { id: "V-1037", date: "2023-10-23", time: "14:20 PM", camera: "Cam 02", type: "No Goggles", workerId: "W-881", severity: "Medium" },
]

export default function Logs() {
    const [selectedLog, setSelectedLog] = useState(null)

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Violation Logs</h1>
                    <p className="text-muted-foreground mt-1">Review historical PPE compliance violations.</p>
                </div>
                <div className="flex space-x-3">
                    <Button variant="outline" className="gap-2">
                        <Filter className="w-4 h-4" /> Filter
                    </Button>
                    <Button variant="outline" className="gap-2">
                        <Calendar className="w-4 h-4" /> Date Range
                    </Button>
                    <Button className="gap-2">
                        <Download className="w-4 h-4" /> Export CSV
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader className="py-4 border-b bg-muted/50">
                    <CardTitle className="text-lg">Recent Records</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="bg-muted/20">
                                <TableHead className="w-[100px] py-4">ID</TableHead>
                                <TableHead>Date & Time</TableHead>
                                <TableHead>Camera</TableHead>
                                <TableHead>Violation Type</TableHead>
                                <TableHead>Worker ID</TableHead>
                                <TableHead>Severity</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {mockLogs.map((log) => (
                                <TableRow key={log.id} className="cursor-default hover:bg-muted/50 transition-colors">
                                    <TableCell className="font-medium font-mono text-sm">{log.id}</TableCell>
                                    <TableCell>
                                        <div className="font-medium">{log.date}</div>
                                        <div className="text-xs text-muted-foreground">{log.time}</div>
                                    </TableCell>
                                    <TableCell>{log.camera}</TableCell>
                                    <TableCell>{log.type}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="font-mono">{log.workerId}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={log.severity === 'Critical' || log.severity === 'High' ? 'destructive' : 'secondary'}
                                            className={log.severity === 'Medium' ? 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20' : ''}
                                        >
                                            {log.severity}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Dialog>
                                            <DialogTrigger asChild>
                                                <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                                                    <Eye className="w-4 h-4 mr-2" /> View Snapshot
                                                </Button>
                                            </DialogTrigger>
                                            <DialogContent className="sm:max-w-[700px]">
                                                <DialogHeader>
                                                    <DialogTitle>Violation Snapshot - {selectedLog?.id}</DialogTitle>
                                                </DialogHeader>
                                                <div className="mt-4">
                                                    <div className="aspect-video w-full bg-muted rounded-lg overflow-hidden relative group">
                                                        <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1541888086425-d81bb19460b5?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center brightness-75"></div>
                                                        {/* Bounding box mock */}
                                                        <div className="absolute top-[25%] left-[35%] w-[140px] h-[280px] border-[3px] border-red-500/90 rounded pointer-events-none">
                                                            <div className="absolute -top-7 left-[-3px] bg-red-500/90 text-white text-sm font-medium px-2 py-0.5 rounded shadow-sm">
                                                                {selectedLog?.type}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4 mt-6">
                                                        <div>
                                                            <p className="text-sm font-medium text-muted-foreground">Detection Details</p>
                                                            <div className="mt-2 space-y-1">
                                                                <p className="text-sm"><span className="font-medium">Camera:</span> {selectedLog?.camera}</p>
                                                                <p className="text-sm"><span className="font-medium">Timestamp:</span> {selectedLog?.date} {selectedLog?.time}</p>
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-muted-foreground">Subject Info</p>
                                                            <div className="mt-2 space-y-1">
                                                                <p className="text-sm"><span className="font-medium">Worker ID:</span> {selectedLog?.workerId}</p>
                                                                <p className="text-sm"><span className="font-medium">Severity:</span> {selectedLog?.severity}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </DialogContent>
                                        </Dialog>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="flex items-center justify-between px-2">
                <p className="text-sm text-muted-foreground">Showing 1 to 6 of 142 entries</p>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled>Previous</Button>
                    <Button variant="outline" size="sm">Next</Button>
                </div>
            </div>
        </div>
    )
}
