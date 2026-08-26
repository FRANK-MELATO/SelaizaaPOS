# SELAIzaa Products — Point of Sale System

A full-featured Point of Sale system built for SELAIzaa Products, a Selaizaa Premium Achaar business selling both in-store and online.

## Features

- **POS Screen** — Fast sales processing with barcode support, discounts, split payments
- **Product Management** — Products with variants (flavor × size), SKU/barcode support
- **Inventory Tracking** — Real-time stock levels, low-stock alerts, purchase orders
- **Customer Loyalty** — Points system with Bronze/Silver/Gold tiers, redemption
- **Online Store** — Public catalog, order placement, order management
- **Reports & Analytics** — Sales trends, best sellers, revenue charts, CSV/PDF export
- **Multi-role Auth** — Admin and Cashier roles with JWT
- **Dark/Light Mode** — Full theme support
- **Offline Mode** — Basic POS functionality when internet is down
- **Mobile Ready** — Tablet-optimized POS interface

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Tailwind CSS, Recharts |
| Backend | Node.js, Express.js |
| Database | PostgreSQL 15 |
| Auth | JWT (jsonwebtoken) |
| Containerization | Docker + Docker Compose |

---

## Quick Start (Docker — Recommended)

### Prerequisites
- Docker and Docker Compose installed

### Steps

```bash
# 1. Clone / navigate to the project
cd atchaar-pos

# 2. Copy environment file
cp .env.example .env

# 3. Edit .env with your settings (especially JWT_SECRET)
nano .env

# 4. Build and start all services
docker-compose up --build -d

# 5. Run database migrations and seed data
docker-compose exec server npm run migrate
docker-compose exec server npm run seed

# 6. Access the application
# POS Application: http://localhost:3000
# API Server:      http://localhost:5000
# Public Store:    http://localhost:3000/online
```

---

## Manual Setup (Development)

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- npm

### Database Setup

```bash
# Create PostgreSQL database
psql -U postgres -c "CREATE DATABASE atchaar_pos;"
# (database name can be changed in .env)
```

### Backend Setup

```bash
cd server

# Install dependencies
npm install

# Copy and configure environment
cp ../.env.example .env
# Edit .env with your database credentials

# Run migrations (creates all tables)
npm run migrate

# Seed sample data (products, users, etc.)
npm run seed

# Start development server
npm run dev
# Server runs on http://localhost:5000
```

### Frontend Setup

```bash
cd client

# Install dependencies
npm install

# Create environment file
echo "REACT_APP_API_URL=http://localhost:5000/api" > .env

# Start development server
npm start
# App runs on http://localhost:3000
```

---

## Default Login Credentials

After running seeds:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@selaizaa.co.ls | admin123 |
| Cashier | cashier@selaizaa.co.ls | cashier123 |

**Change these passwords immediately in production!**

---

## Project Structure

```
atchaar-pos/
├── client/                     # React frontend
│   ├── public/
│   └── src/
│       ├── components/
│       │   ├── common/         # Shared UI components
│       │   └── pos/            # POS-specific components
│       ├── context/            # React Context (Auth, Cart, Theme)
│       ├── hooks/              # Custom hooks
│       ├── pages/              # Route pages
│       ├── services/           # API service layer
│       └── utils/              # Formatters, offline storage
├── server/                     # Express backend
│   ├── config/                 # DB connection
│   ├── controllers/            # Business logic
│   ├── middleware/             # Auth, validation, upload
│   ├── migrations/             # SQL schema files
│   ├── models/                 # (Query helpers)
│   ├── routes/                 # API route definitions
│   └── seeds/                  # Sample data
├── docker-compose.yml
├── .env.example
└── README.md
```

---

## API Reference

### Authentication
```
POST /api/auth/login          — Login, returns JWT
POST /api/auth/logout         — Logout
GET  /api/auth/me             — Current user
PUT  /api/auth/change-password
```

### Products
```
GET    /api/products                 — List all products
POST   /api/products                 — Create product (admin)
GET    /api/products/:id             — Get product
PUT    /api/products/:id             — Update product (admin)
DELETE /api/products/:id             — Delete product (admin)
GET    /api/products/barcode/:code   — Search by barcode
POST   /api/products/:id/variants    — Add variant
PUT    /api/products/variants/:id    — Update variant
GET    /api/categories               — List categories
```

### POS / Sales
```
POST /api/sales               — Create sale (process payment)
GET  /api/sales               — Sale history
GET  /api/sales/:id           — Sale details + receipt data
POST /api/sales/:id/void      — Void sale
GET  /api/sales/daily-summary — Today's totals
POST /api/sales/hold          — Hold current order
GET  /api/sales/held          — List held orders
```

### Inventory
```
GET  /api/inventory              — Stock levels
POST /api/inventory/adjust       — Manual adjustment
POST /api/inventory/write-off    — Write off stock
GET  /api/inventory/low-stock    — Low stock alerts
GET  /api/inventory/history      — Movement log
```

### Customers
```
GET  /api/customers           — Customer list
POST /api/customers           — Create customer
GET  /api/customers/:id       — Customer profile
PUT  /api/customers/:id       — Update customer
GET  /api/customers/:id/sales — Purchase history
```

### Reports
```
GET /api/reports/sales-summary    — Revenue totals
GET /api/reports/revenue-chart    — Daily revenue data
GET /api/reports/best-selling     — Top products
GET /api/reports/payment-methods  — Payment breakdown
GET /api/reports/inventory        — Inventory report
```

### Online Orders (Public)
```
GET  /api/online/products     — Public product catalog (no auth)
POST /api/online/orders       — Place order (no auth)
GET  /api/online/orders       — Admin order list
PUT  /api/online/orders/:id/status — Update order status
```

---

## Currency

The system uses **South African Rand (ZAR/R)** as the default currency.
Format: `R 1,234.56`

---

## Loyalty Programme

| Tier | Points Required | Earning Rate | Redemption |
|------|----------------|--------------|------------|
| Bronze | 0 – 999 | 1pt per M1 spent | 100pts = M10 |
| Silver | 1,000 – 4,999 | 1pt per M1 spent | 100pts = M10 |
| Gold | 5,000+ | 1pt per M1 spent | 100pts = M10 |

---

## Offline Mode

The POS screen works offline using IndexedDB:
- Completed sales are queued locally when the API is unreachable
- An "Offline" banner appears in the header
- Sales sync automatically when connectivity is restored

---

## Production Deployment

```bash
# Update .env with production values
JWT_SECRET=<very-long-random-string>
DB_PASSWORD=<strong-password>
NODE_ENV=production

# Build and run
docker-compose up --build -d

# Run migrations
docker-compose exec server npm run migrate
docker-compose exec server npm run seed
```

### Recommended additions for production:
- Nginx reverse proxy with SSL (Let's Encrypt)
- PostgreSQL backups (pg_dump on cron)
- PM2 or systemd for process management
- Environment secrets manager (AWS Secrets Manager, Vault)

---

## Sample Products (Seeded)

| Product | Variants |
|---------|----------|
| Selaizaa Fresh Achaar (Mild) | 90ml (R7), 125ml (R13), 200ml (R16), 250ml (R23), 300ml (R35), 1L (R60), 2L (R90), 5L (R200) |

---

## License

MIT — Free to use and modify for your business.
