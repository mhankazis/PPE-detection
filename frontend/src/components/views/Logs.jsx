import { useState, useMemo } from "react"
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
    DialogFooter,
} from "@/components/ui/dialog"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Filter, Search, Download, Eye, Calendar, Plus, Pencil, Trash2, ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react"

const availableViolations = ["No Helmet", "No Vest", "No Gloves", "No Goggles", "Unauthorized Area"]

const initialMockLogs = [
    { id: "V-1042", date: "2023-10-24", time: "10:24 AM", camera: "Cam 04", type: "No Helmet", student: "S-294", severity: "High", status: "Belum Dihukum" },
    { id: "V-1041", date: "2023-10-24", time: "10:15 AM", camera: "Cam 02", type: "No Vest", student: "S-112", severity: "Medium", status: "Sudah Dihukum" },
    { id: "V-1040", date: "2023-10-24", time: "09:50 AM", camera: "Cam 04", type: "No Helmet, No Vest", student: "Unknown", severity: "Critical", status: "Belum Dihukum" },
    { id: "V-1039", date: "2023-10-24", time: "09:12 AM", camera: "Cam 01", type: "No Gloves", student: "S-550", severity: "Low", status: "Sudah Dihukum" },
    { id: "V-1038", date: "2023-10-23", time: "15:44 PM", camera: "Cam 03", type: "Unauthorized Area", student: "S-104", severity: "Critical", status: "Belum Dihukum" },
    { id: "V-1037", date: "2023-10-23", time: "14:20 PM", camera: "Cam 02", type: "No Goggles", student: "S-881", severity: "Medium", status: "Sudah Dihukum" },
]

