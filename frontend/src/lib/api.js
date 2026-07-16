// Centralized API base for the frontend.
//
// - In production (nginx), VITE_API_BASE is unset -> "" -> requests are RELATIVE
//   to the current origin, and nginx reverse-proxies /api, /.uploads, /uploads
//   to the backend. This is what makes the app work from any host (e.g. a school
//   server), not just localhost.
// - In dev (vite), vite.config.js proxies those same paths to the local backend.
// - Override with VITE_API_BASE if you ever need an absolute backend URL.
export const API_BASE = import.meta.env.VITE_API_BASE || "";
