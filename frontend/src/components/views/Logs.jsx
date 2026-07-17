import { useState, useMemo, useEffect, useRef } from "react"
import { API_BASE } from "@/lib/api"
import { useSearchParams } from "react-router-dom"
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
import { Filter, Search, Download, Eye, Calendar, Plus, Pencil, Trash2, ArrowUpDown, ChevronDown, ChevronUp, X, CheckSquare, Square, Trash, AlertTriangle } from "lucide-react"

const availableViolations = ["Helm", "Seragam"]

// Mapping for backend format (Indonesian → English class names)
const violationToEnglish = { "Helm": "Helmet", "Seragam": "Uniform" }
const violationFromEnglish = { "Helmet": "Helm", "Uniform": "Seragam" }

export default function Logs() {
    const [logs, setLogs] = useState([])
    const [studentsList, setStudentsList] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [selectedLog, setSelectedLog] = useState(null)
    const [searchTerm, setSearchTerm] = useState("")
    const [dateFrom, setDateFrom] = useState("")
    const [dateTo, setDateTo] = useState("")
    const [selectedTypes, setSelectedTypes] = useState([])
    const [isFilterDropdownOpen, setIsFilterDropdownOpen] = useState(false)
    const [searchParams, setSearchParams] = useSearchParams()
    const editTargetId = searchParams.get("edit")

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

    const [selectedImage, setSelectedImage] = useState(null)
    const [previewUrl, setPreviewUrl] = useState(null)
    const [removeImage, setRemoveImage] = useState(false)
    const fileInputRef = useRef(null)

    // Bulk selection state
    const [selectedIds, setSelectedIds] = useState(new Set())
    const [bulkSeverity, setBulkSeverity] = useState("")
    const [bulkStatus, setBulkStatus] = useState("")

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(API_BASE + '/api/logs', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setLogs(data);
            }
        } catch (error) {
            console.error("Error fetching logs", error);
        } finally {
            setIsLoading(false);
        }
    };

    const fetchStudents = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const res = await fetch(API_BASE + '/api/students', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setStudentsList(data);
            }
        } catch (error) {
            console.error("Error fetching students", error);
        }
    };

    useEffect(() => {
        fetchLogs();
        fetchStudents();
    }, []);

    // Auto-open edit dialog when navigated with ?edit=ID
    useEffect(() => {
        if (!editTargetId || logs.length === 0) return
        const target = logs.find(l => l.id === editTargetId)
        if (target) {
            handleEdit(target)
            // Clear the param so it doesn't re-trigger on every render
            setSearchParams({}, { replace: true })
        }
    }, [editTargetId, logs]);

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
        setSelectedImage(null)
        setPreviewUrl(null)
        setRemoveImage(false)
        setIsAddOpen(true)
    }

    const handleEdit = (log) => {
        // Strip "Kurang: " prefix so badge toggles match availableViolations
        const rawType = log.type ? log.type.replace(/^Kurang:\s*/, '') : ''
        setFormData({
            ...log,
            type: rawType,
            student: log.student_id ? log.student_id.toString() : "",
            time: log.time_input || log.time
        })
        setSelectedImage(null)
        setRemoveImage(false)
        if (log.image_path) {
            setPreviewUrl(`${API_BASE}/${log.image_path.replace(/\\/g, '/')}`)
        } else {
            setPreviewUrl(null)
        }
        setIsEditOpen(true)
    }

    const clearImage = () => {
        if (previewUrl && previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(previewUrl)
        }
        setSelectedImage(null)
        setPreviewUrl(null)
        setRemoveImage(true)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleImageChange = (e) => {
        const file = e.target.files?.[0]
        if (file) {
            setSelectedImage(file)
            setPreviewUrl(URL.createObjectURL(file))
            setRemoveImage(false)
        }
    }

    const handleDelete = async (id) => {
        if (window.confirm("Apakah Anda yakin ingin menghapus log ini?")) {
            try {
                const token = sessionStorage.getItem('token');
                await fetch(`${API_BASE}/api/logs/${id}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                fetchLogs();
            } catch (err) {
                console.error("Failed to delete", err);
            }
        }
    }

    // Bulk selection helpers
    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    const toggleSelectAll = () => {
        if (selectedIds.size === paginatedLogs.length) {
            setSelectedIds(new Set())
        } else {
            setSelectedIds(new Set(paginatedLogs.map(l => l.id)))
        }
    }

    const handleBulkDelete = async () => {
        if (selectedIds.size === 0) return
        if (!window.confirm(`Hapus ${selectedIds.size} log yang dipilih?`)) return
        try {
            const token = sessionStorage.getItem('token')
            await fetch(API_BASE + '/api/logs/bulk-delete', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ log_numbers: [...selectedIds] })
            })
            setSelectedIds(new Set())
            fetchLogs()
        } catch (err) {
            console.error("Bulk delete failed", err)
        }
    }

    const handleBulkUpdate = async () => {
        if (selectedIds.size === 0) return
        if (!bulkSeverity && !bulkStatus) {
            alert("Pilih minimal satu field untuk diperbarui (tingkat keparahan atau status).")
            return
        }
        try {
            const token = sessionStorage.getItem('token')
            const params = new URLSearchParams()
            if (bulkSeverity) params.append('severity', bulkSeverity)
            if (bulkStatus) params.append('status', bulkStatus)
            await fetch(`${API_BASE}/api/logs/bulk-update?${params.toString()}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ log_numbers: [...selectedIds] })
            })
            setSelectedIds(new Set())
            setBulkSeverity("")
            setBulkStatus("")
            fetchLogs()
        } catch (err) {
            console.error("Bulk update failed", err)
        }
    }

    const handleSaveAdd = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const payload = new FormData();
            const violationType = formData.type ? `Kurang: ${formData.type}` : '';
            payload.append('violation_type', violationType);
            payload.append('severity', formData.severity);
            payload.append('student_id', formData.student || 'null');
            payload.append('camera_id', 'null'); // default

            if (selectedImage) {
                payload.append('file', selectedImage);
            }

            const response = await fetch(API_BASE + '/api/logs', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: payload
            });

            if (response.ok) {
                setIsAddOpen(false);
                fetchLogs();
            } else {
                const err = await response.json();
                console.error("API Error:", err);
                alert("Gagal menyimpan data: " + (err.detail || JSON.stringify(err)));
            }
        } catch (err) {
            console.error("Failed to add", err);
            alert("Terjadi kesalahan jaringan.");
        }
    }

    const handleSaveEdit = async () => {
        try {
            const token = sessionStorage.getItem('token');
            const payload = new FormData();
            const violationType = formData.type ? `Kurang: ${formData.type}` : '';
            payload.append('violation_type', violationType);
            payload.append('severity', formData.severity);
            payload.append('status', formData.status);
            payload.append('student_id', formData.student || 'null');
            payload.append('remove_image', removeImage.toString());

            if (selectedImage) {
                payload.append('file', selectedImage);
            }

            const response = await fetch(`${API_BASE}/api/logs/${formData.id}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: payload
            });

            if (response.ok) {
                setIsEditOpen(false);
                fetchLogs();
            } else {
                const err = await response.json();
                console.error("API Error:", err);
                alert("Gagal mengubah data: " + (err.detail || JSON.stringify(err)));
            }
        } catch (err) {
            console.error("Failed to edit", err);
            alert("Terjadi kesalahan jaringan.");
        }
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
                        <label className="text-sm font-medium">Tanggal</label>
                        <input type="date" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                            value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Waktu</label>
                        <input type="time" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                            value={formData.time} onChange={(e) => setFormData({ ...formData, time: e.target.value })} />
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Kamera</label>
                    <input className="flex h-9 w-full rounded-md border border-input bg-muted px-3 py-1 text-sm shadow-sm cursor-not-allowed"
                        value="Main Camera" readOnly disabled />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Jenis Pelanggaran</label>
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
                        <label className="text-sm font-medium">Siswa</label>
                        <select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                            value={formData.student} onChange={(e) => setFormData({ ...formData, student: e.target.value })}>
                            <option value="">Tidak Diketahui / Tidak Ada</option>
                            {studentsList.map(s => (
                                <option key={s.id} value={s.id}>{s.name} ({s.nim})</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Tingkat Keparahan</label>
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
                <div className="space-y-2">
                    <label className="text-sm font-medium">Unggah Gambar Snapshot</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageChange}
                        ref={fileInputRef}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm file:border-0 file:bg-transparent file:text-sm file:font-medium"
                    />
                    {previewUrl && (
                        <div className="mt-2 relative aspect-video w-full max-w-[200px] overflow-hidden rounded-md border group">
                            <img src={previewUrl} alt="Preview" className="object-cover w-full h-full" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <button
                                    type="button"
                                    onClick={clearImage}
                                    className="p-2 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    return (
        <div className="p-8 space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Log Pelanggaran</h1>
                    <p className="text-muted-foreground mt-1">Tinjau riwayat pelanggaran kepatuhan APD.</p>
                </div>
            </div>

            <Card>
                <CardHeader className="py-4 border-b bg-muted/50 flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-4">
                        <CardTitle className="text-lg">Catatan Terbaru</CardTitle>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground whitespace-nowrap">Tampilkan</span>
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
                            <span className="text-sm text-muted-foreground whitespace-nowrap hidden sm:inline-block">entri</span>
                        </div>
                        <div className="relative flex-1 min-w-[180px] sm:max-w-[240px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input
                                type="text"
                                placeholder="Cari log..."
                                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 pl-9"
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
                                    <div className="font-medium text-sm mb-2">Filter Jenis</div>
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
                                                Hapus Filter
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
                                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark]"
                                value={dateFrom}
                                onChange={(e) => setDateFrom(e.target.value)}
                            />
                            <span className="text-muted-foreground">-</span>
                            <input
                                type="date"
                                className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [color-scheme:light] dark:[color-scheme:dark]"
                                value={dateTo}
                                onChange={(e) => setDateTo(e.target.value)}
                            />
                        </div>
                        <div className="flex items-center gap-2 sm:ml-auto">
                            <Button variant="outline" className="gap-2 h-9" onClick={handleExportCSV}>
                                <Download className="w-4 h-4" /> Ekspor CSV
                            </Button>

                            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                                <DialogTrigger asChild>
                                    <Button className="gap-2 h-9" variant="default" onClick={handleAdd}>
                                        <Plus className="w-4 h-4" /> Tambah Log
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="sm:max-w-[425px]">
                                    <DialogHeader>
                                        <DialogTitle>Tambah Log Pelanggaran Baru</DialogTitle>
                                    </DialogHeader>
                                    {renderForm()}
                                    <DialogFooter>
                                        <Button variant="outline" onClick={() => setIsAddOpen(false)}>Batal</Button>
                                        <Button onClick={handleSaveAdd}>Simpan</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>
                </CardHeader>

                {/* Bulk action bar */}
                {selectedIds.size > 0 && (
                    <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b">
                        <span className="text-sm font-medium">{selectedIds.size} dipilih</span>
                        <select
                            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
                            value={bulkSeverity}
                            onChange={(e) => setBulkSeverity(e.target.value)}
                        >
                            <option value="">Atur Tingkat...</option>
                            <option value="Low">Low</option>
                            <option value="Medium">Medium</option>
                            <option value="High">High</option>
                            <option value="Critical">Critical</option>
                        </select>
                        <select
                            className="h-8 rounded-md border border-input bg-background px-2 py-1 text-sm"
                            value={bulkStatus}
                            onChange={(e) => setBulkStatus(e.target.value)}
                        >
                            <option value="">Atur Status...</option>
                            <option value="Belum Dihukum">Belum Dihukum</option>
                            <option value="Sudah Dihukum">Sudah Dihukum</option>
                        </select>
                        <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleBulkUpdate}>
                            <Pencil className="w-3 h-3" /> Terapkan
                        </Button>
                        <Button size="sm" variant="destructive" className="h-8 gap-1" onClick={handleBulkDelete}>
                            <Trash2 className="w-3 h-3" /> Hapus
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelectedIds(new Set())}>
                            Bersihkan
                        </Button>
                    </div>
                )}

                <CardContent className="p-0 overflow-x-auto">
                    <Table className="min-w-[900px]">
                        <TableHeader>
                            <TableRow className="bg-muted/20">
                                <TableHead className="w-[40px] py-4 text-center">
                                    <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-foreground transition-colors">
                                        {selectedIds.size === paginatedLogs.length && paginatedLogs.length > 0
                                            ? <CheckSquare className="w-4 h-4 text-primary" />
                                            : <Square className="w-4 h-4" />
                                        }
                                    </button>
                                </TableHead>
                                <TableHead className="w-[100px] py-4 whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('id')}>
                                    <div className="flex items-center gap-1">ID {sortConfig.key === 'id' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('date')}>
                                    <div className="flex items-center gap-1">Tanggal & Waktu {sortConfig.key === 'date' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('camera')}>
                                    <div className="flex items-center gap-1">Kamera {sortConfig.key === 'camera' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('type')}>
                                    <div className="flex items-center gap-1">Jenis Pelanggaran {sortConfig.key === 'type' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('student')}>
                                    <div className="flex items-center gap-1">Siswa {sortConfig.key === 'student' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('severity')}>
                                    <div className="flex items-center gap-1">Keparahan {sortConfig.key === 'severity' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="whitespace-nowrap cursor-pointer hover:bg-muted/50" onClick={() => handleSort('status')}>
                                    <div className="flex items-center gap-1">Status {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-20" />}</div>
                                </TableHead>
                                <TableHead className="text-center whitespace-nowrap w-[150px]">Aksi</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-24 text-center">
                                        Memuat data...
                                    </TableCell>
                                </TableRow>
                            ) : paginatedLogs.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={9} className="h-24 text-center">
                                        Tidak ada log yang sesuai dengan kriteria Anda.
                                    </TableCell>
                                </TableRow>
                            ) : paginatedLogs.map((log) => (
                                <TableRow key={log.id} className={"cursor-default hover:bg-muted/50 transition-colors" + (selectedIds.has(log.id) ? " bg-primary/5" : "")}>
                                    <TableCell className="text-center">
                                        <button onClick={() => toggleSelect(log.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                                            {selectedIds.has(log.id)
                                                ? <CheckSquare className="w-4 h-4 text-primary" />
                                                : <Square className="w-4 h-4" />
                                            }
                                        </button>
                                    </TableCell>
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
                                                    <Button variant="ghost" size="icon" onClick={() => setSelectedLog(log)} title="Lihat Snapshot">
                                                        <Eye className="w-4 h-4" />
                                                    </Button>
                                                </DialogTrigger>
                                                <DialogContent className="sm:max-w-[700px]">
                                                    <DialogHeader>
                                                        <DialogTitle>Snapshot Pelanggaran - {selectedLog?.id}</DialogTitle>
                                                    </DialogHeader>
                                                    <div className="mt-4">
                                                        <div className="aspect-video w-full bg-muted rounded-lg overflow-hidden relative group">
                                                            {selectedLog?.image_path ? (
                                                                <img
                                                                    src={`${API_BASE}/${selectedLog.image_path.replace(/\\/g, '/')}`}
                                                                    alt="Snapshot pelanggaran"
                                                                    className="w-full h-full object-contain bg-black/90"
                                                                />
                                                            ) : (
                                                                <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
                                                                    <AlertTriangle className="w-12 h-12 opacity-30" />
                                                                    <span className="text-sm">Tidak ada snapshot tersedia</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="mt-4">
                                                            <p className="text-sm font-medium text-muted-foreground mb-2">Pelanggaran Terdeteksi</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {selectedLog?.type ? selectedLog.type.split(', ').map((v, i) => (
                                                                    <Badge key={i} variant="destructive" className="gap-1">
                                                                        <AlertTriangle className="w-3 h-3" />
                                                                        {v}
                                                                    </Badge>
                                                                )) : (
                                                                    <span className="text-sm text-muted-foreground">Tidak ada pelanggaran tercatat</span>
                                                                )}
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-4 mt-4">
                                                            <div>
                                                                <p className="text-sm font-medium text-muted-foreground">Detail Deteksi</p>
                                                                <div className="mt-2 space-y-1">
                                                                    <p className="text-sm"><span className="font-medium">Kamera:</span> {selectedLog?.camera}</p>
                                                                    <p className="text-sm"><span className="font-medium">Waktu:</span> {(() => {
                                                                        const [year, month, day] = selectedLog?.date ? selectedLog.date.split("-") : ["", "", ""];
                                                                        return selectedLog?.date ? `${day}/${month}/${year}` : "";
                                                                    })()} {selectedLog?.time}</p>
                                                                </div>
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-medium text-muted-foreground">Informasi Subjek</p>
                                                                <div className="mt-2 space-y-1">
                                                                    <p className="text-sm"><span className="font-medium">Siswa:</span> {selectedLog?.student}</p>
                                                                    <p className="text-sm"><span className="font-medium">Keparahan:</span> {selectedLog?.severity}</p>
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
                                                        <DialogTitle>Edit Log Pelanggaran</DialogTitle>
                                                    </DialogHeader>
                                                    {renderForm()}
                                                    <DialogFooter>
                                                        <Button variant="outline" onClick={() => setIsEditOpen(false)}>Batal</Button>
                                                        <Button onClick={handleSaveEdit}>Simpan Perubahan</Button>
                                                    </DialogFooter>
                                                </DialogContent>
                                            </Dialog>

                                            <Button variant="ghost" size="icon" onClick={() => handleDelete(log.id)} title="Hapus" className="text-destructive hover:bg-destructive/10 hover:text-destructive">
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
                    Menampilkan {filteredLogs.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} sampai {Math.min(currentPage * itemsPerPage, filteredLogs.length)} dari {filteredLogs.length} entri
                </p>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    >
                        Sebelumnya
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={currentPage >= totalPages || totalPages === 0}
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    >
                        Berikutnya
                    </Button>
                </div>
            </div>
        </div>
    )
}