export default function Logs() {
    const [logs, setLogs] = useState(initialMockLogs)
    const [selectedLog, setSelectedLog] = useState(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")
    const [selectedTypes, setSelectedTypes] = useState([])
    const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false)

    // Sorting & Pagination state
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' })
    const [itemsPerPage, setItemsPerPage] = useState(10)
    const [currentPage, setCurrentPage] = useState(1)

    // Form state
    const [isAddOpen, setIsAddOpen] = useState(false)
    const [isEditOpen, setIsEditOpen] = useState(false)
    const [formData, setFormData] = useState({
        id: "", date: "", time: "", camera: "", type: "", student: "", severity: "Low", status: "Belum Dihukum"
    })

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    }

    const filteredLogs = useMemo(() => {
        let filtered = logs.filter(log => {
            const searchLower = searchTerm.toLowerCase();
            const matchesSearch = log.type.toLowerCase().includes(searchLower) ||
                log.camera.toLowerCase().includes(searchLower) ||
                log.student.toLowerCase().includes(searchLower) ||
                log.id.toLowerCase().includes(searchLower);

            let matchesDate = true;
            if (dateFrom) {
                matchesDate = matchesDate && log.date >= dateFrom;
            }
            if (dateTo) {
                matchesDate = matchesDate && log.date <= dateTo;
            }

            let matchesType = true;
            if (selectedTypes.length > 0) {
                const logTypes = log.type.split(', ');
                matchesType = selectedTypes.some(t => logTypes.includes(t));
            }

            return matchesSearch && matchesDate && matchesType;
        });

        filtered.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? -1 : 1;
            }
            if (a[sortConfig.key] > b[sortConfig.key]) {
                return sortConfig.direction === 'asc' ? 1 : -1;
            }
            return 0;
        });

        return filtered;
    }, [logs, searchTerm, dateFrom, dateTo, sortConfig, selectedTypes]);

    const paginatedLogs = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredLogs, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredLogs.length / itemsPerPage);

    const handleExportCSV = () => {
        const headers = ["ID", "Date", "Time", "Camera", "Type", "Student", "Severity", "Status"];
        const rows = filteredLogs.map(log => {
            // Format date to dd/mm/yyyy
            const [year, month, day] = log.date.split("-");
            const formattedDate = `${day}/${month}/${year}`;
            return [log.id, formattedDate, log.time, log.camera, `"${log.type}"`, log.student, log.severity, log.status]
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

    const handleAdd = () => {
        setFormData({ id: "", date: new Date().toISOString().split('T')[0], time: "", camera: "", type: "", student: "", severity: "Low", status: "Belum Dihukum" })
        setIsAddOpen(true)
    }

    const handleEdit = (log) => {
        setFormData(log)
        setIsEditOpen(true)
    }

    const handleDelete = (id) => {
        if (window.confirm("Are you sure you want to delete this log?")) {
            setLogs(logs.filter(log => log.id !== id))
        }
    }

    const handleSaveAdd = () => {
        const newLog = {
            ...formData,
            id: `V-${1000 + Math.floor(Math.random() * 9000)}`
        }
        setLogs([newLog, ...logs])
        setIsAddOpen(false)
    }

    const handleSaveEdit = () => {
        setLogs(logs.map(log => log.id === formData.id ? formData : log))
        setIsEditOpen(false)
    }

    const renderForm = () => {
        const toggleViolation = (vtype) => {
            let currentViolations = formData.type ? formData.type.split(', ').filter(v => v !== '') : []
            if (currentViolations.includes(vtype)) {
                currentViolations = currentViolations.filter(v => v !== vtype)
            } else {
                currentViolations.push(vtype)
            }
            setFormData({ ...formData, type: currentViolations.join(', ') })
        }

        return (
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Date</label>
                        <input type="date" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                            value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Time</label>
                        <input type="time" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                            value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Camera</label>
                    <input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={formData.camera} onChange={(e) => setFormData({ ...formData, camera: e.target.value })} />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Violation Type</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                        {availableViolations.map(vtype => {
                            const isSelected = formData.type && formData.type.includes(vtype);
                            return (
                                <Badge
                                    key={vtype}
                                    variant={isSelected ? "default" : "outline"}
                                    className={"cursor-pointer transition-colors " + (isSelected ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-accent hover:text-accent-foreground")}
                                    onClick={() => toggleViolation(vtype)}
                                >
                                    {vtype}
                                </Badge>
                            )
                        })}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Student</label>
                        <input className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                            value={formData.student} onChange={(e) => setFormData({ ...formData, student: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Severity</label>
                        <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            value={formData.severity} onChange={(e) => setFormData({ ...formData, severity: e.target.value })}>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                        </select>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                        value={formData.status} onChange={(e) => setFormData({ ...formData, status: e.target.value })}>
                        <option value="Belum Dihukum">Belum Dihukum</option>
                        <option value="Sudah Dihukum">Sudah Dihukum</option>
                    </select>
                </div>
            </div>
        )
    }

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Violation Logs</h1>
                    <p className="text-muted-foreground mt-1">Review historical PPE compliance violations.</p>
                </div>
            </div>

            <Card>
                <CardHeader className="py-4 border-b bg-muted/50 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <CardTitle className="text-lg">Recent Records</CardTitle>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-muted-foreground whitespace-nowrap">Show</span>
                                <select
                                    className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    value={itemsPerPage}
                                    onChange={(e) => {
                                        setItemsPerPage(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                </select>
                                <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline-block">entries</span>
                            </div>
                            <div className="relative">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <input
                                    type="text"
                                    placeholder="Search logs..."
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-9 sm:w-[200px]"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        setCurrentPage(1);
                                    }}
                                />
                            </div>
                            <div className="relative relative-filter-dropdown">
                                <Button
                                    variant="outline"
                                    className="gap-2 h-9"
                                    onClick={() => setIsFilterDropdownOpen(!isFilterDropdownOpen)}
                                >
                                    <Filter className="w-4 h-4" /> Filter
                                    {selectedTypes.length > 0 && (
                                        <Badge variant="secondary" className="ml-1 h-5 px-1">{selectedTypes.length}</Badge>
                                    )}
                                </Button>
                                {isFilterDropdownOpen && (
                                    <div className="absolute top-full left-0 mt-2 z-50 w-64 bg-background border rounded-md shadow-md p-3">
                                        <div className="font-medium text-sm mb-2">Filter Type</div>
                                        <div className="flex flex-wrap gap-2">
                                            {availableViolations.map(vtype => {
                                                const isSelected = selectedTypes.includes(vtype);
                                                return (
                                                    <Badge
                                                        key={vtype}
                                                        variant={isSelected ? "default" : "outline"}
                                                        className={"cursor-pointer transition-colors " + (isSelected ? "bg-primary text-primary-foreground hover:bg-primary/90" : "hover:bg-accent hover:text-accent-foreground")}
                                                        onClick={() => {
                                                            if (selectedTypes.includes(vtype)) {
                                                                setSelectedTypes(selectedTypes.filter(t => t !== vtype));
                                                            } else {
                                                                setSelectedTypes([...selectedTypes, vtype]);
                                                            }
                                                            setCurrentPage(1);
                                                        }}
                                                    >
                                                        {vtype}
                                                    </Badge>
                                                )
                                            })}
                                        </div>
                                        {selectedTypes.length > 0 && (
                                            <div className="mt-3 pt-3 border-t">
                                                <Button variant="ghost" size="sm" className="w-full text-xs h-7" onClick={() => { setSelectedTypes([]); setCurrentPage(1); setIsFilterDropdownOpen(false); }}>
                                                    Clear Filters
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
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
                            <div className="flex items-center gap-2">
                                <Button className="gap-2" onClick={handleExportCSV}>
                                    <Download className="w-4 h-4" /> Export CSV
                                </Button>

                                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                                    <DialogTrigger asChild>
                                        <Button className="gap-2" variant="default" onClick={handleAdd}>
                                            <Plus className="w-4 h-4" /> Add Log
                                        </Button>
                                    </DialogTrigger>
                                    <DialogContent className="sm:max-w-[425px]">
                                        <DialogHeader>
                                            <DialogTitle>Add New Violation Log</DialogTitle>
                                        </DialogHeader>
                                        {renderForm()}
                                        <DialogFooter>
                                            <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
                                            <Button onClick={handleSaveAdd}>Save</Button>
                                        </DialogFooter>
                                    </DialogContent>
                                </Dialog>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                    <Table className="min-w-[900px]">
                        <TableHeader>
                            <TableRow className="bg-muted/20">
                                <TableHead className="w-[100px] py-4 whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('id')}>
                                    <div className="flex items-center gap-1">ID {sortConfig.key === 'id' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('date')}>
                                    <div className="flex items-center gap-1">Date & Time {sortConfig.key === 'date' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('camera')}>
                                    <div className="flex items-center gap-1">Camera {sortConfig.key === 'camera' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('type')}>
                                    <div className="flex items-center gap-1">Violation Type {sortConfig.key === 'type' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('student')}>
                                    <div className="flex items-center gap-1">Student {sortConfig.key === 'student' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('severity')}>
                                    <div className="flex items-center gap-1">Severity {sortConfig.key === 'severity' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('status')}>
                                    <div className="flex items-center gap-1">Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="text-center whitespace-nowrap w-[150px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {paginatedLogs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="h-24 text-center">
                                        No logs found matching your criteria.
                                    </TableCell>
                                </TableRow>
                            ) : paginatedLogs.map((log) => (
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
                                        <Badge variant="outline" className="font-mono">{log.student}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={log.severity === 'Critical' || log.severity === 'High' ? 'destructive' : 'secondary'}
                                            className={log.severity === 'Medium' ? 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20' : ''}
                                        >
                                            {log.severity}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        <Badge
                                            variant={log.status === 'Sudah Dihukum' ? 'default' : 'secondary'}
                                            className={log.status === 'Sudah Dihukum' ? 'bg-green-500 hover:bg-green-600' : 'bg-orange-500/10 text-orange-600 hover:bg-orange-500/20'}
                                        >
                                            {log.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Dialog>
                                                <DialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)} title="View Snapshot">
                                                        <Eye className="w-4 h-4" />
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
                                                                    <p className="text-sm"><span className="font-medium">Student:</span> {selectedLog?.student}</p>
                                                                    <p className="text-sm"><span className="font-medium">Severity:</span> {selectedLog?.severity}</p>
                                                                    <p className="text-sm"><span className="font-medium">Status:</span> {selectedLog?.status}</p>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </DialogContent>
                                            </Dialog>

                                            <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
                                                <DialogTrigger asChild>
                                                    <Button variant="ghost" size="icon" onClick={() => handleEdit(log)} title="Edit">
                                                        <Pencil className="w-4 h-4" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="sm:max-w-[425px]">
                                                    <DialogHeader>
                                                        <DialogTitle>Edit Violation Log</DialogTitle>
                                                    </DialogHeader>
                                                    {renderForm()}
                                                    <DialogFooter>
                                                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
                                                        <Button onClick={handleSaveEdit}>Save Changes</Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>

                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(log.id)} title="Delete" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="flex items-center justify-between px-2">
                <p className="text-sm text-muted-foreground">
                    Showing {filteredLogs.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredLogs.length)} of {filteredLogs.length} entries
                </p>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    >
                        Previous
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages || totalPages === 0}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    >
                        Next
                    </Button>
                </div>
            </div>
        </div>
    )
}
