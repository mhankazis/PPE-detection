# 🐳 Cara Menjalankan PPE-detection dengan Docker

Tutorial lengkap dari nol — clone repo, pindah branch, build image, jalankan dengan Docker Compose — sampai aplikasi benar-benar menyala dan bisa dipakai.

---

## Prasyarat

1. **Docker Desktop** sudah terpasang dan **sedang berjalan**
   - Ikon paus 🐳 di system tray berstatus *Engine running*.
   - Cek di terminal:
     ```bash
     docker --version
     docker compose version
     ```
     Kedua perintah harus memunculkan angka versi.
2. **Git** sudah terpasang.
3. Koneksi internet (build pertama akan mengunduh image dasar + PyTorch).

> Perintah di bawah berlaku sama di **PowerShell, CMD, maupun Git Bash**.

---

## Langkah 1 — Clone repo & pindah ke branch docker

```bash
git clone https://github.com/mhankazis/PPE-detection.git
cd PPE-detection
git checkout feat/dockerize
```

Pastikan branch aktif adalah `feat/dockerize`:

```bash
git branch
# * feat/dockerize   ← harus ditandai bintang
```

---

## Langkah 2 — (Opsional) Siapkan file `.env`

```bash
cp .env.example .env
```

Untuk sekadar mencoba di lokal, biasanya **tidak perlu mengubah apa pun**.
Beberapa hal yang umum diubah:

```ini
WEB_PORT=8088                  # port web UI di host (ubah kalau 8088 dipakai)
MYSQL_ROOT_PASSWORD=changeme   # ganti password MySQL bawaan biar aman
```

> Catatan: aplikasi tetap jalan tanpa file `.env` (memakai nilai default).

---

## Langkah 3 — Build & jalankan

```bash
docker compose up --build
```

- `--build` = membangun image terlebih dahulu.
- Build pertama memakan **±10–20 menit** (mengunduh image dasar, PyTorch CPU, dan mengompilasi `lap`). Ini hanya sekali — build berikutnya cepat karena ter-cache.
- Tanpa opsi `-d`, log akan tampil langsung di terminal. Tekan `Ctrl+C` untuk menghentikan.

**Menjalankan di background** (terminal tetap dapat dipakai):

```bash
docker compose up -d --build
```

---

## Langkah 4 — Pastikan aplikasi benar-benar ON

**Cek status container:**

```bash
docker compose ps
```

Ketiga service harus berstatus `Up`:

```
ppe-detection-db-1         Up (healthy)
ppe-detection-backend-1    Up
ppe-detection-frontend-1   Up   0.0.0.0:8088->80/tcp
```

**Pastikan backend selesai memuat model** (penting — deteksi butuh ini):

```bash
docker compose logs backend | grep "loaded and ready"
```

Harus muncul baris:

```
[Startup] YOLO PPE detector loaded and ready.
```

> Jika belum muncul, tunggu 30–60 detik (model sedang dimuat di memori).

**Akses aplikasi:**

- 🌐 Browser → **http://localhost:8088**
- 🔐 Login default → username: **`admin`** · password: **`admin123`**

✅ Jika berhasil masuk ke dashboard → **stack sudah 100% menyala.**
Coba menu *Upload Image* untuk menguji deteksi PPE (helm, seragam, dll).

---

## Langkah 5 — Stop, restart, dan update

| Aksi | Perintah |
|---|---|
| Stop & hapus container | `docker compose down` |
| Stop + hapus juga data DB ⚠️ | `docker compose down -v` |
| Lihat log backend realtime | `docker compose logs -f backend` |
| Restart setelah mengubah kode | `docker compose up -d --build` |
| Start ulang tanpa rebuild | `docker compose up -d` |

---

## 🏫 Variasi: deploy ke server sekolah

### A. Port 8088 sudah dipakai

Edit `.env`, ganti port:

```ini
WEB_PORT=8090
```

Lalu `docker compose up -d`. Akses berubah jadi `http://<ip-server>:8090`.

### B. Memakai MySQL yang sudah ada di server sekolah

Container MySQL bawaan **tidak akan bentrok** dengan MySQL sekolah karena port 3306-nya tidak di-publish ke host. Namun bila ingin langsung memakai MySQL sekolah:

1. Arahkan backend ke MySQL sekolah lewat `.env`:
   ```ini
   DB_HOST=192.168.x.x      # IP/host MySQL sekolah
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=password_sekolah
   DB_NAME=ppe_detection
   ```
2. Import `backend/schema.sql` **sekali** ke MySQL sekolah (membuat DB, tabel, dan user admin).
3. Di `docker-compose.yml`, **beri komentar** seluruh service `db` dan hapus blok `depends_on` pada service `backend`.
4. Jalankan:
   ```bash
   docker compose up -d
   ```

---

## 🧱 Arsitektur singkat (apa yang sebenarnya berjalan)

```
Browser ──► nginx (frontend, port host 8088)
              │  melayani file React (statis)
              │  reverse-proxy /api & /.uploads
              ▼
         backend (FastAPI + uvicorn, port 8000 internal)
              │  deteksi YOLO + face recognition
              ▼
         MySQL 8 (port 3306 internal, TIDAK di-publish ke host)
```

- **Satu-satunya** port yang menyentuh host = **8088** (`WEB_PORT`).
- Semua package Python (PyTorch, OpenCV, Ultralytics, InsightFace, dll) terisolasi di dalam container — tidak menyentuh OS host/server.

---

## 🛠️ Troubleshooting

| Gejala | Solusi |
|---|---|
| `Cannot connect to the Docker daemon` | Jalankan Docker Desktop, tunggu ikon paus stabil (*Engine running*). |
| Build gagal di `npm ci` | Ganti `npm ci` menjadi `npm install` pada `frontend/Dockerfile`. |
| `bind: address already in use` (port 8088) | Ubah `WEB_PORT` di `.env` ke port lain yang kosong. |
| Login gagal padahal password benar | Tunggu backend selesai preload model; cek `docker compose logs backend`. |
| Backend terus-menerus restart | Jalankan `docker compose logs backend`, periksa pesan error. |
| Warning `foreign key constraint` saat startup | Normal pada DB kosong; hilang setelah menambah data student via UI. |

---

## 📌 Info cepat

- **Branch:** `feat/dockerize`
- **Port web:** 8088 (bisa diubah via `WEB_PORT`)
- **Login default:** `admin` / `admin123`
- **Lihat semua log:** `docker compose logs -f`
