import { useState, useRef, useEffect } from "react"
import { Users, Upload, Image as ImageIcon, X, Save, Camera, Plus, List as ListIcon, Trash2, User, Pencil } from "lucide-react"

export default function Students() {
    const [activeTab, setActiveTab] = useState('list') // 'list' | 'add'
    const [students, setStudents] = useState([])
    const [isLoading, setIsLoading] = useState(false)

    // Form states
    const [editingId, setEditingId] = useState(null)
    const [selectedImage, setSelectedImage] = useState(null)
    const [previewUrl, setPreviewUrl] = useState(null)
    const [isDragging, setIsDragging] = useState(false)
    const [formData, setFormData] = useState({ name: '', nis: '', class: '' })
    const [isSubmitting, setIsSubmitting] = useState(false)
    const fileInputRef = useRef(null)

    const fetchStudents = async () => {
        setIsLoading(true)
        try {
            const token = localStorage.getItem('token')
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
    }

    const handleEdit = (student) => {
        setEditingId(student.id)
        setFormData({ name: student.name, nis: student.nim, class: '10' }) // Assume class 10 for now if not in DB
        if (student.photo_path) {
            setPreviewUrl(`http://localhost:8000/${student.photo_path.replace(/\\/g, '/')}`)
        } else {
            setPreviewUrl(null)
        }
        setSelectedImage(null)
        setActiveTab('add')
    }

    const handleDelete = async (id) => {
        if (!window.confirm("Are you sure you want to delete this student?")) return;
        
        try {
            const token = localStorage.getItem('token')
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

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)
        
        try {
            const token = localStorage.getItem('token')
            const submitData = new FormData()
            submitData.append('name', formData.name)
            submitData.append('nis', formData.nis)
            submitData.append('kelas', formData.class)
            if (selectedImage) {
                submitData.append('file', selectedImage)
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
                        onClick={() => setActiveTab('add')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === 'add' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                    >
                        <Plus className="w-4 h-4" />
                        {editingId ? 'Edit Murid' : 'Tambah Baru'}
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
                                    <th className="px-6 py-4 font-medium">Waktu Daftar</th>
                                    <th className="px-6 py-4 font-medium text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {isLoading ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-8 text-center text-muted-foreground">Memuat data...</td>
                                    </tr>
                                ) : students.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-12 text-center">
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
                                            <td className="px-6 py-4 text-muted-foreground">{new Date(student.created_at).toLocaleDateString('id-ID')}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
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
                        <div className="flex flex-col border rounded-2xl bg-card shadow-sm p-6 h-full">
                            <h2 className="font-semibold text-lg mb-4 flex items-center gap-2">
                                <Camera className="w-5 h-5 text-primary" />
                                Foto Murid
                            </h2>
                            {!previewUrl ? (
                                <div
                                    className={`
                                        flex-1 relative flex flex-col items-center justify-center p-12 mt-2
                                        border-2 border-dashed rounded-2xl transition-all duration-200 ease-in-out min-h-[300px]
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
                                <div className="relative flex-1 flex flex-col overflow-hidden border rounded-2xl bg-muted/30">
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
                                    <div className="relative aspect-video bg-black/5 flex items-center justify-center p-4 flex-1 h-[300px]">
                                        <img
                                            src={previewUrl}
                                            alt="Preview"
                                            className="h-full w-auto max-h-[400px] rounded-lg object-contain shadow-sm"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
