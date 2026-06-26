import { useState, useRef, useEffect, useCallback } from "react"
import { Users, Upload, Image as ImageIcon, X, Save, Camera, Plus, List as ListIcon, Trash2, User, Pencil, Video, CheckCircle, AlertCircle, Eye, ImageOff } from "lucide-react"

const API_BASE = "http://localhost:8000"

export default function Students() {
    const [activeTab, setActiveTab] = useState('list') // 'list' | 'add'
    const [students, setStudents] = useState([])
    const [isLoading, setIsLoading] = useState(false)

    // Form states
    const [editingId, setEditingId] = useState(null)
    const [selectedImage, setSelectedImage] = useState(null)
    const [previewUrl, setPreviewUrl] = useState(null)
    const [originalPhotoUrl, setOriginalPhotoUrl] = useState(null) // track initial photo on edit
    const [isDragging, setIsDragging] = useState(false)
    const [formData, setFormData] = useState({ name: '', nis: '', class: '' })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const fileInputRef = useRef(null)

    // Camera capture states
    const [showCameraCapture, setShowCameraCapture] = useState(false)
    const [capturedPhotos, setCapturedPhotos] = useState(0)
    const [isCapturing, setIsCapturing] = useState(false)
    const [captureMessage, setCaptureMessage] = useState(null)
    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const MAX_PHOTOS = 10

    // Dataset gallery modal states
    const [showDatasetModal, setShowDatasetModal] = useState(false)
    const [datasetPhotos, setDatasetPhotos] = useState([])
    const [datasetStudentName, setDatasetStudentName] = useState('')
    const [datasetStudentId, setDatasetStudentId] = useState(null)
    const [isLoadingDataset, setIsLoadingDataset] = useState(false)

    const fetchStudents = async () => {
        setIsLoading(true)
        try {
            const token = sessionStorage.getItem('token')
            const response = await fetch('http://localhost:8000/api/students', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })
            if (response.ok) {
                const data = await response.json()
                setStudents(data)
            }
        } catch (error) {
            console.error("Failed to fetch students", error)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'list') {
            fetchStudents()
        }
    }, [activeTab])

    const handleFileSelect = (file) => {
        if (file && file.type.startsWith('image/')) {
            setSelectedImage(file)
            setPreviewUrl(URL.createObjectURL(file))
        } else {
            alert('Please select a valid image file.')
        }
    }

    const onFileDrop = (e) => {
        e.preventDefault()
        setIsDragging(false)
        const file = e.dataTransfer.files?.[0]
        if (file) handleFileSelect(file)
    }

    const onFileInputChange = (e) => {
        const file = e.target.files?.[0]
        if (file) handleFileSelect(file)
    }

    const clearImage = () => {
        if (previewUrl && previewUrl.startsWith('blob:')) {
            URL.revokeObjectURL(previewUrl)
        }
        setSelectedImage(null)
        setPreviewUrl(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
    }

    const handleInputChange = (e) => {
        const { name, value } = e.target
        setFormData(prev => ({ ...prev, [name]: value }))
    }

    const resetForm = () => {
        setFormData({ name: '', nis: '', class: '' })
        clearImage()
        setEditingId(null)
        setOriginalPhotoUrl(null)
        stopCamera()
        setShowCameraCapture(false)
        setCapturedPhotos(0)
        setCaptureMessage(null)
    }

    // Camera capture functions
    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
            })
            streamRef.current = stream
            if (videoRef.current) {
                videoRef.current.srcObject = stream
            }
        } catch (err) {
            console.error("Camera access failed:", err)
            setCaptureMessage({ type: 'error', text: 'Gagal mengakses kamera. Pastikan izin kamera diberikan.' })
        }
    }, [])

    const stopCamera = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop())
            streamRef.current = null
        }
    }, [])

    const handleCaptureFromCamera = async () => {
        if (!editingId) {
            setCaptureMessage({ type: 'error', text: 'Simpan data murid terlebih dahulu sebelum capture dataset.' })
            return
        }
        if (capturedPhotos >= MAX_PHOTOS) {
            setCaptureMessage({ type: 'error', text: `Maksimal ${MAX_PHOTOS} foto sudah tercapai.` })
            return
        }

        // Capture frame from browser webcam video element
        if (!videoRef.current) {
            setCaptureMessage({ type: 'error', text: 'Kamera belum aktif. Klik "Buka Kamera" terlebih dahulu.' })
            return
        }

        const video = videoRef.current
        if (video.readyState < 2) {
            setCaptureMessage({ type: 'error', text: 'Kamera masih loading, tunggu sebentar...' })
            return
        }

        setIsCapturing(true)
        setCaptureMessage(null)

        try {
            // Draw current video frame to canvas
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, 0, 0)

            // Convert canvas to blob
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9))
            const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' })

            // Upload to backend
            const token = sessionStorage.getItem('token')
            const payload = new FormData()
            payload.append('file', file)

            const response = await fetch(`${API_BASE}/api/students/${editingId}/capture-dataset`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: payload
            })

            const data = await response.json()
            if (response.ok) {
                setCapturedPhotos(data.total_photos)
                setCaptureMessage({ type: 'success', text: `Foto ke-${data.total_photos} berhasil dicapture!` })
            } else {
                setCaptureMessage({ type: 'error', text: data.detail || 'Gagal capture foto' })
            }
        } catch (err) {
            console.error("Capture error:", err)
            setCaptureMessage({ type: 'error', text: 'Gagal menghubungi server.' })
        } finally {
            setIsCapturing(false)
        }
    }

    const handleUploadDataset = async (e) => {
        const fileList = e.target.files
        if (!fileList || fileList.length === 0 || !editingId) return

        const files = Array.from(fileList)
        setIsCapturing(true)
        setCaptureMessage(null)

        try {
            const token = sessionStorage.getItem('token')
            const payload = new FormData()
            files.forEach(f => payload.append('files', f))

            const response = await fetch(`${API_BASE}/api/students/${editingId}/upload-dataset-bulk`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: payload
            })

            const data = await response.json()
            if (response.ok) {
                setCapturedPhotos(data.total_photos)
                const ok = data.success_count || 0
                const fail = data.fail_count || 0
                if (fail === 0) {
                    setCaptureMessage({ type: 'success', text: `${ok} foto berhasil diupload. Total: ${data.total_photos} foto.` })
                } else {
                    setCaptureMessage({
                        type: ok > 0 ? 'success' : 'error',
                        text: `${ok} berhasil, ${fail} gagal (wajah tidak terdeteksi/file tidak valid). Total: ${data.total_photos} foto.`
                    })
                }
            } else {
                setCaptureMessage({ type: 'error', text: data.detail || 'Gagal upload foto' })
            }
        } catch (err) {
            console.error("Upload error:", err)
            setCaptureMessage({ type: 'error', text: 'Gagal menghubungi server.' })
        } finally {
            setIsCapturing(false)
            e.target.value = ''
        }
    }

    useEffect(() => {
        if (showCameraCapture) {
            startCamera()
        } else {
            stopCamera()
        }
    }, [showCameraCapture, startCamera, stopCamera])

    // Cleanup on unmount
    useEffect(() => {
        return () => stopCamera()
    }, [stopCamera])

    // Load dataset status when editing
    useEffect(() => {
        if (editingId) {
            const fetchDatasetStatus = async () => {
                try {
                    const token = sessionStorage.getItem('token')
                    const res = await fetch(`${API_BASE}/api/students/${editingId}/dataset-status`, {
                        headers: { 'Authorization': `Bearer ${token}` }
                    })
                    if (res.ok) {
                        const data = await res.json()
                        setCapturedPhotos(data.total_photos)
                    }
                } catch (err) {
                    console.error("Failed to fetch dataset status", err)
                }
            }
            fetchDatasetStatus()
        }
    }, [editingId])

    const handleEdit = (student) => {
        setEditingId(student.id)
        setFormData({ name: student.name, nis: student.nim, class: student.kelas || '' })
        const photoUrl = student.photo_path
            ? `http://localhost:8000/${student.photo_path.replace(/\\/g, '/')}`
            : null
        setPreviewUrl(photoUrl)
        setOriginalPhotoUrl(photoUrl) // remember initial state
        setSelectedImage(null)
        setActiveTab('add')
    }

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this student?")) return;

        try {
            const token = sessionStorage.getItem('token')
            const response = await fetch(`http://localhost:8000/api/students/${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            })

            if (response.ok) {
                alert('Student deleted successfully')
                fetchStudents()
            } else {
                alert('Failed to delete student')
            }
        } catch (error) {
            console.error("Delete error", error)
            alert("Network error")
        }
    }

    const handleViewDataset = async (student) => {
        setShowDatasetModal(true)
        setIsLoadingDataset(true)
        setDatasetPhotos([])
        setDatasetStudentName(student.name)
        setDatasetStudentId(student.id)
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(`${API_BASE}/api/students/${student.id}/dataset-photos`, {
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setDatasetPhotos(data.photos || [])
                setDatasetStudentName(data.student_name || student.name)
            } else {
                console.error("Failed to fetch dataset photos")
            }
        } catch (err) {
            console.error("Dataset fetch error", err)
        } finally {
            setIsLoadingDataset(false)
        }
    }

    const handleClearDataset = async (studentId) => {
        if (!studentId) return
        if (!window.confirm("Hapus SEMUA foto dataset wajah murid ini? Tindakan tidak bisa dibatalkan.")) return

        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(`${API_BASE}/api/students/${studentId}/dataset-photos`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setDatasetPhotos([])
                setCapturedPhotos(0)
                alert(`Dataset dihapus: ${data.deleted_embeddings} embedding, ${data.deleted_files} file dihapus.`)
            } else {
                const err = await res.json().catch(() => ({}))
                alert(err.detail || 'Gagal menghapus dataset')
            }
        } catch (err) {
            console.error("Clear dataset error", err)
            alert('Gagal menghubungi server.')
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)

        try {
            const token = sessionStorage.getItem('token')
            const submitData = new FormData()
            submitData.append('name', formData.name)
            submitData.append('nis', formData.nis)
            submitData.append('kelas', formData.class)
            if (selectedImage) {
                submitData.append('file', selectedImage)
            } else if (editingId && originalPhotoUrl && !previewUrl) {
                // Only mark photo for removal if there WAS a photo and user cleared it.
                // Never send remove_photo when there was no photo to begin with
                // (doing so used to wipe the entire face dataset).
                submitData.append('remove_photo', 'true')
            }

            const url = editingId
                ? `http://localhost:8000/api/students/${editingId}`
                : 'http://localhost:8000/api/students'

            const method = editingId ? 'PUT' : 'POST'

            const response = await fetch(url, {
                method: method,
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: submitData
            })

            if (response.ok) {
                alert(`Data for ${formData.name} successfully saved!`)
                resetForm()
                setActiveTab('list') // Switch back to list after success
            } else {
                const err = await response.json()
                alert(err.detail || "Error saving data")
            }
        } catch (error) {
            console.error("Submit error", error)
            alert("Network error while saving data.")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-primary/10 text-primary rounded-xl">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Data Murid</h1>
                        <p className="text-muted-foreground">Manage student data and photo identification.</p>
                    </div>
                </div>

                <div className="flex bg-muted p-1 rounded-xl">
                    <button
                        onClick={() => { setActiveTab('list'); resetForm(); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <ListIcon className="w-4 h-4" />
                        Daftar Murid
                    </button>
                    <button
                        onClick={() => { setActiveTab('add'); resetForm(); }}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${(activeTab === 'add' && !editingId) ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <Plus className="w-4 h-4" />
                        Tambah Baru
                    </button>
                </div>
            </div>

            {activeTab === 'list' && (
                <div className="border rounded-2xl bg-card shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Foto</th>
                                    <th className="px-6 py-4 font-medium">Nama</th>
                                    <th className="px-6 py-4 font-medium">NIS</th>
                                    <th className="px-6 py-4 font-medium">Kelas</th>
                                    <th className="px-6 py-4 font-medium">Waktu Daftar</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-8 text-center text-muted-foreground">Memuat data...</td>
                                    </tr>
                                ) : students.length === 0 ? (
                                    <tr>
                                        <td colSpan="6" className="px-6 py-12 text-center">
                                            <div className="flex flex-col items-center justify-center space-y-3">
                                                <div className="p-3 bg-muted rounded-full">
                                                    <Users className="w-6 h-6 text-muted-foreground" />
                                                </div>
                                                <p className="text-muted-foreground">Belum ada data murid.</p>
                                                <button onClick={() => setActiveTab('add')} className="text-primary hover:underline text-sm font-medium">
                                                    Tambah murid pertama
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ) : (
                                    students.map(student => (
                                        <tr key={student.id} className="hover:bg-muted/50 transition-colors">
                                            <td className="px-6 py-4">
                                                {student.photo_path ? (
                                                    <img src={`http://localhost:8000/${student.photo_path.replace(/\\/g, '/')}`} alt={student.name} className="w-10 h-10 rounded-full object-cover border" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center border">
                                                        <User className="w-5 h-5 text-muted-foreground" />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 font-medium">{student.name}</td>
                                            <td className="px-6 py-4">{student.nim}</td>
                                            <td className="px-6 py-4">{student.kelas ? `Kelas ${student.kelas}` : '-'}</td>
                                            <td className="px-6 py-4 text-muted-foreground">{new Date(student.created_at).toLocaleDateString('id-ID')}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button
                                                        onClick={() => handleViewDataset(student)}
                                                        className="p-2 text-muted-foreground hover:text-blue-600 hover:bg-blue-500/10 rounded-lg transition-colors"
                                                        title="Lihat Dataset Wajah"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleEdit(student)} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors">
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button onClick={() => handleDelete(student.id)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {activeTab === 'add' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Form Area */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="flex flex-col border rounded-2xl bg-card shadow-sm p-6">
                            <h2 className="font-semibold text-lg mb-4">{editingId ? 'Edit Murid' : 'Informasi Murid'}</h2>
                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div className="space-y-2">
                                    <label htmlFor="name" className="text-sm font-medium">Nama Lengkap</label>
                                    <input
                                        id="name"
                                        name="name"
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        placeholder="Masukkan nama lengkap"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label htmlFor="nis" className="text-sm font-medium">NIS (Nomor Induk Siswa)</label>
                                    <input
                                        id="nis"
                                        name="nis"
                                        type="text"
                                        required
                                        value={formData.nis}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                        placeholder="Masukkan NIS"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label htmlFor="class" className="text-sm font-medium">Kelas</label>
                                    <select
                                        id="class"
                                        name="class"
                                        required
                                        value={formData.class}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    >
                                        <option value="" disabled>Pilih Kelas</option>
                                        <option value="10">Kelas 10</option>
                                        <option value="11">Kelas 11</option>
                                        <option value="12">Kelas 12</option>
                                    </select>
                                </div>

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="w-full flex justify-center items-center gap-2 mt-6 px-4 py-2 bg-primary text-primary-foreground font-semibold rounded-md shadow-sm hover:bg-primary/90 transition-all disabled:opacity-70"
                                >
                                    <Save className="w-4 h-4" />
                                    {isSubmitting ? 'Menyimpan...' : 'Simpan Data'}
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Upload & Preview Area */}
                    <div className="lg:col-span-2 space-y-4">
                        {/* Main Photo Upload */}
                        <div className="flex flex-col border rounded-2xl bg-card shadow-sm p-6">
                            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                                <Camera className="w-5 h-5 text-primary" />
                                Foto Utama Murid
                            </h2>
                            {!previewUrl ? (
                                <div
                                    className={`
                                        relative flex flex-col items-center justify-center p-12 mt-2
                                        border-2 border-dashed rounded-2xl transition-all duration-200 ease-in-out min-h-[200px]
                                        ${isDragging
                                            ? 'border-primary bg-primary/5 scale-[1.02]'
                                            : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50'}
                                    `}
                                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                                    onDragLeave={(e) => { e.preventDefault(); setIsDragging(false) }}
                                    onDrop={onFileDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <div className="flex flex-col items-center justify-center space-y-4 text-center cursor-pointer">
                                        <div className="p-4 rounded-full bg-primary/10 text-primary">
                                            <Upload className="w-8 h-8" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-lg font-medium">Click to upload photo or drag and drop</p>
                                            <p className="text-sm text-muted-foreground text-balance">
                                                Clear frontal face image required. SVG, PNG, JPG (max. 5MB)
                                            </p>
                                        </div>
                                    </div>
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        capture="user"
                                        className="hidden"
                                        onChange={onFileInputChange}
                                    />
                                </div>
                            ) : (
                                <div className="relative flex flex-col overflow-hidden border rounded-2xl bg-muted/30">
                                    <div className="flex items-center justify-between p-4 border-b bg-background/50 backdrop-blur-sm z-10">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-primary/10 text-primary rounded-lg">
                                                <ImageIcon className="w-4 h-4" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-xs">{selectedImage ? selectedImage.name : 'Current Photo'}</p>
                                                {selectedImage && (
                                                    <p className="text-xs text-muted-foreground">
                                                        {(selectedImage.size / 1024 / 1024).toFixed(2)} MB
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={clearImage}
                                            className="p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-xl transition-colors"
                                            title="Remove photo"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                    <div className="relative bg-black/5 flex items-center justify-center p-4 h-[200px]">
                                        <img
                                            src={previewUrl}
                                            alt="Preview"
                                            className="h-full w-auto max-h-[200px] rounded-lg object-contain shadow-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Dataset Photo Capture Section — only show after student is saved */}
                        {editingId && (
                            <div className="flex flex-col border rounded-2xl bg-card shadow-sm p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="font-semibold text-lg flex items-center gap-2">
                                        <Video className="w-5 h-5 text-primary" />
                                        Dataset Wajah
                                    </h2>
                                    <span className={`text-sm font-medium px-3 py-1 rounded-full ${capturedPhotos >= 5 ? 'bg-green-500/10 text-green-600' : 'bg-amber-500/10 text-amber-600'
                                        }`}>
                                        {capturedPhotos}/{MAX_PHOTOS} foto
                                    </span>
                                </div>

                                <p className="text-sm text-muted-foreground mb-4">
                                    Ambil 5-10 foto dari berbagai sudut untuk meningkatkan akurasi pengenalan wajah.
                                    Pastikan wajah terlihat jelas di kamera.
                                </p>

                                {/* Camera Preview */}
                                {showCameraCapture && (
                                    <div className="relative mb-4 rounded-xl overflow-hidden border bg-black">
                                        <video
                                            ref={videoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            className="w-full max-h-[300px] object-contain"
                                        />
                                        <div className="absolute bottom-3 left-3 flex items-center gap-2 px-2 py-1 rounded-md bg-black/60 text-white text-xs">
                                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                                            Live Preview
                                        </div>
                                    </div>
                                )}

                                {/* Capture Message */}
                                {captureMessage && (
                                    <div className={`flex items-center gap-2 p-3 mb-4 rounded-lg text-sm ${captureMessage.type === 'success'
                                        ? 'bg-green-500/10 text-green-600 border border-green-500/20'
                                        : 'bg-red-500/10 text-red-600 border border-red-500/20'
                                        }`}>
                                        {captureMessage.type === 'success'
                                            ? <CheckCircle className="w-4 h-4 shrink-0" />
                                            : <AlertCircle className="w-4 h-4 shrink-0" />
                                        }
                                        {captureMessage.text}
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="flex flex-wrap gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowCameraCapture(!showCameraCapture)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${showCameraCapture
                                            ? 'bg-red-500/10 text-red-600 border border-red-500/30 hover:bg-red-500/20'
                                            : 'bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20'
                                            }`}
                                    >
                                        <Video className="w-4 h-4" />
                                        {showCameraCapture ? 'Tutup Kamera' : 'Buka Kamera'}
                                    </button>

                                    {showCameraCapture && (
                                        <button
                                            type="button"
                                            onClick={handleCaptureFromCamera}
                                            disabled={isCapturing || capturedPhotos >= MAX_PHOTOS}
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            <Camera className="w-4 h-4" />
                                            {isCapturing ? 'Capturing...' : 'Capture Foto'}
                                        </button>
                                    )}

                                    <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-all ${capturedPhotos >= MAX_PHOTOS
                                        ? 'bg-muted text-muted-foreground opacity-50 cursor-not-allowed'
                                        : 'bg-blue-500/10 text-blue-600 border border-blue-500/30 hover:bg-blue-500/20'
                                        }`}>
                                        <Upload className="w-4 h-4" />
                                        Upload Foto (Bulk)
                                        <input
                                            type="file"
                                            accept="image/*"
                                            multiple
                                            className="hidden"
                                            onChange={handleUploadDataset}
                                            disabled={capturedPhotos >= MAX_PHOTOS}
                                        />
                                    </label>

                                    {capturedPhotos > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => handleClearDataset(editingId)}
                                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-destructive border border-destructive/30 hover:bg-destructive/10 transition-all"
                                            title="Hapus semua foto dataset untuk retake"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                            Hapus Dataset
                                        </button>
                                    )}
                                </div>

                                {/* Progress indicator */}
                                {capturedPhotos > 0 && (
                                    <div className="mt-4">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                                            <span>Progress Dataset</span>
                                            <span>{capturedPhotos >= 5 ? '✓ Cukup untuk identifikasi' : `Minimal 5 foto diperlukan (${5 - capturedPhotos} lagi)`}</span>
                                        </div>
                                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-300 ${capturedPhotos >= 5 ? 'bg-green-500' : 'bg-amber-500'
                                                    }`}
                                                style={{ width: `${Math.min((capturedPhotos / MAX_PHOTOS) * 100, 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Dataset Photos Modal */}
            {showDatasetModal && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
                    onClick={() => setShowDatasetModal(false)}
                >
                    <div
                        className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden bg-card rounded-2xl shadow-2xl flex flex-col"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-5 border-b">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-blue-500/10 text-blue-600 rounded-lg">
                                    <ImageIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">Dataset Wajah — {datasetStudentName}</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {isLoadingDataset ? 'Memuat...' : `${datasetPhotos.length} foto InsightFace`}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {datasetPhotos.length > 0 && (
                                    <button
                                        onClick={() => handleClearDataset(datasetStudentId)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                                        title="Hapus semua foto dataset"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Hapus Semua
                                    </button>
                                )}
                                <button
                                    onClick={() => setShowDatasetModal(false)}
                                    className="p-2 text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                                    title="Tutup"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>

                        {/* Modal Body — Gallery */}
                        <div className="flex-1 overflow-y-auto p-5">
                            {isLoadingDataset ? (
                                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mb-3" />
                                    <p className="text-sm">Memuat dataset...</p>
                                </div>
                            ) : datasetPhotos.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                                    <div className="p-3 bg-muted rounded-full mb-3">
                                        <ImageOff className="w-6 h-6" />
                                    </div>
                                    <p className="text-sm">Belum ada foto dataset untuk murid ini.</p>
                                    <p className="text-xs mt-1">Tambahkan foto lewat menu Edit → Dataset Wajah.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                    {datasetPhotos.map((photo) => (
                                        <div
                                            key={photo.id}
                                            className="relative group aspect-square rounded-lg overflow-hidden border bg-muted"
                                        >
                                            <img
                                                src={`${API_BASE}${photo.url}`}
                                                alt={`Dataset ${photo.photo_index + 1}`}
                                                className="w-full h-full object-cover transition-transform group-hover:scale-105"
                                                loading="lazy"
                                                onError={(e) => {
                                                    e.target.style.display = 'none'
                                                    e.target.nextSibling.style.display = 'flex'
                                                }}
                                            />
                                            <div
                                                className="absolute inset-0 hidden items-center justify-center text-muted-foreground"
                                            >
                                                <ImageOff className="w-6 h-6" />
                                            </div>
                                            <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-black/60 text-white text-xs font-medium">
                                                Foto {photo.photo_index + 1}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
