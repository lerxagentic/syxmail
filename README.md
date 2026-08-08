<p align="center">
    <h1 align="center">SyxMail</h1>
    <p align="center">Layanan Email Berbasis Cloudflare Workers dengan Vue 3 & Hono 🎉</p>
    <p align="center">
        <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
        <img src="https://img.shields.io/badge/Node.js-%3E%3D18-blue" alt="Node version" />
        <img src="https://img.shields.io/badge/Cloudflare-Workers-orange" alt="Cloudflare Workers" />
    </p>
</p>

---

## 📌 Deskripsi

**SyxMail** (berbasis Cloud Mail) adalah platform layanan email mandiri modern yang dideploy di atas **Cloudflare Workers**. Menggunakan Hono di sisi backend dan Vue 3 di sisi frontend, aplikasi ini memungkinkan Anda membuat, mengelola, dan menerima email dengan domain sendiri tanpa perlu menyewa server fisik yang mahal.

---

## 🚀 Fitur Utama

- **💰 Hemat Biaya**: Berjalan sepenuhnya di arsitektur Serverless Cloudflare Workers (Free / Low Tier).
- **💻 UI Responsive Modern**: Antarmuka berbasis Vue 3 & Element Plus yang mendukung tampilan PC & perangkat seluler.
- **📧 Pengiriman & Penerimaan Email**: Terintegrasi dengan Cloudflare Email Routing & Resend API.
- **📁 Pengelolaan Domain**: Manajemen multiple domain email dengan integrasi Cloudflare API.
- **📦 Lampiran File (Attachments)**: Penyimpanan dan penanganan lampiran menggunakan **Cloudflare R2 Object Storage**.
- **🔔 Notifikasi Push**: Mendukung pengiriman notifikasi email masuk ke Telegram Bot.
- **🛡️ Manajemen Akses & Pengguna (RBAC)**: Fitur admin untuk mengatur role, kuota pengguna, dan izin akses.
- **🔑 Otentikasi Aman**: Menggunakan JWT Token & Turnstile captcha untuk pencegahan pendaftaran spam.

---

## 🛠️ Teknologi yang Digunakan

| Komponen | Teknologi |
| :--- | :--- |
| **Platform Serverless** | [Cloudflare Workers](https://developers.cloudflare.com/workers/) |
| **Backend Framework** | [Hono Framework](https://hono.dev/) |
| **Database Relasional** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite at Edge) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **Object Storage** | [Cloudflare R2](https://developers.cloudflare.com/r2/) |
| **KV Storage** | [Cloudflare KV](https://developers.cloudflare.com/kv/) |
| **Frontend Framework** | [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/) |
| **UI Component Library** | [Element Plus](https://element-plus.org/) |

---

## 📂 Struktur Direktori

```text
SyxMail/
├── mail-worker/                # Project Backend (Cloudflare Worker)
│   ├── src/
│   │   ├── api/               # Router & Controller API (Domain, Email, User, dll)
│   │   ├── dao/               # Data Access Object
│   │   ├── entity/            # Skema Database (Drizzle ORM)
│   │   ├── hono/              # Konfigurasi Hono Framework & Middleware
│   │   ├── service/           # Logika Bisnis & Integrasi Cloudflare API
│   │   ├── security/          # Autentikasi JWT & Context
│   │   └── index.js           # Entrypoint Worker
│   └── wrangler.toml          # Konfigurasi Cloudflare Worker
│
├── mail-vue/                   # Project Frontend (Vue 3 SPA)
│   ├── src/
│   │   ├── axios/             # Konfigurasi HTTP Client
│   │   ├── layout/            # Layout UI (Header, Aside, Container)
│   │   ├── views/             # Halaman (Login, Domain, User, System Setting)
│   │   ├── App.vue            # Component Utama
│   │   └── main.js            # Entrypoint Vue
│   └── .env.release           # Konfigurasi Environment Frontend
│
└── .gitignore                  # Aturan Abaikan Git (Mencegah Kebocoran Kredensial)
```

---

## 🔒 Keamanan & Pengelolaan Rahasia (Secrets)

> ⚠️ **PENTING: JANGAN PERNAH MENYIMPAN API TOKEN ATAU SECRET KEY DI `wrangler.toml`!**
> 
> File `wrangler.toml` melacak konfigurasi project dan **ikut ter-push ke dalam Git repository**. Jika Anda memasukkan `CLOUDFLARE_API_TOKEN` atau `jwt_secret` secara hardcode di `wrangler.toml` lalu mem-push ke GitHub, token dan kredensial akun Cloudflare Anda dapat dibaca dan disalahgunakan oleh publik.

### Cara Pengelolaan Secret yang Benar:

1. **Untuk Pengujian Lokal (Local Development):**
   Buat file `.dev.vars` di dalam direktori `mail-worker/` (file ini otomatis diabaikan oleh Git dan Wrangler):
   ```ini
   # mail-worker/.dev.vars
   CLOUDFLARE_ACCOUNT_ID="id_akun_cloudflare_anda"
   CLOUDFLARE_API_TOKEN="token_api_cloudflare_anda"
   JWT_SECRET="kunci_rahasia_jwt_acak_anda"
   ```

2. **Untuk Production (Cloudflare Deployment):**
   Gunakan perintah `wrangler secret put` untuk menyimpan secret secara aman di Cloudflare:
   ```bash
   cd mail-worker
   npx wrangler secret put CLOUDFLARE_API_TOKEN
   npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
   npx wrangler secret put JWT_SECRET
   ```

---

## 💻 Panduan Instalasi & Pengembangan Lokal

### 1. Prasyarat
- **Node.js** v18.0.0 atau lebih baru
- **pnpm** Package Manager (`npm i -g pnpm`)
- **Cloudflare CLI (Wrangler)** (`npm i -g wrangler`)

### 2. Kloning Repository & Install Dependensi
```bash
# Clone repository
git clone https://github.com/username/SyxMail.git
cd SyxMail

# Install dependensi frontend & backend
pnpm --prefix mail-vue install
pnpm --prefix mail-worker install
```

### 3. Konfigurasi Resource Cloudflare
Jalankan perintah berikut untuk membuat resource di Cloudflare (atau buat melalui Dashboard Cloudflare):

```bash
# 1. Buat Database D1
npx wrangler d1 create syxmail-db

# 2. Buat KV Namespace
npx wrangler kv:namespace create SYXMAIL_KV

# 3. Buat R2 Bucket
npx wrangler r2 bucket create syxmail-r2
```

Salin `database_id` dan `id` KV ke file `mail-worker/wrangler.toml`.

### 4. Jalankan Server Lokal
```bash
# Terminal 1: Backend Worker
cd mail-worker
pnpm dev

# Terminal 2: Frontend Vue
cd mail-vue
pnpm dev
```

---

## 🚀 Panduan Deployment ke Production

Untuk membangun (build) frontend dan melakukan deployment ke Cloudflare Workers:

```bash
# Log in ke Cloudflare (jika belum)
npx wrangler login

# Jalankan build & deploy dari direktori mail-worker
cd mail-worker
pnpm run deploy
```

Perintah di atas akan secara otomatis memicu proses build pada project `mail-vue` dan mengupload bundle beserta worker ke Cloudflare.

---

## 📄 Lisensi

Proyek ini dilindungi di bawah lisensi [MIT License](LICENSE).
