# 🛒 TypeScript Shop API — Clean Architecture, Authentication & Monitoring

[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript&logoColor=white)](package.json)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](src/app.ts)
[![Prisma](https://img.shields.io/badge/Prisma-5.20-2D3748?logo=prisma&logoColor=white)](src/ca_infrastructure/database/prisma/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Primary-47A248?logo=mongodb&logoColor=white)](src/ca_infrastructure/database/prisma/mongodb/schema.mongodb.prisma)
[![Redis](https://img.shields.io/badge/Redis-Sessions-DC382D?logo=redis&logoColor=white)](src/ca_infrastructure/database/redis/redis.ts)
[![JWT Authentication](https://img.shields.io/badge/JWT-Authentication-000000?logo=jsonwebtokens&logoColor=white)](src/ca_infrastructure/authentication/authentication.ts)
[![Passport.js](https://img.shields.io/badge/Passport.js-0.7-34E27A?logo=passport&logoColor=white)](src/ca_infrastructure/authentication/authentication.ts)
[![Zod](https://img.shields.io/badge/Zod-3.23-3E67B1?logo=zod&logoColor=white)](src/ca_application/validation/customerschema.ts)
[![Winston](https://img.shields.io/badge/Winston-Logging-231F20)](src/ca_infrastructure/logging/logger.ts)
[![Prometheus](https://img.shields.io/badge/Prometheus-Metrics-E6522C?logo=prometheus&logoColor=white)](prometheus.yml)
[![Loki](https://img.shields.io/badge/Loki-Logs-F46800)](loki-config.yml)
[![Grafana](https://img.shields.io/badge/Grafana-Dashboards-F46800?logo=grafana&logoColor=white)](monitoring/grafana/dashboards/p4-overview.json)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](docker-compose.yml)
[![Postman](https://img.shields.io/badge/Postman-API_Testing-FF6C37?logo=postman&logoColor=white)](backend.postman_collection.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An educational TypeScript shop API for managing **customers, products, orders, and users**.
Built with **Express**, **Prisma**, and **MongoDB**, p4 demonstrates a layered Clean Architecture
approach with use cases, repository interfaces, JWT authentication, Redis-backed login state,
centralized error handling, and an observability stack using Prometheus, Grafana, and Loki.

This Part 4 project is a practical reference for learning how an Express CRUD application can
separate HTTP handling, application operations, domain models, and infrastructure integrations.

> **Current implementation:** all resource repositories use MongoDB. A PostgreSQL schema, client
> factory, migration, and Compose service are included, but changing a connection URL does not
> switch the application to PostgreSQL. The project remains a learning implementation with the
> limitations documented below.

The Express API runs locally on your host. Docker Compose supplies Redis and the monitoring
services; MongoDB must be supplied separately. Begin with the setup and API examples, then use
the monitoring walkthrough to see the requests in Prometheus, Loki, and Grafana.

[Getting started](#-getting-started) · [API reference](#-api-reference) ·
[Monitoring walkthrough](#-monitoring--logging-beginner-walkthrough) ·
[Current limitations](#-current-limitations--deployment-notes)

---

## 🧰 Technology Stack

| Technology | How this project uses it |
| :--- | :--- |
| **TypeScript** | Compiles the application with strict type checking; HTTP input still needs runtime validation |
| **Express** | Hosts the HTTP server's middleware, routes and controllers |
| **Prisma** | Generates database clients and implements persistence through repositories |
| **MongoDB** | Stores all active application resources using ObjectId identifiers |
| **JWT Authentication** | Issues access and refresh tokens and verifies bearer tokens for protected routes |
| **Passport.js** | Protects routes with its JWT strategy; login follows the service/use-case path rather than the configured local strategy |
| **Redis** | Stores login state that must exist for JWT-authenticated requests |
| **Zod** | Validates customer creation input, including customer name and email |
| **Winston** | Writes structured application and request completion logs to the console and optionally Loki |
| **Prometheus** | Collects process and HTTP duration metrics exposed at `/metrics` |
| **Loki** | Receives application logs through the Winston Loki transport |
| **Grafana** | Starts with provisioned Prometheus/Loki data sources and a beginner dashboard |
| **Docker Compose** | Runs supporting services, including Redis and the monitoring stack; the API starts separately |
| **Postman** | Provides an included request collection for exploring and checking the API |
| **PostgreSQL / pgAdmin** | Optional alternative-schema tooling in Compose; the active repositories still use MongoDB |

---

## 📐 Architecture & Flow

The application is a **layered monolith**: one Express process organized into presentation,
application, domain, and infrastructure folders.

```mermaid
flowchart TD
    Client[HTTP client / Postman]
    HTTP[Express: observe requests, then JSON, CORS and API rate limiting]
    Auth[Passport JWT + Redis login state]
    Controller[Presentation: routes and controllers]
    Service[Application: services and use cases]
    Repository[Infrastructure: Prisma repositories]
    Mongo[(MongoDB)]
    Endpoint[API /metrics]
    Prometheus[Prometheus scraper]
    Winston[Winston JSON logs]
    Console[Console output]
    Loki[Loki log storage]
    Grafana[Grafana dashboards]

    Client --> HTTP --> Auth --> Controller --> Service --> Repository --> Mongo
    HTTP -. exposes measurements .-> Endpoint
    Endpoint -->|scraped every 15 seconds| Prometheus --> Grafana
    HTTP -. completion logs .-> Winston --> Console
    Winston -. LOKI_ENABLED=true .-> Loki --> Grafana
```

Registration and login are public; the resource routes use the JWT middleware. `/metrics` is also
public and bypasses the API rate limiter. Scrapes are excluded from request logs and HTTP metrics.

### Responsibilities by layer

| Layer | Responsibility | Where to look |
| :--- | :--- | :--- |
| **Bootstrap** | Configure Express and start the HTTP server | [app.ts](src/app.ts), [www.ts](src/bin/www.ts) |
| **Presentation** | Routes, controllers, HTTP responses, security middleware and metrics | [ca_presentation/](src/ca_presentation/) |
| **Application** | Coordinate services, individual use cases and customer validation | [ca_application/](src/ca_application/) |
| **Domain** | Define customer, product, order and user models and interfaces | [ca_domain/](src/ca_domain/) |
| **Infrastructure** | Implement persistence, authentication, Redis and logging | [ca_infrastructure/](src/ca_infrastructure/) |

The typical request path is **route → controller → service → use case → repository → database**.
Interfaces describe repository contracts, while factories and constructors supply concrete
implementations. The separation is partial: application use cases also import infrastructure
classes and presentation error types, so the dependency rule is not fully enforced.

### Data model

```mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--o{ ORDER_ITEM : contains
    PRODUCT ||--o{ ORDER_ITEM : referenced_by

    CUSTOMER {
        ObjectId customerCode PK
        string customerName
        string cemail UK
    }
    PRODUCT {
        ObjectId productCode PK
        string productName
        int quantityInStock
        float buyPrice
        float msrp
    }
    ORDER {
        ObjectId orderId PK
        ObjectId customerId FK
        string status
        float total
        boolean paid
    }
    ORDER_ITEM {
        ObjectId orderitemId PK
        ObjectId orderId FK
        ObjectId productId FK
        int quantity
        string status
    }
    USER {
        ObjectId userId PK
        string username UK
        string email UK
        string password
        string role
        string status
    }
```

These names match the active MongoDB schema. Users are separate login records; the schema does
not associate a user with a customer. MongoDB relations are represented through Prisma rather
than database-enforced foreign keys.

---

## ✨ Key Features

- **🧩 Layered organization** — Controllers, services, use cases, interfaces and repositories.
- **🛍️ Commerce CRUD** — Customers, products and orders, including nested order items and product reads.
- **🔐 Token authentication** — bcrypt hashing during registration, Passport JWT checks, login,
  refresh and logout, with the token-lifecycle limitations described below.
- **⚡ Redis login state** — Protected requests require a cached user record in addition to a valid JWT.
- **✅ Customer validation** — Zod checks customer creation input, including name and email.
- **🛡️ HTTP middleware** — A configured CORS allowlist and a limit of 100 API requests per IP per 15 minutes.
- **📊 Metrics and logs** — Process metrics, HTTP duration histograms, safe request completion logs,
  request IDs and optional Winston-to-Loki delivery.
- **📈 Starter dashboard** — Provisioned Grafana data sources and panels for scrape status, request
  rate, client/server error rates, p95 latency and application logs.
- **🐳 Supporting containers** — Redis, PostgreSQL, pgAdmin, Prometheus, Grafana and Loki.
- **📬 Request examples** — A Postman collection for exploring and checking the API.

---

## 📂 Repository Structure

```text
<project-root>/
├── src/
│   ├── app.ts                         # Express configuration and route mounting
│   ├── bin/www.ts                     # HTTP server entry point
│   ├── ca_domain/
│   │   ├── entities/                  # Customer, product, order, order item and user
│   │   └── interfaces/                # Service and repository contracts
│   ├── ca_application/
│   │   ├── services/                  # Group related use cases
│   │   ├── usecases/                  # CRUD, login, refresh and logout operations
│   │   └── validation/                # Customer Zod schema and validator
│   ├── ca_infrastructure/
│   │   ├── authentication/            # Passport local and JWT strategies
│   │   ├── database/
│   │   │   ├── prisma/                # MongoDB and PostgreSQL schemas
│   │   │   ├── generated/             # Separate Prisma clients and runtime assets
│   │   │   ├── repositories/          # Factories and MongoDB repositories
│   │   │   └── redis/                 # Shared Redis connection
│   │   └── logging/                   # Winston, Loki and request logging
│   ├── ca_presentation/
│   │   ├── controllers/               # HTTP handlers
│   │   ├── routes/                    # Resource and authentication endpoints
│   │   ├── middleware/                # Errors, CORS and rate limiting
│   │   └── monitoring/                # Prometheus registry and middleware
│   └── Testing/                       # Additional Postman material
├── .github/workflows/docker-build-push.yml
├── backend.postman_collection.json    # Importable API request collection
├── Dockerfile                         # API image build definition
├── docker-compose.yml                 # Supporting services; does not start the API
├── prometheus.yml                     # Prometheus scrape target
├── loki-config.yml                    # Loki storage configuration
├── monitoring/grafana/
│   ├── provisioning/                  # Data sources and dashboard provider
│   └── dashboards/p4-overview.json     # Beginner metrics and logs dashboard
├── test/monitoring.test.cjs            # Isolated observability regression checks
├── .env.example                       # Safe configuration template
├── LICENSE                            # MIT license
├── DISCLAIMER.md                      # Educational scope and deployment responsibilities
├── SetupNotes.txt                     # Original development notes
├── package.json                       # Dependencies and scripts
└── README.md
```

---

## 🧠 Architecture Concepts

### Use cases and repository contracts

Services group operations for a resource. A use case implements an individual action, such as
creating a customer or fetching an order, and delegates persistence to a repository. Domain
interfaces make the expected operations explicit, while Prisma stays in infrastructure.

Customer creation also invokes `CustomerValidator` before writing. Customer updates and other
resource operations do not run that validator. The parsed Zod result is not substituted for the
request body, so this is not a shared sanitization or unknown-field rejection layer.

### JWT authentication with Redis login state

Login looks up a user by **email**, compares the bcrypt password hash, issues a one-hour access
token and a seven-day refresh token, and stores the user under `user:<userId>` in Redis.
Protected requests validate the bearer token and require that cached user to exist.
Logout deletes the cached entry, invalidating that user's tokens while the entry remains absent.

```mermaid
sequenceDiagram
    participant C as Client
    participant A as Express API
    participant D as MongoDB
    participant R as Redis
    C->>A: POST /api/user/login (email, password)
    A->>D: Find user and compare password hash
    A->>R: Cache user by userId
    A-->>C: token + refreshToken
    C->>A: Protected request + Bearer token
    A->>A: Verify JWT signature and expiry
    A->>R: Look up cached user
    R-->>A: Cached login state
    A-->>C: Resource response
```

The HTTP login handler delegates through `UserService` to `LoginUsecase` with an email and
password. The configured Passport local strategy looks up usernames, but no route invokes it.

The Redis entry has no configured expiry. Refresh currently also requires a valid bearer token
because its route uses the JWT guard; it cannot recover a session using only a refresh token
after the access token expires. Both token types use the same signing key and payload structure;
the JWT guard does not distinguish a refresh token from an access token. A later login recreates
the user cache entry and can therefore make previously issued, unexpired tokens usable again.

### Database adapters are explicit

Both Prisma schemas generate clients into separate folders. All four repositories explicitly call
`getMongoDbClient()`. PostgreSQL uses different ID types and relationship shapes, so enabling it
requires adapting repositories and contracts as well as configuring its URL.

---

## 🚀 Getting Started

### Prerequisites

- Node.js and npm. The current monitoring and login regression checks pass on Node.js 26.13.0.
  The repository does not declare a Node `engines` range. The historical Dockerfile uses Node 18
  and should not be treated as the tested local runtime or a complete deployment recipe.
- A MongoDB replica set, such as an Atlas cluster, for Prisma's MongoDB transaction support.
- Redis reachable from the application.
- Docker with the Compose plugin for the supporting-service commands below.

Run the following commands from this project directory.

### 1. Install dependencies

```bash
npm ci
```

### 2. Configure the environment

For a new checkout, copy the template, then replace its placeholders. If `.env` already exists,
update it without overwriting your database credentials.

```powershell
Copy-Item .env.example .env
```

On Linux or macOS, use `cp .env.example .env` for a new checkout.

```dotenv
PORT=3000
MONGODB_URL="mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER/shop_p4?retryWrites=true&w=majority"
POSTGRESQL_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/YOUR_DATABASE?schema=public"
SECRET_KEY="REPLACE_WITH_A_RANDOM_SECRET"
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
APP_NAME=backendcleants_p4
LOG_LEVEL=info
LOKI_ENABLED=false
LOKI_URL=http://127.0.0.1:3100
```

`MONGODB_URL`, `SECRET_KEY`, and a working Redis connection are needed for the active application.
`POSTGRESQL_URL` configures the alternative Prisma schema/client. `.env` is loaded through dotenv.
Generate a signing secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Keep real credentials private. `.gitignore` excludes local environment files, but a file already
tracked by Git remains tracked; review staged changes before committing.

### 3. Start supporting services

```bash
docker compose up -d redis
```

Redis stores the login state required by authenticated routes. With `LOKI_ENABLED=false`, logs go
to the console and the API makes no Loki connection. Follow the monitoring walkthrough below to
enable the full stack. MongoDB is provided separately; Compose does not include a MongoDB service.

### 4. Generate clients and prepare MongoDB

Generate both clients because the factory imports both generated modules:

```bash
npx prisma generate --schema=src/ca_infrastructure/database/prisma/mongodb/schema.mongodb.prisma
npx prisma generate --schema=src/ca_infrastructure/database/prisma/postgres/schema.postgres.prisma
npx prisma db push --schema=src/ca_infrastructure/database/prisma/mongodb/schema.mongodb.prisma
```

Review schema changes before applying them to an existing database. MongoDB uses `db push`;
Prisma Migrate is not used for the MongoDB provider. The PostgreSQL migration folder belongs to
the alternative relational implementation.

The repository includes generated clients, but regenerating them prepares Prisma's native
runtime for your platform. Generate and copy them again when changing operating systems or
container targets.

### 5. Start the API

```bash
npm run dev
```

The API base URL is **`http://localhost:3000/api`**. The application does not automatically seed users,
customers or products.

For a compiled local run, copy Prisma's generated runtime assets after compiling. TypeScript's
build alone does not copy those assets:

```powershell
npm run build
New-Item -ItemType Directory -Force -Path dist/ca_infrastructure/database/generated | Out-Null
Copy-Item -Path src/ca_infrastructure/database/generated/* -Destination dist/ca_infrastructure/database/generated -Recurse -Force
node dist/bin/www.js
```

The existing `npm start` uses `node -r ./dist/bin/www.js`; the direct command above makes the server
entry point explicit.

---

## 📡 API Reference

All paths below are relative to `http://localhost:3000`. Protected routes require
`Authorization: Bearer YOUR_ACCESS_TOKEN`.

| Method | Path | Purpose | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/user/register` | Register a user | Public |
| `POST` | `/api/user/login` | Login using email and password | Public |
| `POST` | `/api/user/refreshtoken` | Submit `refreshToken` for a new access token | JWT |
| `GET` | `/api/user/logout/:id` | Remove a user's Redis login entry | JWT |
| `GET` | `/api/user` | List users | JWT |
| `GET` | `/api/user/id/:id` | Read a user | JWT |
| `GET` | `/api/user/name/:name` | Find a user by username | JWT |
| `PUT`, `DELETE` | `/api/user/:id` | Update or delete a user | JWT |
| `GET`, `POST` | `/api/customer` | List or create customers | JWT |
| `GET` | `/api/customer/name/:name` | Find customers by name | JWT |
| `GET`, `PUT`, `DELETE` | `/api/customer/:id` | Read, update or delete a customer | JWT |
| `GET`, `POST` | `/api/product` | List or create products | JWT |
| `GET` | `/api/product/name/:name` | Find products by name | JWT |
| `GET`, `PUT`, `DELETE` | `/api/product/:id` | Read, update or delete a product | JWT |
| `GET`, `POST` | `/api/order` | List or create orders | JWT |
| `GET`, `PUT`, `DELETE` | `/api/order/:id` | Read, update or delete an order | JWT |
| `GET` | `/api/order/name/:name` | Intended customer-order lookup; currently mismatched parameters | JWT |
| `GET` | `/metrics` | Prometheus metrics | Public |

The order customer lookup route defines `:name`, but the controller reads `req.params.id`.
That endpoint needs correction before use. List endpoints currently return unpaginated data.

### Response behavior

Controllers return resource objects or arrays directly, without a shared response envelope.
Successful creates use `201`, reads and updates use `200`, and deletes use `204` with no response
body. A read using a valid but absent ObjectId can return `200` with `null`; missing-resource
handling is not consistently mapped to `404`. Repository failures and customer validation errors
are generally wrapped as `500` responses. An unknown URL returns Express's `404` response.

### Register and log in

```http
POST http://localhost:3000/api/user/register
Content-Type: application/json

{
  "username": "demo_user",
  "email": "demo@example.com",
  "password": "ExamplePassword123!",
  "role": "user",
  "status": "active"
}
```

```http
POST http://localhost:3000/api/user/login
Content-Type: application/json

{
  "email": "demo@example.com",
  "password": "ExamplePassword123!"
}
```

Save the returned `token` and `refreshToken`. Use `token` as the bearer credential.
Role and status are stored fields; the current routes do not enforce role-based permissions.

### Create a customer and product

```http
POST http://localhost:3000/api/customer
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "customerName": "Example Customer",
  "cemail": "customer@example.com",
  "phone": "+923001234567",
  "address": "1 Example Street",
  "city": "Karachi",
  "postalCode": "74000",
  "country": "PK"
}
```

```http
POST http://localhost:3000/api/product
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "productName": "Wireless Headphones",
  "productvendor": "Example Vendor",
  "productDescription": "Example catalog item",
  "quantityInStock": 10,
  "buyPrice": 100,
  "msrp": 150
}
```

Keep the returned `customerCode` and `productCode`. Resource IDs are MongoDB ObjectId strings,
normally 24 hexadecimal characters. Field spelling and singular route names are significant.

### Place an order

Replace the ID placeholders with the values returned above:

```http
POST http://localhost:3000/api/order
Authorization: Bearer YOUR_ACCESS_TOKEN
Content-Type: application/json

{
  "orderDate": "2026-11-07T09:00:00.000Z",
  "shippingDate": "2026-11-10T09:00:00.000Z",
  "status": "In process",
  "comments": "Example order",
  "total": 300,
  "paid": false,
  "customer": { "customerCode": "CUSTOMER_OBJECT_ID" },
  "orderItems": [
    {
      "quantity": 2,
      "status": "In process",
      "product": { "productCode": "PRODUCT_OBJECT_ID" }
    }
  ]
}
```

The current API accepts the total, status and payment flag from the caller. It does not calculate
totals, reserve stock, or enforce a commerce lifecycle. Order reads include the customer and items
with their products. Item updates use separate delete/create operations and are not wrapped with
the order update in a single explicit transaction.

For `PUT /api/order/:id`, a non-empty `orderItems` array replaces the existing items. Omitting the
array or supplying `[]` leaves them unchanged. The PUT response is assembled before replacement,
so it can contain the previous items; perform a fresh GET to read the resulting item list. Order
deletion removes items and then the order in separate calls; it is a hard delete.

### Using the Postman collection

[backend.postman_collection.json](backend.postman_collection.json) contains legacy request examples,
including incomplete requests. It is not a complete, current API contract or an automated test
suite. Use the route table and request examples above as the reference when configuring it:

1. Import the collection and check each request's method and URL against the route table.
2. Replace saved resource IDs with values created in your own database.
3. Register and log in, then set protected requests to **Bearer Token** using the returned `token`.
4. Replace example request bodies and remove unused or empty requests before running a collection.

The additional collection under [src/Testing/](src/Testing/) is also legacy learning material.

---

## 🐳 Monitoring & Logging: Beginner Walkthrough

There are two data paths:

```text
Metrics: API /metrics → Prometheus → Grafana
Logs:    API → Winston → Loki → Grafana
```

**Metrics** answer questions such as "How many requests are failing?" and "How slow is this route?"
**Logs** describe individual events. Use a response's `X-Request-Id` to find its completion log.
The walkthrough assumes you have completed the dependency, environment and Prisma setup above.

### 1. Start the learning stack

With Docker running, start only the services needed for this walkthrough:

```bash
docker compose up -d redis loki prometheus grafana
```

Compose starts supporting services. **It does not start the Express API.** Run the API locally
using the setup above. The default scrape configuration expects it on port **3000**.
If upgrading an existing stack, an old `promtail` container can be stopped with
`docker stop promtail`; the application now sends logs directly to Loki.

| Service | Host address / port | Purpose |
| :--- | :--- | :--- |
| Redis | `localhost:6379` | Cached login state |
| Loki | `http://localhost:3100` | Application log storage |
| Prometheus | `http://localhost:9090` | Metrics scraping |
| Grafana | `http://localhost:4000` | Metrics and log dashboards |
| PostgreSQL | `localhost:5432` | Alternative database for development |
| pgAdmin | `http://localhost:15432` | PostgreSQL administration |

PostgreSQL and pgAdmin are optional; they are not used by the active MongoDB repositories.

### 2. Enable Loki delivery and restart the API

Update these settings in your existing `.env`:

```dotenv
APP_NAME=backendcleants_p4
LOG_LEVEL=info
LOKI_ENABLED=true
LOKI_URL=http://127.0.0.1:3100
```

Restart `npm run dev` after editing `.env`; nodemon does not watch environment files by default.
Before sending example traffic, check that [Loki readiness](http://localhost:3100/ready) returns
`ready`. It can take a short time after the container starts.
Console logging works with either value of `LOKI_ENABLED`. Setting it to `false` removes the Loki
transport entirely. HTTP completion records contain a generated `requestId`, method, route
template, `statusCode`, `durationMs`, timestamp and service name. They omit headers, bodies, raw
IDs and query strings.

Keep `LOG_LEVEL=info` for the exercise: successful requests log at `info`, 4xx responses at `warn`,
and 5xx responses at `error`. These completion logs are written after a response finishes.
Other application debug statements and exception logs do not all use the same safe field set.

### 3. Check that Prometheus can reach the API

Open [the API metrics](http://localhost:3000/metrics). You should see text containing process
metrics such as `process_cpu_user_seconds_total`. HTTP histogram samples appear after requests.

Open [Prometheus targets](http://localhost:9090/targets) and check that the `api` target is **UP**.
Prometheus scrapes every 15 seconds. It reaches the host-run API through
`host.docker.internal:3000`; Compose adds a host-gateway mapping for Linux Docker Engine too.
If you change `PORT`, update [prometheus.yml](prometheus.yml) and restart Prometheus:

```bash
docker compose restart prometheus
```

### 4. Generate a little traffic

In another PowerShell terminal, run:

```powershell
1..10 | ForEach-Object { curl.exe -s -o NUL http://localhost:3000/api/product }
curl.exe -i http://localhost:3000/learning-missing-route
```

The product requests return **401** without a bearer token; the unknown path returns **404**.
Both are useful examples of client errors and produce request logs without needing seeded data.
Use the authenticated examples above to produce successful CRUD traffic. Allow at least two
scrapes (about 30 seconds) for rate charts, then repeat the traffic if necessary.

### 5. Open the ready-made dashboard

Open [the P4 dashboard](http://localhost:4000/d/p4-overview). On a fresh Grafana volume, sign in
with **admin / admin** and follow the password-change prompt. An existing volume keeps its
previous login credentials. The dashboard is also listed under **Dashboards → P4 Learning**.

The **P4 Prometheus** and **P4 Loki** data sources are provisioned automatically. The panels show:

| Panel | What to look for |
| :--- | :--- |
| API scrape status | **UP** confirms `/metrics` is reachable; it does not check database readiness |
| Requests per second | Traffic grouped by route template, keeping IDs and query strings out of labels |
| HTTP errors per second | Separate 4xx client errors and 5xx server errors |
| 95th percentile request duration | Estimated duration below which 95% of requests fall, displayed in seconds |
| Application logs | Expand a completion record to inspect status, duration and request ID |

In Grafana Explore, select **P4 Loki** and try:

```logql
{job="backendcleants_p4"} | json | statusCode >= 400
```

To find one request, copy its `X-Request-Id` response header and replace the placeholder:

```logql
{job="backendcleants_p4"} | json | requestId="YOUR_REQUEST_ID"
```

If you change `APP_NAME`, change the dashboard's **Log application (APP_NAME)** field to match.
The `unmatched` route groups unknown paths and failures occurring before a route is selected,
including API rate-limit rejections. `/metrics` is not logged or included in HTTP histograms,
and it remains available after the API rate limit is exhausted.

### 6. Edit the example or stop the stack

Dashboard and data-source files live in [monitoring/grafana/](monitoring/grafana/). Edit the JSON
dashboard to keep reusable changes, or use **Save as** in Grafana to create your own copy.
Restart Grafana after changing provisioning YAML:

```bash
docker compose restart grafana
docker compose stop redis loki prometheus grafana
```

The second command stops the learning services when you are done. Container logs can be inspected
with `docker compose logs --tail=50 loki prometheus grafana`.

A containerized API needs service-aware addresses for Loki and Redis. The Dockerfile is tutorial
scaffolding: it uses Node 18 and `npm install`, installs additional development tools, and does
not generate and copy the required Prisma runtime assets into `dist`. Preparing an API image also
requires generating Prisma engines compatible with its Linux/Alpine runtime.

There is currently no `.dockerignore`; the Dockerfile's `COPY . .` includes local files such as
`.env` when present in the build context. Review the build context, dependency installation,
runtime assets and secret handling before using the image or the release-publishing workflow.

---

## 🧪 Testing & Verification

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Run TypeScript with nodemon |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the existing compiled entry point; requires the build and Prisma asset-copy steps above |
| `npm run lint` | Run the configured ESLint checks |
| `npx tsc --noEmit` | Check types without producing build files |
| `npm run test:monitoring` | Check safe logs, route labels and metrics availability under API rate limiting |

The monitoring regression suite exercises the real Express middleware order using synthetic
routes and in-memory HTTP streams, without MongoDB, Redis or Docker. It does not verify dashboard
rendering or replace a full API integration suite. There is currently no general `npm test` script.
It also checks successful login without credential logging and verifies the issued JWT signatures;
its database, Redis and authentication-route dependencies are stubbed. It does not exercise real
database-backed registration, CRUD, token refresh or logout.

The lockfile includes the compatible `jwa` 1.4.2 patch, which avoids the removed `SlowBuffer` API
by using `crypto.timingSafeEqual`, so JWT signing works on the Node 26 runtime used for these checks.
See the [upstream patch notes](https://github.com/auth0/node-jwa/releases/tag/v1.4.2).

Import the Postman collection, adjust its URLs and credentials for your local setup, and exercise
registration, login, authenticated CRUD, token refresh and logout against a disposable database.

The [GitHub workflow](.github/workflows/docker-build-push.yml) builds and publishes images on a
published release. It does not run an API test suite. Its registry destinations and secrets need
review before reuse in another repository.

---

## 🚢 Current Limitations & Deployment Notes

- **Authorization:** JWT checks establish login state, but routes do not enforce user ownership
  or role permissions. Authenticated users can access other users' resource IDs.
- **Sensitive data:** request completion logs omit credentials and payloads, and login no longer
  prints passwords or user records. User API responses can still include password hashes;
  explicit response serialization remains necessary. Review error logs too: existing exception
  handlers include underlying error messages and stack traces, which may contain input values.
  Other debug statements still print user identifiers.
- **Validation and errors:** customer creation has Zod validation, but validation coverage is
  incomplete and customer validation failures are currently wrapped as HTTP 500 errors.
- **Commerce consistency:** prices/totals are floating-point values. Server-calculated totals,
  inventory reservations, idempotency, controlled payment transitions and atomic multi-step order
  updates require implementation.
- **Token lifecycle:** refresh requires a valid access token, token types are not distinguished,
  and cached login entries have no TTL. User updates write supplied passwords without the
  registration hashing step. Updating or deleting a user does not invalidate their Redis login
  entry; the JWT guard checks that cache rather than rereading the database.
- **Operations:** add readiness checks, graceful shutdown, managed secrets, TLS, backups and
  environment-specific configuration. Compose contains development credentials and several
  unpinned images; the Dockerfile's Node 18 base also needs review before deployment.
- **Metrics:** route templates bound label growth and scrapes bypass API rate limits. Scrape
  status measures HTTP reachability, not database readiness. The default setup is a local learning
  stack; production monitoring needs appropriate network access controls and retention settings.

---

## 🧯 Troubleshooting

| Symptom | What to check |
| :--- | :--- |
| JWT strategy fails at startup | Set a non-empty `SECRET_KEY` before starting the API |
| Protected requests return `401` | Send a valid bearer token and confirm the user's Redis entry exists |
| Refresh fails after access-token expiry | The refresh route currently requires an unexpired access token |
| Redis connection errors | Start Redis and check `REDIS_HOST`, `REDIS_PORT` and network reachability |
| MongoDB writes fail | Check the URL, database access permissions, network allowlist and replica-set support |
| Prisma module or engine missing in `dist` | Generate both clients and copy their complete runtime directories after building |
| Customer creation returns `500` | Check all required customer fields and email format; validation currently maps to `500` |
| Loki connection errors | Start Loki and check `LOKI_URL`, or set `LOKI_ENABLED=false` and restart the API |
| Loki exits with `permission denied` | On Linux, check that the `./var/loki` bind directory is writable by container UID 10001; preserve existing log data |
| No application logs in Grafana | Enable Loki, restart the API, send requests and check that the dashboard's application field matches `APP_NAME` |
| Prometheus target is down | Start the host API on port 3000; check `host.docker.internal` reachability and the configured target port |
| Grafana dashboard is missing | Recreate Grafana with `docker compose up -d grafana` to apply the provisioning mounts |
| Rate or latency chart is empty | Send traffic and wait at least 30 seconds; idle routes may have no latency value |
| Requests return `429` | API routes allow 100 requests per IP per 15 minutes; `/metrics` remains accessible |
| Port already in use | Stop the conflicting service or change `PORT` and the relevant client configuration |

---

## 📄 License

Copyright (c) 2024-2026 **Burhan Saadi**. Licensed under the [MIT License](LICENSE).

You may use, modify, distribute, and sell copies of this software, provided that the copyright
and permission notices are preserved as required by the license. Third-party components retain
their own licensing terms.

This is an educational project with the current limitations described above. Review the
[project disclaimer](DISCLAIMER.md) before adapting or deploying it. The disclaimer does not
change the permissions granted by the MIT License.
