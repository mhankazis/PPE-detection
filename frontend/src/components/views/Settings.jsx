import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { API_BASE } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "../../contexts/AuthContext"
import { useState, useEffect } from "react"
import { Shield, User, Key, Mail, Gauge, CheckCircle, AlertCircle, Loader2, Bell, Volume2, ChevronDown, Play, Download, Camera, Wifi, BrainCircuit, Upload } from "lucide-react"

export default function Settings() {
    const { user, fetchProfile } = useAuth()

    const [profileData, setProfileData] = useState({
        username: "",
        role: "",
        email: "",
        emailMasked: "",
        created_at: "",
    })

    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    })

    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState({ type: "", text: "" })

    // Siren config state (simplified — no EZVIZ credentials)
    const [sirenEnabled, setSirenEnabled] = useState(false)
    const [sirenDuration, setSirenDuration] = useState(5)
    const [isSirenSaving, setIsSirenSaving] = useState(false)
    const [sirenMsg, setSirenMsg] = useState({ type: "", text: "" })

    // Accordion open state
    const [openSection, setOpenSection] = useState("profile") // "profile" | "password" | "email" | "siren"

    // Email change state
    const [emailStep, setEmailStep] = useState("form") // "form" | "otp"
    const [newEmail, setNewEmail] = useState("")
    const [emailOtp, setEmailOtp] = useState("")
    const [emailMasked, setEmailMasked] = useState("")
    const [isEmailSaving, setIsEmailSaving] = useState(false)
    const [emailMsg, setEmailMsg] = useState({ type: "", text: "" })

    // Camera config state
    const [cameraIp, setCameraIp] = useState("")
    const [cameraPort, setCameraPort] = useState(554)
    const [cameraCurrent, setCameraCurrent] = useState(null) // {ip, port, ...} from server
    const [isCameraTesting, setIsCameraTesting] = useState(false)
    const [isCameraSaving, setIsCameraSaving] = useState(false)
    const [cameraMsg, setCameraMsg] = useState({ type: "", text: "" })
    const [cameraTestResult, setCameraTestResult] = useState(null) // {ok, message, resolution, fps}

    // Model upload state
    const [modelInfo, setModelInfo] = useState(null)
    const [modelFile, setModelFile] = useState(null)
    const [isModelUploading, setIsModelUploading] = useState(false)
    const [modelMsg, setModelMsg] = useState({ type: "", text: "" })
    const [modelUploadProgress, setModelUploadProgress] = useState(0)

    useEffect(() => {
        if (user) {
            setProfileData({
                username: user.username || "",
                role: user.role || "",
                email: user.email || "",
                emailMasked: user.email_masked || "",
                created_at: user.created_at || "",
            })
        }
    }, [user])

    // Fetch siren config (only enabled + duration now)
    useEffect(() => {
        const fetchSirenConfig = async () => {
            try {
                const token = sessionStorage.getItem('token')
                const res = await fetch(API_BASE + '/api/ezviz-config', {
                    headers: { 'Authorization': `Bearer ${token}` }
                })
                if (res.ok) {
                    const data = await res.json()
                    setSirenEnabled(data.enabled || false)
                    setSirenDuration(data.siren_duration || 5)
                }
            } catch (e) {
                console.error("Failed to fetch siren config", e)
            }
        }
        fetchSirenConfig()
    }, [])

    // Fetch camera config on mount
    useEffect(() => {
        const fetchCameraConfig = async () => {
            try {
                const token = sessionStorage.getItem('token')
                const res = await fetch(API_BASE + '/api/camera/config', {
                    headers: { 'Authorization': `Bearer ${token}` },
                })
                if (res.ok) {
                    const data = await res.json()
                    setCameraCurrent(data)
                    setCameraIp(data.ip || "")
                    setCameraPort(data.port || 554)
                }
            } catch (e) {
                console.error("Failed to fetch camera config", e)
            }
        }
        fetchCameraConfig()
    }, [])

    useEffect(() => {
        const fetchModelInfo = async () => {
            try {
                const token = sessionStorage.getItem('token')
                const res = await fetch(API_BASE + '/api/model/info', {
                    headers: { 'Authorization': `Bearer ${token}` },
                })
                if (res.ok) setModelInfo(await res.json())
            } catch (e) { /* ignore */ }
        }
        fetchModelInfo()
    }, [])

    const handleTestCamera = async () => {
        setCameraMsg({ type: "", text: "" })
        setCameraTestResult(null)

        // Basic IP format validation
        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
        if (!ipRegex.test(cameraIp.trim())) {
            setCameraMsg({ type: "error", text: "Format IP tidak valid. Contoh: 192.168.1.100" })
            return
        }
        const octets = cameraIp.trim().split(".").map(Number)
        if (octets.some(o => o < 0 || o > 255)) {
            setCameraMsg({ type: "error", text: "Octet IP harus antara 0-255." })
            return
        }
        setIsCameraTesting(true)
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(API_BASE + '/api/camera/test', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ip: cameraIp.trim(), port: parseInt(cameraPort) }),
            })
            const data = await res.json()
            setCameraTestResult(data)
            if (data.ok) {
                setCameraMsg({ type: "success", text: data.message })
            } else {
                setCameraMsg({ type: "error", text: data.message || "Koneksi gagal." })
            }
        } catch (err) {
            setCameraMsg({ type: "error", text: "Terjadi kesalahan jaringan." })
        } finally {
            setIsCameraTesting(false)
        }
    }

    const handleSaveCamera = async () => {
        setCameraMsg({ type: "", text: "" })

        const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
        if (!ipRegex.test(cameraIp.trim())) {
            setCameraMsg({ type: "error", text: "Format IP tidak valid. Contoh: 192.168.1.100" })
            return
        }
        setIsCameraSaving(true)
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(API_BASE + '/api/camera/config', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ip: cameraIp.trim(), port: parseInt(cameraPort) }),
            })
            const data = await res.json()
            if (res.ok) {
                setCameraCurrent(data.config)
                setCameraMsg({ type: "success", text: data.message || "IP kamera berhasil disimpan." })
            } else {
                setCameraMsg({ type: "error", text: data.detail || "Gagal menyimpan IP kamera." })
            }
        } catch (err) {
            setCameraMsg({ type: "error", text: "Terjadi kesalahan jaringan." })
        } finally {
            setIsCameraSaving(false)
        }
    }

    const handlePasswordChange = (e) => {
        const { name, value } = e.target
        setPasswordData(prev => ({ ...prev, [name]: value }))
    }

    const handleSavePassword = async () => {
        setMessage({ type: "", text: "" })

        if (!passwordData.currentPassword) {
            setMessage({ type: "error", text: "Password lama wajib diisi." })
            return
        }
        if (!passwordData.newPassword) {
            setMessage({ type: "error", text: "Password baru tidak boleh kosong." })
            return
        }
        if (passwordData.newPassword.length < 6) {
            setMessage({ type: "error", text: "Password baru minimal 6 karakter." })
            return
        }
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            setMessage({ type: "error", text: "Konfirmasi password tidak cocok." })
            return
        }

        setIsSaving(true)
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(API_BASE + '/api/auth/me', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ old_password: passwordData.currentPassword, new_password: passwordData.newPassword }),
            })

            if (res.ok) {
                setMessage({ type: "success", text: "Password berhasil diperbarui." })
                setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" })
            } else {
                const err = await res.json()
                setMessage({ type: "error", text: err.detail || "Gagal memperbarui password." })
            }
        } catch (err) {
            setMessage({ type: "error", text: "Terjadi kesalahan jaringan." })
        } finally {
            setIsSaving(false)
        }
    }

    const handleRequestEmailChange = async () => {
        setEmailMsg({ type: "", text: "" })
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(newEmail)) {
            setEmailMsg({ type: "error", text: "Format email tidak valid." })
            return
        }
        if (profileData.email && newEmail.toLowerCase() === profileData.email.toLowerCase()) {
            setEmailMsg({ type: "error", text: "Email baru sama dengan email saat ini." })
            return
        }

        setIsEmailSaving(true)
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(API_BASE + '/api/auth/request-email-change', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ new_email: newEmail }),
            })
            const data = await res.json()
            if (res.ok) {
                setEmailStep("otp")
                setEmailMasked(data.email_masked || "")
                setEmailMsg({ type: "success", text: data.message || "Kode OTP telah dikirim ke email baru." })
            } else {
                setEmailMsg({ type: "error", text: data.detail || "Gagal mengirim OTP." })
            }
        } catch (err) {
            setEmailMsg({ type: "error", text: "Terjadi kesalahan jaringan." })
        } finally {
            setIsEmailSaving(false)
        }
    }

    const handleConfirmEmailChange = async () => {
        setEmailMsg({ type: "", text: "" })
        if (!emailOtp.trim()) {
            setEmailMsg({ type: "error", text: "Kode OTP wajib diisi." })
            return
        }

        setIsEmailSaving(true)
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(API_BASE + '/api/auth/confirm-email-change', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ otp_code: emailOtp.trim() }),
            })
            const data = await res.json()
            if (res.ok) {
                setProfileData(prev => ({
                    ...prev,
                    email: data.email || newEmail,
                    emailMasked: data.email_masked || "",
                }))
                setEmailStep("form")
                setNewEmail("")
                setEmailOtp("")
                setEmailMasked("")
                setEmailMsg({ type: "success", text: data.message || "Email berhasil diperbarui." })
                // Refresh user context so email updates across app
                if (fetchProfile) {
                    try { await fetchProfile(); } catch (e) { /* ignore */ }
                }
            } else {
                setEmailMsg({ type: "error", text: data.detail || "Gagal verifikasi OTP." })
            }
        } catch (err) {
            setEmailMsg({ type: "error", text: "Terjadi kesalahan jaringan." })
        } finally {
            setIsEmailSaving(false)
        }
    }

    const handleCancelEmailChange = async () => {
        const token = sessionStorage.getItem('token')
        try {
            await fetch(API_BASE + '/api/auth/cancel-email-change', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            })
        } catch (e) { /* ignore */ }
        setEmailStep("form")
        setNewEmail("")
        setEmailOtp("")
        setEmailMasked("")
        setEmailMsg({ type: "", text: "" })
    }

    const [convertOnnx, setConvertOnnx] = useState(true) // default: auto-export ONNX

    const handleModelUpload = async () => {
        if (!modelFile) return
        setIsModelUploading(true)
        setModelMsg({ type: "", text: "" })
        setModelUploadProgress(0)
        try {
            const token = sessionStorage.getItem('token')
            const formData = new FormData()
            formData.append('file', modelFile)

            const url = `${API_BASE}/api/model/upload?convert_onnx=${convertOnnx ? 'true' : 'false'}`
            const res = await new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest()
                xhr.open('POST', url)
                xhr.setRequestHeader('Authorization', `Bearer ${token}`)
                xhr.upload.onprogress = (e) => {
                    if (e.lengthComputable) {
                        setModelUploadProgress(Math.round((e.loaded / e.total) * 100))
                    }
                }
                xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, json: () => Promise.resolve(JSON.parse(xhr.responseText)) })
                xhr.onerror = () => reject(new Error('Network error'))
                xhr.send(formData)
            })

            if (!res.ok) {
                const err = await res.json().catch(() => ({}))
                throw new Error(err.detail || `Upload gagal (${res.status})`)
            }
            const data = await res.json()
            let msg = data.message || "Model berhasil diperbarui"
            if (data.onnx_export?.attempted) {
                msg += data.onnx_export.success
                    ? ` • ONNX: ${data.onnx_export.message}`
                    : ` • ONNX gagal: ${data.onnx_export.message}`
            }
            if (data.active_backend) msg += ` • Backend aktif: ${data.active_backend.toUpperCase()}`
            setModelMsg({ type: "success", text: msg })
            setModelFile(null)
            // Refresh model info
            try {
                const infoRes = await fetch(API_BASE + '/api/model/info', {
                    headers: { 'Authorization': `Bearer ${token}` },
                })
                if (infoRes.ok) setModelInfo(await infoRes.json())
            } catch (e) { /* ignore */ }
        } catch (e) {
            setModelMsg({ type: "error", text: e.message || 'Gagal upload model' })
        } finally {
            setIsModelUploading(false)
            setModelUploadProgress(0)
        }
    }

    const handleConvertOnnx = async () => {
        setIsModelUploading(true)
        setModelMsg({ type: "", text: "" })
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(API_BASE + '/api/model/convert-onnx', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Convert gagal (${res.status})`)
            setModelMsg({ type: "success", text: `${data.message} • Reload: ${data.reloaded ? 'OK' : 'gagal'}` })
            try {
                const infoRes = await fetch(API_BASE + '/api/model/info', {
                    headers: { 'Authorization': `Bearer ${token}` },
                })
                if (infoRes.ok) setModelInfo(await infoRes.json())
            } catch (e) { /* ignore */ }
        } catch (e) {
            setModelMsg({ type: "error", text: e.message || 'Gagal convert ONNX' })
        } finally {
            setIsModelUploading(false)
        }
    }

    const handleModelReload = async () => {
        setIsModelUploading(true)
        setModelMsg({ type: "", text: "" })
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(API_BASE + '/api/model/reload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            })
            const data = await res.json().catch(() => ({}))
            if (!res.ok) throw new Error(data.detail || `Reload gagal (${res.status})`)
            setModelMsg({ type: data.reloaded ? "success" : "error", text: data.reloaded ? "Model berhasil di-reload" : "Reload gagal — restart server" })
        } catch (e) {
            setModelMsg({ type: "error", text: e.message || 'Gagal reload model' })
        } finally {
            setIsModelUploading(false)
        }
    }

    const roleLabel = (role) => {
        if (role === "admin") return "Administrator"
        if (role === "operator") return "Operator"
        return role
    }

    const handleSaveSiren = async () => {
        setSirenMsg({ type: "", text: "" })
        setIsSirenSaving(true)
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(API_BASE + '/api/ezviz-config', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    enabled: sirenEnabled,
                    siren_duration: sirenDuration,
                }),
            })
            if (res.ok) {
                setSirenMsg({ type: "success", text: "Pengaturan siren berhasil disimpan." })
            } else {
                const err = await res.json()
                setSirenMsg({ type: "error", text: err.detail || "Gagal menyimpan pengaturan." })
            }
        } catch (err) {
            setSirenMsg({ type: "error", text: "Terjadi kesalahan jaringan." })
        } finally {
            setIsSirenSaving(false)
        }
    }

    const playTestSiren = () => {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)()
            if (ctx.state === "suspended") ctx.resume()
            const osc = ctx.createOscillator()
            const gain = ctx.createGain()
            const lfo = ctx.createOscillator()
            const lfoGain = ctx.createGain()
            osc.type = "sawtooth"
            osc.frequency.value = 600
            gain.gain.value = 0.3
            lfo.frequency.value = 4
            lfoGain.gain.value = 300
            lfo.connect(lfoGain)
            lfoGain.connect(osc.frequency)
            osc.connect(gain)
            gain.connect(ctx.destination)
            osc.start()
            lfo.start()
            setTimeout(() => { osc.stop(); lfo.stop(); ctx.close() }, 3000)
        } catch (e) {
            console.error("Test siren error:", e)
        }
    }

    const handleTestSiren = async () => {
        setSirenMsg({ type: "", text: "" })
        playTestSiren()
        try {
            const token = sessionStorage.getItem('token')
            const res = await fetch(API_BASE + '/api/ezviz-test', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
            })
            if (res.ok) {
                setSirenMsg({ type: "success", text: "Alarm test berbunyi di browser." })
            } else {
                const err = await res.json()
                setSirenMsg({ type: "error", text: err.detail || "Gagal mengirim test alarm." })
            }
        } catch (err) {
            setSirenMsg({ type: "error", text: "Terjadi kesalahan jaringan." })
        }
    }

    const formatDate = (isoStr) => {
        if (!isoStr) return "-"
        const d = new Date(isoStr)
        return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    }

    const toggleSection = (section) => {
        setOpenSection(openSection === section ? "" : section)
    }

    const AccordionHeader = ({ icon: Icon, title, description, badge, section }) => (
        <button
            onClick={() => toggleSection(section)}
            className="w-full flex items-center justify-between text-left transition-colors hover:bg-muted/40"
        >
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <CardTitle className="text-base">{title}</CardTitle>
                    <CardDescription className="text-xs">{description}</CardDescription>
                </div>
            </div>
            <div className="flex items-center gap-3">
                {badge}
                <ChevronDown className={`w-5 h-5 text-muted-foreground transition-transform ${openSection === section ? "rotate-180" : ""}`} />
            </div>
        </button>
    )

    return (
        <div className="p-8 space-y-8 max-w-4xl mx-auto animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Pengaturan</h1>
                <p className="text-muted-foreground mt-1">Kelola pengaturan akun dan profil Anda.</p>
            </div>

            <div className="space-y-4">
                {/* Profile Card — Sidebar style compact */}
                <Card className="md:col-span-1">
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-3">
                            <User className="w-10 h-10 text-primary" />
                        </div>
                        <CardTitle>{profileData.username}</CardTitle>
                        <CardDescription>{roleLabel(profileData.role)}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-2">
                        <div className="flex items-center gap-3 text-sm text-muted-foreground border-t pt-3">
                            <Shield className="w-4 h-4 text-primary" />
                            <span>Peran: {roleLabel(profileData.role)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <Key className="w-4 h-4 text-primary" />
                            <span>Terdaftar: {formatDate(profileData.created_at)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Mail className="w-4 h-4 text-primary" />
                            <span>Email: {profileData.emailMasked || profileData.email || "-"}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Accordion: Informasi Profil */}
                <Card>
                    <CardHeader className="p-4">
                        <AccordionHeader
                            icon={User}
                            title="Informasi Profil"
                            description="Detail akun Anda saat ini."
                            section="profile"
                        />
                    </CardHeader>
                    {openSection === "profile" && (
                        <CardContent className="space-y-6 pt-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">Username</label>
                                <input
                                    className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm cursor-not-allowed"
                                    value={profileData.username}
                                    readOnly
                                />
                                <p className="text-[0.8rem] text-muted-foreground">Username tidak dapat diubah.</p>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">Email</label>
                                <input
                                    className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm cursor-not-allowed"
                                    value={profileData.emailMasked || profileData.email || "-"}
                                    readOnly
                                />
                                <p className="text-[0.8rem] text-muted-foreground">Ubah email lewat menu "Ubah Email" di bawah.</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none">Peran</label>
                                    <input
                                        className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm cursor-not-allowed"
                                        value={roleLabel(profileData.role)}
                                        readOnly
                                    />
                                    <p className="text-[0.8rem] text-muted-foreground">Peran dikelola oleh administrator.</p>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none">Terdaftar Sejak</label>
                                    <input
                                        className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm cursor-not-allowed"
                                        value={formatDate(profileData.created_at)}
                                        readOnly
                                    />
                                </div>
                            </div>
                        </CardContent>
                    )}
                </Card>

                {/* Accordion: Ubah Password */}
                <Card>
                    <CardHeader className="p-4">
                        <AccordionHeader
                            icon={Key}
                            title="Ubah Password"
                            description="Perbarui password akun Anda untuk keamanan."
                            section="password"
                        />
                    </CardHeader>
                    {openSection === "password" && (
                        <>
                            <CardContent className="space-y-4 pt-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none" htmlFor="currentPassword">Password Lama</label>
                                    <input
                                        id="currentPassword"
                                        name="currentPassword"
                                        type="password"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        placeholder="Masukkan password lama"
                                        value={passwordData.currentPassword}
                                        onChange={handlePasswordChange}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none" htmlFor="newPassword">Password Baru</label>
                                    <input
                                        id="newPassword"
                                        name="newPassword"
                                        type="password"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        placeholder="Masukkan password baru"
                                        value={passwordData.newPassword}
                                        onChange={handlePasswordChange}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none" htmlFor="confirmPassword">Konfirmasi Password</label>
                                    <input
                                        id="confirmPassword"
                                        name="confirmPassword"
                                        type="password"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        placeholder="Ulangi password baru"
                                        value={passwordData.confirmPassword}
                                        onChange={handlePasswordChange}
                                    />
                                </div>

                                {message.text && (
                                    <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${message.type === "success" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                                        {message.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                        {message.text}
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="bg-muted/30 pt-4 flex justify-end">
                                <Button onClick={handleSavePassword} disabled={isSaving} className="min-w-[140px]">
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Menyimpan...
                                        </>
                                    ) : "Simpan Password"}
                                </Button>
                            </CardFooter>
                        </>
                    )}
                </Card>

                {/* Accordion: Ubah Email */}
                <Card>
                    <CardHeader className="p-4">
                        <AccordionHeader
                            icon={Mail}
                            title="Ubah Email"
                            description="Verifikasi email baru dengan kode OTP."
                            section="email"
                        />
                    </CardHeader>
                    {openSection === "email" && (
                        <>
                            <CardContent className="space-y-4 pt-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none">Email Saat Ini</label>
                                    <input
                                        className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm cursor-not-allowed"
                                        value={profileData.emailMasked || profileData.email || "-"}
                                        readOnly
                                    />
                                </div>

                                {emailStep === "form" ? (
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium leading-none" htmlFor="newEmail">Email Baru</label>
                                        <input
                                            id="newEmail"
                                            type="email"
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            placeholder="masukkan email baru"
                                            value={newEmail}
                                            onChange={(e) => setNewEmail(e.target.value)}
                                        />
                                        <p className="text-[0.8rem] text-muted-foreground">Kode OTP akan dikirim ke email baru untuk verifikasi.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="p-3 rounded-md bg-primary/10 text-sm">
                                            Kode OTP telah dikirim ke <span className="font-medium">{emailMasked}</span>.
                                        </div>
                                        <label className="text-sm font-medium leading-none" htmlFor="emailOtp">Kode OTP</label>
                                        <input
                                            id="emailOtp"
                                            type="text"
                                            inputMode="numeric"
                                            maxLength={6}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm tracking-widest ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            placeholder="6 digit kode"
                                            value={emailOtp}
                                            onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ""))}
                                        />
                                    </div>
                                )}

                                {emailMsg.text && (
                                    <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${emailMsg.type === "success" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                                        {emailMsg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                        {emailMsg.text}
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="bg-muted/30 pt-4 flex justify-between">
                                {emailStep === "otp" ? (
                                    <>
                                        <Button variant="outline" onClick={handleCancelEmailChange} disabled={isEmailSaving}>
                                            Batal
                                        </Button>
                                        <Button onClick={handleConfirmEmailChange} disabled={isEmailSaving} className="min-w-[140px]">
                                            {isEmailSaving ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    Verifikasi...
                                                </>
                                            ) : "Verifikasi OTP"}
                                        </Button>
                                    </>
                                ) : (
                                    <>
                                        <span />
                                        <Button onClick={handleRequestEmailChange} disabled={isEmailSaving} className="min-w-[140px]">
                                            {isEmailSaving ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                                    Mengirim...
                                                </>
                                            ) : "Kirim OTP"}
                                        </Button>
                                    </>
                                )}
                            </CardFooter>
                        </>
                    )}
                </Card>


                {/* Accordion: Konfigurasi Kamera (IP RTSP) */}
                <Card>
                    <CardHeader className="p-4">
                        <AccordionHeader
                            icon={Camera}
                            title="Konfigurasi Kamera"
                            description="Ubah IP kamera CCTV jika IP berubah (DHCP/restart router)."
                            badge={
                                cameraCurrent ? (
                                    <Badge variant="secondary" className="font-mono">
                                        <Wifi className="w-3 h-3 mr-1" />
                                        {cameraCurrent.ip}:{cameraCurrent.port}
                                    </Badge>
                                ) : null
                            }
                            section="camera"
                        />
                    </CardHeader>
                    {openSection === "camera" && (
                        <>
                            <CardContent className="space-y-4 pt-2">
                                <div className="p-3 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-300 text-sm space-y-1">
                                    <div className="font-medium flex items-center gap-2">
                                        <Camera className="w-4 h-4" />
                                        Cara cek IP kamera di aplikasi EZVIZ
                                    </div>
                                    <ol className="list-decimal list-inside text-[0.8rem] space-y-0.5 ml-2">
                                        <li>Buka aplikasi EZVIZ di HP</li>
                                        <li>Pilih kamera → tap ikon ⚙️ (Settings) di pojok kanan atas</li>
                                        <li>Menu <span className="font-mono">Network</span> → <span className="font-mono">IP Address</span></li>
                                        <li>Catat IP (contoh: 192.168.137.202) lalu input ke field di bawah</li>
                                    </ol>
                                </div>

                                {cameraCurrent && (
                                    <div className="p-3 rounded-md bg-muted/50 text-sm">
                                        <div className="text-[0.7rem] text-muted-foreground uppercase mb-1">IP Saat Ini (tersimpan)</div>
                                        <div className="font-mono font-medium text-base">{cameraCurrent.ip}</div>
                                        <div className="text-[0.75rem] text-muted-foreground mt-1">
                                            Port: {cameraCurrent.port} (standar RTSP) • Username: {cameraCurrent.username}
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none" htmlFor="cameraIp">IP Kamera Baru</label>
                                    <input
                                        id="cameraIp"
                                        type="text"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        placeholder="192.168.1.100"
                                        value={cameraIp}
                                        onChange={(e) => setCameraIp(e.target.value)}
                                    />
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        Port standar RTSP (554) otomatis. Klik <span className="font-medium">Test Koneksi</span> dulu untuk memastikan IP benar sebelum menyimpan.
                                    </p>
                                </div>
                                <p className="text-[0.8rem] text-muted-foreground">
                                    Klik <span className="font-medium">Test Koneksi</span> dulu untuk memastikan IP benar sebelum menyimpan.
                                </p>

                                {cameraTestResult && (
                                    <div className={`p-3 rounded-md text-sm ${cameraTestResult.ok ? "bg-green-500/10 text-green-700 dark:text-green-300" : "bg-destructive/10 text-destructive"}`}>
                                        <div className="flex items-center gap-2 font-medium">
                                            {cameraTestResult.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                            {cameraTestResult.message}
                                        </div>
                                        {cameraTestResult.ok && cameraTestResult.resolution && (
                                            <div className="text-[0.75rem] mt-1 ml-6">
                                                Resolusi: {cameraTestResult.resolution[0]}×{cameraTestResult.resolution[1]}
                                                {cameraTestResult.fps ? ` @ ${cameraTestResult.fps.toFixed(1)} FPS` : ""}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {cameraMsg.text && (
                                    <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${cameraMsg.type === "success" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                                        {cameraMsg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                        {cameraMsg.text}
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="bg-muted/30 pt-4 flex justify-between">
                                <Button
                                    variant="outline"
                                    onClick={handleTestCamera}
                                    disabled={isCameraTesting || isCameraSaving}
                                >
                                    {isCameraTesting ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Menguji...
                                        </>
                                    ) : (
                                        <>
                                            <Wifi className="w-4 h-4 mr-2" />
                                            Test Koneksi
                                        </>
                                    )}
                                </Button>
                                <Button
                                    onClick={handleSaveCamera}
                                    disabled={isCameraTesting || isCameraSaving}
                                    className="min-w-[160px]"
                                >
                                    {isCameraSaving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                            Menyimpan...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle className="w-4 h-4 mr-2" />
                                            Simpan & Restart Stream
                                        </>
                                    )}
                                </Button>
                            </CardFooter>
                        </>
                    )}
                </Card>

                {/* Accordion: Siren / Alarm */}
                <Card>
                    <CardHeader className="p-4">
                        <AccordionHeader
                            icon={Bell}
                            title="Siren & Alarm"
                            description="Pengaturan siren otomatis saat pelanggaran terdeteksi."
                            badge={
                                <Badge variant={sirenEnabled ? "default" : "secondary"} className={sirenEnabled ? "bg-green-500 hover:bg-green-600" : ""}>
                                    {sirenEnabled ? "Aktif" : "Nonaktif"}
                                </Badge>
                            }
                            section="siren"
                        />
                    </CardHeader>
                    {openSection === "siren" && (
                        <>
                            <CardContent className="space-y-4 pt-2">
                                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                                    <div className="flex items-center gap-2">
                                        <Volume2 className="w-4 h-4 text-muted-foreground" />
                                        <div>
                                            <span className="text-sm font-medium block">Aktifkan Siren</span>
                                            <span className="text-[0.8rem] text-muted-foreground">Bunyikan siren otomatis saat ada pelanggaran PPE.</span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setSirenEnabled(prev => !prev)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${sirenEnabled ? 'bg-primary' : 'bg-muted'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${sirenEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none">Durasi Siren (detik)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        max={30}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        value={sirenDuration}
                                        onChange={(e) => setSirenDuration(parseInt(e.target.value) || 5)}
                                    />
                                </div>

                                {sirenMsg.text && (
                                    <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${sirenMsg.type === "success" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                                        {sirenMsg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                        {sirenMsg.text}
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="bg-muted/30 pt-4 flex justify-between">
                                <Button variant="outline" onClick={handleTestSiren} disabled={isSirenSaving}>
                                    <Volume2 className="w-4 h-4 mr-2" />
                                    Test Alarm
                                </Button>
                                <Button onClick={handleSaveSiren} disabled={isSirenSaving} className="min-w-[140px]">
                                    {isSirenSaving ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Menyimpan...
                                        </>
                                    ) : "Simpan"}
                                </Button>
                            </CardFooter>
                        </>
                    )}
                </Card>

                {/* Update Model YOLO */}
                <Card className="overflow-hidden">
                    <CardHeader className="p-4">
                        <AccordionHeader
                            icon={BrainCircuit}
                            title="Update Model YOLO (best.pt)"
                            description="Upload file best.pt hasil training baru untuk mengganti model deteksi."
                            badge={modelInfo?.backend ? `${modelInfo.backend.toUpperCase()} • ${modelInfo.size_mb ?? '?'}MB` : null}
                            section="model"
                        />
                    </CardHeader>
                    {openSection === "model" && (
                        <>
                            <CardContent className="p-4 space-y-4">
                                {/* Current model info */}
                                {modelInfo && (
                                    <div className="rounded-lg border bg-muted/30 p-3 space-y-1 text-sm">
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Backend aktif:</span>
                                            <span className="font-medium">{modelInfo.backend?.toUpperCase()}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-muted-foreground">Ukuran file:</span>
                                            <span className="font-medium">{modelInfo.size_mb ?? '?'} MB</span>
                                        </div>
                                        {modelInfo.modified_at && (
                                            <div className="flex justify-between">
                                                <span className="text-muted-foreground">Terakhir diubah:</span>
                                                <span className="font-medium">{modelInfo.modified_at}</span>
                                            </div>
                                        )}
                                        <div className="flex justify-between gap-2">
                                            <span className="text-muted-foreground shrink-0">Path:</span>
                                            <span className="font-mono text-xs text-right break-all">{modelInfo.active_path}</span>
                                        </div>
                                    </div>
                                )}

                                {/* File picker */}
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Pilih file .pt</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="file"
                                            accept=".pt"
                                            onChange={(e) => {
                                                const f = e.target.files?.[0]
                                                setModelFile(f || null)
                                                setModelMsg({ type: "", text: "" })
                                            }}
                                            className="block w-full text-sm text-muted-foreground file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 cursor-pointer"
                                        />
                                    </div>
                                    {modelFile && (
                                        <p className="text-xs text-muted-foreground">
                                            Dipilih: <span className="font-medium text-foreground">{modelFile.name}</span> ({(modelFile.size / 1024 / 1024).toFixed(2)} MB)
                                        </p>
                                    )}
                                </div>

                                {/* Progress bar */}
                                {isModelUploading && modelUploadProgress > 0 && (
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-muted-foreground">Mengupload...</span>
                                            <span className="font-medium">{modelUploadProgress}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary transition-all"
                                                style={{ width: `${modelUploadProgress}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {/* Status message */}
                                {modelMsg.text && (
                                    <div className={`flex items-start gap-2 p-3 rounded-lg text-sm ${modelMsg.type === "success" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
                                        {modelMsg.type === "success" ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                                        <span>{modelMsg.text}</span>
                                    </div>
                                )}

                                {/* Convert to ONNX checkbox */}
                                <label className="flex items-start gap-2 p-3 rounded-lg border bg-primary/5 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={convertOnnx}
                                        onChange={(e) => setConvertOnnx(e.target.checked)}
                                        className="mt-0.5 w-4 h-4 rounded border-input accent-primary"
                                    />
                                    <div className="flex-1">
                                        <span className="text-sm font-medium">Convert ke ONNX setelah upload</span>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Otomatis export <code className="font-mono">.pt</code> → <code className="font-mono">.onnx</code>.
                                            ONNX lebih cepat (~2-3x) untuk inferensi CPU. Default: aktif.
                                        </p>
                                    </div>
                                </label>

                                {/* Warning */}
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 text-xs">
                                    <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                                    <div>
                                        <p className="font-medium mb-1">Catatan:</p>
                                        <ul className="list-disc list-inside space-y-0.5">
                                            <li>Model lama di-backup ke <code className="font-mono">best.pt.bak</code></li>
                                            <li>Override ONNX (jika ada) akan dihapus, lalu di-export ulang dari .pt baru</li>
                                            <li>Detect stream akan reload otomatis (live feed tetap jalan)</li>
                                            <li>Pastikan kelas output model baru sama (Person, Helmet, dll)</li>
                                            <li>Convert ONNX butuh ~30-60 detik tergantung ukuran model</li>
                                        </ul>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="p-4 pt-0 flex items-center gap-2 flex-wrap">
                                <Button
                                    onClick={handleModelUpload}
                                    disabled={!modelFile || isModelUploading}
                                    className="gap-2"
                                >
                                    {isModelUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                                    {isModelUploading ? "Mengupload..." : "Upload & Reload"}
                                </Button>
                                <Button
                                    onClick={handleModelReload}
                                    disabled={isModelUploading}
                                    variant="outline"
                                    className="gap-2"
                                >
                                    <BrainCircuit className="w-4 h-4" />
                                    Reload dari Disk
                                </Button>
                                <Button
                                    onClick={handleConvertOnnx}
                                    disabled={isModelUploading}
                                    variant="outline"
                                    className="gap-2"
                                >
                                    {isModelUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                                    Convert .pt → .onnx
                                </Button>
                            </CardFooter>
                        </>
                    )}
                </Card>
            </div>
        </div>
    )
}
