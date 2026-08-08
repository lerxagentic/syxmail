<p align="center">
    <h1 align="center">SyxMail</h1>
    <p align="center">A simple, responsive serverless email platform built on Cloudflare Workers with Vue 3 & Hono 🎉</p>
    <p align="center">
        <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="license" /></a>
        <img src="https://img.shields.io/badge/Node.js-%3E%3D18-blue" alt="Node version" />
        <img src="https://img.shields.io/badge/Cloudflare-Workers-orange" alt="Cloudflare Workers" />
    </p>
</p>

---

## 📌 Description

**SyxMail** (based on Cloud Mail) is a self-hosted modern email service platform deployed on **Cloudflare Workers**. Built with Hono on the backend and Vue 3 on the frontend, it allows you to create, manage, send, and receive custom-domain emails without paying for expensive dedicated servers.

---

## 🚀 Key Features

- **💰 Low-Cost Infrastructure**: Fully serverless architecture running on Cloudflare Workers (Free / Low Tier).
- **💻 Modern Responsive UI**: Mobile and desktop friendly user interface powered by Vue 3 & Element Plus.
- **📧 Send & Receive Emails**: Integrates Cloudflare Email Routing and Resend API.
- **📁 Multi-Domain Management**: Manage multiple email domains through Cloudflare API integration.
- **📦 Attachment Handling**: Upload, store, and download email attachments via **Cloudflare R2 Object Storage**.
- **🔔 Push Notifications**: Receive real-time incoming email notifications via Telegram Bot.
- **🛡️ Admin & Role Management (RBAC)**: Manage users, roles, email quotas, and resource permissions.
- **🔑 Secure Authentication**: JWT Token authentication and Cloudflare Turnstile CAPTCHA to prevent spam signups.

---

## 🛠️ Tech Stack

| Component | Technology |
| :--- | :--- |
| **Serverless Platform** | [Cloudflare Workers](https://developers.cloudflare.com/workers/) |
| **Backend Framework** | [Hono Framework](https://hono.dev/) |
| **Relational Database** | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite at Edge) |
| **ORM** | [Drizzle ORM](https://orm.drizzle.team/) |
| **Object Storage** | [Cloudflare R2](https://developers.cloudflare.com/r2/) |
| **KV Storage** | [Cloudflare KV](https://developers.cloudflare.com/kv/) |
| **Frontend Framework** | [Vue 3](https://vuejs.org/) + [Vite](https://vitejs.dev/) |
| **UI Library** | [Element Plus](https://element-plus.org/) |

---

## 📂 Project Structure

```text
SyxMail/
├── mail-worker/                # Backend Worker Project
│   ├── src/
│   │   ├── api/               # API Controllers (Domain, Email, User, etc.)
│   │   ├── dao/               # Data Access Objects
│   │   ├── entity/            # Database Entities (Drizzle ORM)
│   │   ├── hono/              # Hono App, Middleware & Error Handling
│   │   ├── service/           # Business Logic & Cloudflare API Services
│   │   ├── security/          # JWT Security & User Context
│   │   └── index.js           # Worker Entrypoint
│   └── wrangler.toml          # Cloudflare Worker Configuration
│
├── mail-vue/                   # Frontend Vue Project
│   ├── src/
│   │   ├── axios/             # HTTP Client Setup
│   │   ├── layout/            # Layout Components (Header, Aside, Container)
│   │   ├── views/             # Page Components (Login, Domain, User, Settings)
│   │   ├── App.vue            # Root Component
│   │   └── main.js            # Vue Entrypoint
│   └── .env.release           # Frontend Environment Config
│
└── .gitignore                  # Git Ignore Rules
```

---

## 🔒 Security & Secrets Management

> ⚠️ **IMPORTANT: NEVER HARDCODE API TOKENS OR SECRET KEYS IN `wrangler.toml`!**
> 
> The `wrangler.toml` file is tracked by Git and **pushed to public repositories**. Hardcoding your `CLOUDFLARE_API_TOKEN` or `jwt_secret` inside `wrangler.toml` exposes your Cloudflare account to unauthorized access.

### Recommended Secrets Management Workflow:

1. **For Local Development:**
   Create a `.dev.vars` file inside the `mail-worker/` directory (this file is ignored by Git and Wrangler by default):
   ```ini
   # mail-worker/.dev.vars
   CLOUDFLARE_ACCOUNT_ID="your_cloudflare_account_id"
   CLOUDFLARE_API_TOKEN="your_cloudflare_api_token"
   JWT_SECRET="your_random_jwt_secret_key"
   ```

2. **For Production Deployment:**
   Use the `wrangler secret put` command to store secret keys securely in Cloudflare:
   ```bash
   cd mail-worker
   npx wrangler secret put CLOUDFLARE_API_TOKEN
   npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
   npx wrangler secret put JWT_SECRET
   ```

---

## 💻 Local Setup & Development

### 1. Prerequisites
- **Node.js** v18.0.0 or higher
- **pnpm** Package Manager (`npm i -g pnpm`)
- **Cloudflare CLI (Wrangler)** (`npm i -g wrangler`)

### 2. Clone & Install Dependencies
```bash
# Clone repository
git clone https://github.com/username/SyxMail.git
cd SyxMail

# Install dependencies for both frontend and backend
pnpm --prefix mail-vue install
pnpm --prefix mail-worker install
```

### 3. Provision Cloudflare Resources
Run the following commands to create required Cloudflare resources:

```bash
# 1. Create D1 Database
npx wrangler d1 create syxmail-db

# 2. Create KV Namespace
npx wrangler kv:namespace create SYXMAIL_KV

# 3. Create R2 Storage Bucket
npx wrangler r2 bucket create syxmail-r2
```

Copy the generated `database_id` and KV `id` into `mail-worker/wrangler.toml`.

### 4. Run Development Servers
```bash
# Terminal 1: Backend Worker
cd mail-worker
pnpm dev

# Terminal 2: Frontend Vue Application
cd mail-vue
pnpm dev
```

---

## 🚀 Production Deployment

To build the frontend bundle and deploy to Cloudflare Workers:

```bash
# Authenticate with Cloudflare (if not logged in)
npx wrangler login

# Build & deploy from the worker folder
cd mail-worker
pnpm run deploy
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
