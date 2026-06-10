import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "../../contexts/AuthContext"
import { useState, useEffect } from "react"
import { Shield, User, Key, CheckCircle, AlertCircle, Loader2 } from "lucide-react"

export default function Settings() {
    const { user, fetchProfile } = useAuth()

    const [profileData, setProfileData] = useState({
        username: "",
        role: "",
        created_at: "",
    })

    const [passwordData, setPasswordData] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
    })

    const [isSaving, setIsSaving] = useState(false)
    const [message, setMessage] = useState({ type: "", text: "" })

    useEffect(() => {
        if (user) {
            setProfileData({
                username: user.username || "",
                role: user.role || "",
                created_at: user.created_at || "",
            })
        }
    }, [user])

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
            const token = localStorage.getItem('token')
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

    const roleLabel = (role) => {
        if (role === "admin") return "Administrator"
        if (role === "operator") return "Operator"
        return role
    }

    const formatDate = (isoStr) => {
        if (!isoStr) return "-"
        const d = new Date(isoStr)
        return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })
    }

    return (
        <div className="p-8 space-y-8 max-w-4xl mx-auto animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Pengaturan</h1>
                <p className="text-muted-foreground mt-1">Kelola pengaturan akun dan profil Anda.</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                {/* Sidebar - Profile Card */}
                <div className="md:col-span-1 space-y-6">
                    <Card>
                        <CardHeader className="text-center">
                            <div className="mx-auto w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                                <User className="w-12 h-12 text-primary" />
                            </div>
                            <CardTitle>{profileData.username}</CardTitle>
                            <CardDescription>{roleLabel(profileData.role)}</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 text-sm text-muted-foreground border-t pt-4">
                                <Shield className="w-4 h-4 text-primary" />
                                <span>Peran: {roleLabel(profileData.role)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                <Key className="w-4 h-4 text-primary" />
                                <span>Terdaftar: {formatDate(profileData.created_at)}</span>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content */}
                <div className="md:col-span-2 space-y-6">
                    {/* Profile Info Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Informasi Profil</CardTitle>
                            <CardDescription>
                                Detail akun Anda saat ini.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-sm font-medium leading-none">Username</label>
                                <input
                                    className="flex h-10 w-full rounded-md border border-input bg-muted px-3 py-2 text-sm cursor-not-allowed"
                                    value={profileData.username}
                                    readOnly
                                />
                                <p className="text-[0.8rem] text-muted-foreground">Username tidak dapat diubah.</p>
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
                    </Card>

                    {/* Change Password Card */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Ubah Password</CardTitle>
                            <CardDescription>
                                Perbarui password akun Anda untuk keamanan.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
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
                    </Card>
                </div>
            </div>
        </div>
    )
}
