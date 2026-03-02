import { useState } from "react"
import { Outlet, Link, useLocation } from "react-router-dom"
import { LayoutDashboard, Video, FileText, Settings, ShieldAlert, LogOut } from "lucide-react"
import { cn } from "@/lib/utils"
import { ModeToggle } from "../mode-toggle"
import { useAuth } from "../../contexts/AuthContext"

const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Live Feed', href: '/live', icon: Video },
    { name: 'Violation Logs', href: '/logs', icon: FileText },
    { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
    const [isCollapsed, setIsCollapsed] = useState(false)
    const location = useLocation()
    const { logout } = useAuth()

    return (
        <div className={cn(
            "flex flex-col h-screen border-r bg-card transition-all duration-300",
            isCollapsed ? "w-20" : "w-64"
        )}>
            {/* Brand */}
            <div className="flex items-center justify-between p-6 border-b">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center p-2 rounded-lg bg-primary/10 text-primary">
                        <ShieldAlert className="w-6 h-6" />
                    </div>
                    {!isCollapsed && (
                        <span className="text-xl font-bold tracking-tight">PPE Detect</span>
                    )}
                </div>
                {!isCollapsed && <ModeToggle />}
            </div>

            {/* Nav Links */}
            <nav className="flex-1 p-4 space-y-2">
                {navigation.map((item) => {
                    const isActive = location.pathname === item.href
                    return (
                        <Link
                            key={item.name}
                            to={item.href}
                            className={cn(
                                "flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors",
                                "hover:bg-accent hover:text-accent-foreground",
                                isActive ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground" : "text-muted-foreground"
                            )}
                        >
                            <item.icon className="w-5 h-5" />
                            {!isCollapsed && (
                                <span className="font-medium">{item.name}</span>
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* User / Footer */}
            <div className="p-4 border-t space-y-2">
                <button
                    onClick={logout}
                    className={cn(
                        "flex items-center gap-3 w-full p-2 text-sm rounded-md transition-colors text-destructive hover:bg-destructive/10 hover:text-destructive",
                        isCollapsed ? "justify-center" : "px-3"
                    )}
                    title="Logout"
                >
                    <LogOut className="w-5 h-5" />
                    {!isCollapsed && <span className="font-medium">Logout</span>}
                </button>
                <button
                    onClick={() => setIsCollapsed(!isCollapsed)}
                    className="w-full p-2 text-sm text-center border rounded-md hover:bg-accent text-muted-foreground transition-colors"
                >
                    {isCollapsed ? "»" : "Collapse Sidebar"}
                </button>
            </div>
        </div>
    )
}

export function Layout() {
    return (
        <div className="flex h-screen overflow-hidden bg-background">
            <Sidebar />
            <main className="flex-1 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    )
}
