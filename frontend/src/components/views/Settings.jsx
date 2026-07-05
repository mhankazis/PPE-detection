import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "../../contexts/AuthContext"
import { useState, useEffect } from "react"
import { Shield, User, Key, Mail, Gauge, CheckCircle, AlertCircle, Loader2, Bell, Volume2, ChevronDown, Play, Download } from "lucide-react"

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

    // Benchmark state
    const [benchDuration, setBenchDuration] = useState(60)
    const [benchJobId, setBenchJobId] = useState(null)
    const [benchStatus, setBenchStatus] = useState("idle") // idle | running | done | error
    const [benchElapsed, setBenchElapsed] = useState(0)
    const [benchResult, setBenchResult] = useState(null)
    const [benchError, setBenchError] = useState("")
    const [benchMsg, setBenchMsg] = useState({ type: "", text: "" })

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
                const res = await fetch('http://localhost:8000/api/ezviz-config', {
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
            const res = await fetch('http://localhost:8000/api/auth/me', {
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
            const res = await fetch('http://localhost:8000/api/auth/request-email-change', {
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
            const res = await fetch('http://localhost:8000/api/auth/confirm-email-change', {
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
            await fetch('http://localhost:8000/api/auth/cancel-email-change', {
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

    // ===== Benchmark handlers =====
    const benchPollRef = { current: null }

    const startBenchmark = async () => {
        setBenchMsg({ type: "", text: "" })
        setBenchError("")
        setBenchResult(null)
        setBenchElapsed(0)

        const token = sessionStorage.getItem('token')
        try {
            const res = await fetch('http://localhost:8000/api/perf/benchmark', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ duration: benchDuration }),
            })
            const data = await res.json()
            if (!res.ok) {
                setBenchMsg({ type: "error", text: data.detail || "Gagal memulai benchmark." })
                return
            }
            setBenchJobId(data.job_id)
            setBenchStatus("running")
            setBenchMsg({ type: "success", text: `Benchmark berjalan (${benchDuration}s)...` })
            // Start polling
            pollBenchmark(data.job_id)
        } catch (err) {
            setBenchMsg({ type: "error", text: "Tidak dapat terhubung ke server." })
        }
    }

    const pollBenchmark = (jobId) => {
        if (benchPollRef.current) clearInterval(benchPollRef.current)
        const token = sessionStorage.getItem('token')
        benchPollRef.current = setInterval(async () => {
            try {
                const res = await fetch(`http://localhost:8000/api/perf/benchmark/${jobId}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                })
                const data = await res.json()
                setBenchElapsed(data.elapsed_sec || 0)
                if (data.status === "done") {
                    clearInterval(benchPollRef.current)
                    benchPollRef.current = null
                    setBenchStatus("done")
                    setBenchResult(data.result)
                    setBenchMsg({ type: "success", text: "Benchmark selesai." })
                } else if (data.status === "error") {
                    clearInterval(benchPollRef.current)
                    benchPollRef.current = null
                    setBenchStatus("error")
                    setBenchError(data.error || "Unknown error")
                    setBenchMsg({ type: "error", text: `Benchmark gagal: ${data.error || "unknown"}` })
                }
            } catch (e) { /* ignore poll errors */ }
        }, 2000)
    }

    const downloadBenchmark = () => {
        if (!benchResult) return
        const blob = new Blob([JSON.stringify(benchResult, null, 2)], { type: "application/json" })
        const url = URL.createObjectURL(blob)
        const a = document.createElement("a")
        a.href = url
        a.download = `benchmark_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`
        a.click()
        URL.revokeObjectURL(url)
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
            const res = await fetch('http://localhost:8000/api/ezviz-config', {
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
            const res = await fetch('http://localhost:8000/api/ezviz-test', {
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

                {/* Accordion: Performance Benchmark */}
                <Card>
                    <CardHeader className="p-4">
                        <AccordionHeader
                            icon={Gauge}
                            title="Performance Benchmark"
                            description="Uji performa real-time: FPS, inference time, latency, resolusi."
                            badge={
                                benchStatus === "running" ? (
                                    <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">Running</Badge>
                                ) : benchStatus === "done" ? (
                                    <Badge variant="default" className="bg-green-500 hover:bg-green-600">Done</Badge>
                                ) : null
                            }
                            section="benchmark"
                        />
                    </CardHeader>
                    {openSection === "benchmark" && (
                        <>
                            <CardContent className="space-y-4 pt-2">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium leading-none">Durasi Test (detik)</label>
                                    <input
                                        type="number"
                                        min={10}
                                        max={300}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                        value={benchDuration}
                                        onChange={(e) => setBenchDuration(Math.max(10, Math.min(300, parseInt(e.target.value) || 60)))}
                                        disabled={benchStatus === "running"}
                                    />
                                    <p className="text-[0.8rem] text-muted-foreground">
                                        Rekomendasi: 60 detik untuk hasil stabil. Pastikan kamera online.
                                    </p>
                                </div>

                                {benchStatus === "running" && (
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2 text-sm">
                                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                                            <span>Running... {benchElapsed.toFixed(1)}s / {benchDuration}s</span>
                                        </div>
                                        <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                                            <div
                                                className="bg-blue-500 h-full transition-all"
                                                style={{ width: `${Math.min(100, (benchElapsed / benchDuration) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}

                                {benchResult && benchStatus === "done" && (
                                    <div className="space-y-3">
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="p-3 rounded-lg bg-muted/50">
                                                <div className="text-[0.7rem] text-muted-foreground uppercase">Avg FPS</div>
                                                <div className="text-xl font-bold text-primary">{benchResult.avg_fps}</div>
                                            </div>
                                            <div className="p-3 rounded-lg bg-muted/50">
                                                <div className="text-[0.7rem] text-muted-foreground uppercase">Resolution</div>
                                                <div className="text-xl font-bold">{benchResult.test_resolution}</div>
                                            </div>
                                            <div className="p-3 rounded-lg bg-muted/50">
                                                <div className="text-[0.7rem] text-muted-foreground uppercase">Inference avg</div>
                                                <div className="text-xl font-bold">{benchResult.inference_time_avg_ms} ms</div>
                                            </div>
                                            <div className="p-3 rounded-lg bg-muted/50">
                                                <div className="text-[0.7rem] text-muted-foreground uppercase">Inference P95</div>
                                                <div className="text-xl font-bold">{benchResult.inference_time_p95_ms} ms</div>
                                            </div>
                                            <div className="p-3 rounded-lg bg-muted/50">
                                                <div className="text-[0.7rem] text-muted-foreground uppercase">Latency avg</div>
                                                <div className="text-xl font-bold">{benchResult.stream_latency_avg_ms} ms</div>
                                            </div>
                                            <div className="p-3 rounded-lg bg-muted/50">
                                                <div className="text-[0.7rem] text-muted-foreground uppercase">Duration</div>
                                                <div className="text-xl font-bold">{benchResult.test_duration_sec}s</div>
                                            </div>
                                        </div>

                                        <div className="p-3 rounded-lg bg-muted/30 text-xs space-y-1">
                                            <div className="font-medium text-sm mb-1">Device Specification</div>
                                            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
                                                <span>OS: {benchResult.device_spec?.os}</span>
                                                <span>CPU: {benchResult.device_spec?.cpu_physical_cores} cores</span>
                                                <span>RAM: {benchResult.device_spec?.ram_total_gb} GB</span>
                                                <span>Freq: {benchResult.device_spec?.cpu_freq_mhz} MHz</span>
                                            </div>
                                        </div>

                                        <div className="text-xs text-muted-foreground">
                                            Frames processed: {benchResult.frames_processed} | Failed: {benchResult.frames_failed} | Data: {benchResult.data_processed_mb} MB
                                        </div>
                                    </div>
                                )}

                                {benchMsg.text && (
                                    <div className={`flex items-center gap-2 text-sm p-3 rounded-md ${benchMsg.type === "success" ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"}`}>
                                        {benchMsg.type === "success" ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                        {benchMsg.text}
                                    </div>
                                )}
                            </CardContent>
                            <CardFooter className="bg-muted/30 pt-4 flex justify-between">
                                <Button
                                    variant="outline"
                                    onClick={downloadBenchmark}
                                    disabled={!benchResult || benchStatus === "running"}
                                >
                                    <Download className="w-4 h-4 mr-2" />
                                    Download JSON
                                </Button>
                                <Button
                                    onClick={startBenchmark}
                                    disabled={benchStatus === "running"}
                                    className="min-w-[160px]"
                                >
                                    {benchStatus === "running" ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Running {benchElapsed.toFixed(0)}s...
                                        </>
                                    ) : (
                                        <>
                                            <Play className="w-4 h-4 mr-2" />
                                            Run Benchmark
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
            </div>
        </div>
    )
}
