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
    const [searchTerm, setSearchTerm] = useState("")
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")

    const filteredLogs = mockLogs.filter(log => {
        const matchesSearch = log.type.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.camera.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.workerId.toLowerCase().includes(searchTerm.toLowerCase()) ||
            log.id.toLowerCase().includes(searchTerm.toLowerCase());

        let matchesDate = true;
        if (dateFrom) {
            matchesDate = matchesDate && log.date >= dateFrom;
        }
        if (dateTo) {
            matchesDate = matchesDate && log.date <= dateTo;
        }

        return matchesSearch && matchesDate;
    })

    const handleExportCSV = () => {
        const headers = ["ID", "Date", "Time", "Camera", "Type", "Worker ID", "Severity"];
        const rows = filteredLogs.map(log => {
            // Format date to dd/mm/yyyy
            const [year, month, day] = log.date.split("-");
            const formattedDate = `${day}/${month}/${year}`;
            return [log.id, formattedDate, log.time, log.camera, `"${log.type}"`, log.workerId, log.severity]
        });
        const csvContent = "data:text/csv;charset=utf-8,"
            + headers.join(",") + "\n"
            + rows.map(e => e.join(",")).join("\n");
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `violation_logs_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Violation Logs</h1>
                    <p className="text-muted-foreground mt-1">Review historical PPE compliance violations.</p>
                </div>
            </div>

            <Card>
                <CardHeader className="py-4 border-b bg-muted/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <CardTitle className="text-lg">Recent Records</CardTitle>
                    <div className="flex flex-col sm:flex-row gap-3">
                        <div className="relative">
                            <Filter className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Filter logs..."
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-9 sm:w-[200px]"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground hidden sm:block" />
                            <input
                                type="date"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                            />
                            <span className="text-muted-foreground">-</span>
                            <input
                                type="date"
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                            />
                        </div>
                        <Button className="gap-2" onClick={handleExportCSV}>
                            <Download className="w-4 h-4" /> Export CSV
                        </Button>
                    </div>
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
                            {filteredLogs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="h-24 text-center">
                                        No logs found matching your criteria.
                                    </TableCell>
                                </TableRow>
                            ) : filteredLogs.map((log) => (
                                <TableRow key={log.id} className="cursor-default hover:bg-muted/50 transition-colors">
                                    <TableCell className="font-medium font-mono text-sm">{log.id}</TableCell>
                                    <TableCell>
                                        <div className="font-medium">
                                            {(() => {
                                                const [year, month, day] = log.date.split("-");
                                                return `${day}/${month}/${year}`;
                                            })()}
                                        </div>
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
                                                                <p className="text-sm"><span className="font-medium">Timestamp:</span> {(() => {
                                                                    const [year, month, day] = selectedLog?.date ? selectedLog.date.split("-") : ["", "", ""];
                                                                    return selectedLog?.date ? `${day}/${month}/${year}` : "";
                                                                })()} {selectedLog?.time}</p>
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
                <p className="text-sm text-muted-foreground">Showing {filteredLogs.length} entries</p>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled>Previous</Button>
                    <Button variant="outline" size="sm">Next</Button>
                </div>
            </div>
        </div>
    )
}
