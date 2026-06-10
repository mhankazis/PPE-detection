import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = useCallback(async () => {
        const token = localStorage.getItem('token');
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
        const storedAuth = localStorage.getItem('isAuthenticated');
        if (storedAuth === 'true') {
            setIsAuthenticated(true);
            fetchProfile();
        }
        setLoading(false);
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
                localStorage.setItem('isAuthenticated', 'true');
                localStorage.setItem('token', data.access_token);
                localStorage.setItem('role', data.role);
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
        localStorage.removeItem('isAuthenticated');
        localStorage.removeItem('token');
        localStorage.removeItem('role');
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
