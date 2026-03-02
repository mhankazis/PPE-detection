import { BrowserRouter as Router, Routes, Route } from "react-router-dom"
import { Layout } from "./components/layout/Layout"
import Dashboard from "./components/views/Dashboard"
import LiveFeed from "./components/views/LiveFeed"
import Logs from "./components/views/Logs"
import Login from "./components/views/Login"
import { ThemeProvider } from "./components/theme-provider"
import { AuthProvider } from "./contexts/AuthContext"
import { ProtectedRoute } from "./components/ProtectedRoute"

// Dummy views
function Settings() { return <div className="p-8"><h1 className="text-3xl font-bold">Settings</h1></div> }

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout />}>
                <Route index element={<Dashboard />} />
                <Route path="live" element={<LiveFeed />} />
                <Route path="logs" element={<Logs />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App
