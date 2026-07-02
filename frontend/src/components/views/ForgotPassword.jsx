import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldAlert, Mail, KeyRound, ArrowLeft, CheckCircle2, Loader2 } from 'lucide-react';
import { ModeToggle } from '../mode-toggle';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

export default function ForgotPassword() {
    const navigate = useNavigate();

    // Step 1: request OTP, Step 2: input OTP + new password, Step 3: success
    const [step, setStep] = useState(1);

    const [identifier, setIdentifier] = useState('');
    const [otpCode, setOtpCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [emailMasked, setEmailMasked] = useState('');

    const handleRequestOtp = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setInfo('');

        if (!identifier.trim()) {
            setError('Masukkan username atau email.');
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.detail || 'Gagal mengirim kode OTP.');
                setIsLoading(false);
                return;
            }

            setInfo(data.message);
            setEmailMasked(data.email_masked || '');
            setStep(2);
        } catch (err) {
            setError('Tidak dapat terhubung ke server.');
        }
        setIsLoading(false);
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        setInfo('');

        if (!otpCode.trim()) {
            setError('Masukkan kode OTP.');
            setIsLoading(false);
            return;
        }
        if (newPassword.length < 6) {
            setError('Password baru minimal 6 karakter.');
            setIsLoading(false);
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Konfirmasi password tidak cocok.');
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    identifier,
                    otp_code: otpCode,
                    new_password: newPassword,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                setError(data.detail || 'Gagal reset password.');
                setIsLoading(false);
                return;
            }

            setStep(3);
        } catch (err) {
            setError('Tidak dapat terhubung ke server.');
        }
        setIsLoading(false);
    };

    const handleResendOtp = async () => {
        setIsLoading(true);
        setError('');
        setInfo('');
        try {
            const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier }),
            });
            const data = await res.json();
            if (res.ok) {
                setInfo('Kode OTP baru telah dikirim.');
                setEmailMasked(data.email_masked || '');
            } else {
                setError(data.detail || 'Gagal mengirim ulang kode OTP.');
            }
        } catch (err) {
            setError('Tidak dapat terhubung ke server.');
        }
        setIsLoading(false);
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-background p-4 relative overflow-hidden">
            {/* Decorative gradient blur */}
            <div className="absolute top-1/4 left-1/4 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 h-64 w-64 translate-x-1/2 translate-y-1/2 rounded-full bg-primary/10 blur-[100px] pointer-events-none" />

            <div className="absolute top-4 right-4">
                <ModeToggle />
            </div>

            <div className="z-10 w-full max-w-md space-y-8 rounded-2xl border bg-card/80 backdrop-blur-xl p-8 shadow-2xl">
                <div className="flex flex-col items-center space-y-2">
                    <img src="/logo.svg" alt="Deteksi APD" className="h-16 w-16 mb-2 drop-shadow-lg" />
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">Lupa Password</h2>
                    <p className="text-sm text-muted-foreground text-center">
                        {step === 1 && 'Reset password akun Anda'}
                        {step === 2 && `Masukkan kode OTP yang dikirim ke ${emailMasked}`}
                        {step === 3 && 'Password berhasil direset'}
                    </p>
                </div>

                {/* Step indicator */}
                <div className="flex items-center justify-center gap-2">
                    {[1, 2, 3].map((s) => (
                        <div
                            key={s}
                            className={`h-2 rounded-full transition-all ${step >= s ? 'bg-primary w-8' : 'bg-muted w-2'
                                }`}
                        />
                    ))}
                </div>

                {error && (
                    <div className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive border border-destructive/20 text-center animate-in fade-in slide-in-from-top-2">
                        {error}
                    </div>
                )}
                {info && !error && (
                    <div className="rounded-lg bg-primary/10 p-3 text-sm font-medium text-primary border border-primary/20 text-center animate-in fade-in slide-in-from-top-2">
                        {info}
                    </div>
                )}

                {/* STEP 1: Request OTP */}
                {step === 1 && (
                    <form onSubmit={handleRequestOtp} className="space-y-6 mt-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none text-foreground ml-1" htmlFor="identifier">
                                Username atau Email
                            </label>
                            <div className="relative group">
                                <Mail className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <input
                                    id="identifier"
                                    type="text"
                                    value={identifier}
                                    onChange={(e) => setIdentifier(e.target.value)}
                                    placeholder="admin atau admin@example.com"
                                    className="flex h-10 w-full rounded-xl border border-input bg-background/50 px-10 py-2 text-sm ring-offset-background transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:bg-background/80"
                                    required
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all hover:scale-[1.02] active:scale-[0.98] gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Mengirim Kode...
                                </>
                            ) : (
                                <>
                                    Kirim Kode OTP
                                    <Mail className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* STEP 2: Input OTP + New Password */}
                {step === 2 && (
                    <form onSubmit={handleResetPassword} className="space-y-5 mt-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none text-foreground ml-1" htmlFor="otp">
                                Kode OTP (6 digit)
                            </label>
                            <div className="relative group">
                                <KeyRound className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <input
                                    id="otp"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    value={otpCode}
                                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                                    placeholder="123456"
                                    className="flex h-12 w-full rounded-xl border border-input bg-background/50 px-10 py-2 text-center text-xl font-bold tracking-[0.5em] ring-offset-background transition-all placeholder:text-muted-foreground placeholder:tracking-normal placeholder:font-normal placeholder:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:bg-background/80"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none text-foreground ml-1" htmlFor="newPassword">
                                Password Baru
                            </label>
                            <input
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Minimal 6 karakter"
                                className="flex h-10 w-full rounded-xl border border-input bg-background/50 px-4 py-2 text-sm ring-offset-background transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:bg-background/80"
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none text-foreground ml-1" htmlFor="confirmPassword">
                                Konfirmasi Password Baru
                            </label>
                            <input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="Ulangi password baru"
                                className="flex h-10 w-full rounded-xl border border-input bg-background/50 px-4 py-2 text-sm ring-offset-background transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:bg-background/80"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="group inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all hover:scale-[1.02] active:scale-[0.98] gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Memproses...
                                </>
                            ) : (
                                <>
                                    Reset Password
                                    <CheckCircle2 className="h-4 w-4 transition-transform group-hover:scale-110" />
                                </>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={isLoading}
                            className="w-full text-center text-xs font-medium text-muted-foreground hover:text-primary transition-colors"
                        >
                            Tidak menerima kode? Kirim ulang OTP
                        </button>
                    </form>
                )}

                {/* STEP 3: Success */}
                {step === 3 && (
                    <div className="space-y-6 mt-4 text-center">
                        <div className="flex justify-center">
                            <div className="rounded-full bg-primary/10 p-4">
                                <CheckCircle2 className="h-12 w-12 text-primary" />
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Password Anda telah berhasil direset. Silakan login dengan password baru.
                        </p>
                        <button
                            onClick={() => navigate('/login')}
                            className="group inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all hover:scale-[1.02] active:scale-[0.98] gap-2"
                        >
                            Kembali ke Login
                        </button>
                    </div>
                )}

                <div className="text-center">
                    <Link
                        to="/login"
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-primary transition-all"
                    >
                        <ArrowLeft className="h-3 w-3" />
                        Kembali ke halaman login
                    </Link>
                </div>

                <div className="text-center text-xs text-muted-foreground/60 mt-6 font-medium">
                    <p>Dashboard Area Deteksi APD v1.0.0</p>
                </div>
            </div>
        </div>
    );
}
