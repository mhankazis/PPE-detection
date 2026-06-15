import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = useCallback(async () => {
        const token = sessionStorage.getItem('token');
        if (!token) return null;
        try {
            const res = await fetch('http://localhost:8000/api/auth/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setUser(data);
                return data;
            }
        } catch (e) {
            console.error("Fetch profile error:", e);
        }
        return null;
    }, []);

    useEffect(() => {
        const storedAuth = sessionStorage.getItem('isAuthenticated');
        const storedToken = sessionStorage.getItem('token');
        if (storedAuth === 'true' && storedToken) {
            // Validate token — if invalid/expired, force logout
            fetchProfile().then((profile) => {
                if (profile) {
                    setIsAuthenticated(true);
                } else {
                    // Token invalid — clear stale auth
                    sessionStorage.removeItem('isAuthenticated');
                    sessionStorage.removeItem('token');
                    sessionStorage.removeItem('role');
                    setIsAuthenticated(false);
                }
                setLoading(false);
            });
        } else {
            // No stored auth — ensure clean state
            sessionStorage.removeItem('isAuthenticated');
            sessionStorage.removeItem('token');
            sessionStorage.removeItem('role');
            setLoading(false);
        }
    }, [fetchProfile]);

    const login = async (username, password) => {
        try {
            const formData = new URLSearchParams();
            formData.append('username', username);
            formData.append('password', password);

            const response = await fetch('http://localhost:8000/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: formData.toString(),
            });

            if (response.ok) {
                const data = await response.json();
                setIsAuthenticated(true);
                sessionStorage.setItem('isAuthenticated', 'true');
                sessionStorage.setItem('token', data.access_token);
                sessionStorage.setItem('role', data.role);
                await fetchProfile();
                return { success: true };
            } else {
                const errorData = await response.json();
                return { success: false, message: errorData.detail || 'Login failed' };
            }
        } catch (error) {
            console.error("Login error:", error);
            return { success: false, message: 'Server connection failed' };
        }
    };

    const logout = () => {
        setIsAuthenticated(false);
        setUser(null);
        sessionStorage.removeItem('isAuthenticated');
        sessionStorage.removeItem('token');
        sessionStorage.removeItem('role');
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, user, login, logout, loading, fetchProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
