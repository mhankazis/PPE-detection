import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { ShieldAlert, LogIn, Lock, User } from 'lucide-react';
import { ModeToggle } from '../mode-toggle';

export default function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();
    const navigate = useNavigate();

    const handleSubmit = (e) => {
        e.preventDefault();
        if (login(username, password)) {
            navigate('/');
        } else {
            setError('Please enter both username and password.');
        }
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
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary mb-2 shadow-inner ring-1 ring-primary/20">
                        <ShieldAlert className="h-8 w-8" />
                    </div>
                    <h2 className="text-3xl font-bold tracking-tight text-foreground">PPE Detect</h2>
                    <p className="text-sm text-muted-foreground">Sign in to access your dashboard</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6 mt-8">
                    {error && (
                        <div className="rounded-lg bg-destructive/10 p-3 text-sm font-medium text-destructive border border-destructive/20 text-center animate-in fade-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none text-foreground ml-1" htmlFor="username">
                                Username
                            </label>
                            <div className="relative group">
                                <User className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <input
                                    id="username"
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="admin"
                                    className="flex h-10 w-full rounded-xl border border-input bg-background/50 px-10 py-2 text-sm ring-offset-background transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:bg-background/80"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between ml-1 mr-1">
                                <label className="text-sm font-medium leading-none text-foreground" htmlFor="password">
                                    Password
                                </label>
                                <a href="#" className="text-xs font-medium text-primary hover:underline transition-all">Forgot password?</a>
                            </div>
                            <div className="relative group">
                                <Lock className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                <input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="flex h-10 w-full rounded-xl border border-input bg-background/50 px-10 py-2 text-sm ring-offset-background transition-all placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 hover:bg-background/80"
                                    required
                                />
                            </div>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="group inline-flex w-full items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow-lg hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 transition-all hover:scale-[1.02] active:scale-[0.98] gap-2"
                    >
                        Sign In
                        <LogIn className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </button>
                </form>

                <div className="text-center text-xs text-muted-foreground/60 mt-6 font-medium">
                    <p>Simulation Dashboard Area v1.0.0</p>
                </div>
            </div>
        </div>
    );
}
