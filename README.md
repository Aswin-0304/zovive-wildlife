# ZOVIVE Wildlife Monitoring System

React + Vite dashboard, Spring Boot 3.3.5 REST API, and MySQL. The sample system has wildlife records, but no live camera ingestion or AI detection service.

## Authentication

- Spring Security authenticates usernames or email addresses with BCrypt (work factor 12).
- The API issues signed JWT access tokens in `HttpOnly`, `SameSite=Strict` cookies. The frontend never stores the access token in local or session storage.
- Mutating API requests require a CSRF token obtained from `GET /api/auth/csrf` and sent as `X-XSRF-TOKEN`.
- Access tokens last 2 hours by default or 7 days when “Remember this device” is selected. Logout revokes the active token in the database.
- `ADMIN` can use all workspace routes and `/api/admin/**`. `FOREST_OFFICER` can use monitoring, detections, alerts, cameras, and analytics; admin pages and admin endpoints are denied.
- There is no public registration route. Create the first administrator with the environment variables below.

### Initial administrator and local configuration (PowerShell)

For direct MySQL setup, start MySQL and create/allow the `wildlife` database user. The guided local script below can also use a development-only H2 database when MySQL is unavailable.

For guided startup on Windows, open PowerShell in `backend` and run `.\start-local.ps1`. When MySQL is listening on port 3306, the script uses MySQL. If it is unavailable, it starts a persistent H2 database under `backend/data` for local development; the default and production configuration remains MySQL. The script generates a local JWT key and privately prompts for the first admin username, email, and password (and MySQL credentials when MySQL is used). The bootstrap values create the first admin only when the database has no admin yet; they do not reset an existing account.

```powershell
cd "D:\exp 10\wildlife-monitoring-system\wms\backend"
$random = [Security.Cryptography.RandomNumberGenerator]::Create()
$keyBytes = New-Object byte[] 32
$random.GetBytes($keyBytes)
$env:JWT_SECRET = [Convert]::ToBase64String($keyBytes)
$env:AUTH_COOKIE_SECURE = "false" # Local HTTP only. Set true behind HTTPS.
$env:CORS_ORIGINS = "http://localhost:5173"
$env:DB_HOST = "localhost"
$env:DB_PORT = "3306"
$env:DB_NAME = "wildlife"
$env:DB_USERNAME = "root"
$secureDbPassword = Read-Host "MySQL password" -AsSecureString
$dbPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureDbPassword)
$env:DB_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($dbPtr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($dbPtr)
$env:INITIAL_ADMIN_USERNAME = "zovive-admin"
$env:INITIAL_ADMIN_EMAIL = "admin@example.com"
$secureAdminPassword = Read-Host "New administrator password (16–72 UTF-8 bytes)" -AsSecureString
$adminPtr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureAdminPassword)
$env:INITIAL_ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($adminPtr)
[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($adminPtr)
mvn spring-boot:run
```

The first startup creates the admin only if no `ADMIN` account exists. The password is BCrypt-hashed before it is saved. Remove `INITIAL_ADMIN_PASSWORD` from the shell after bootstrap. Do not place production passwords or `JWT_SECRET` in source files, frontend `VITE_*` variables, or Git. For production, supply secrets through the hosting provider, set `AUTH_COOKIE_SECURE=true`, set `CORS_ORIGINS` to the exact HTTPS frontend origin, and use HTTPS.

There is intentionally no public sign-up page. After the first administrator can sign in, open **Settings → Register a field operator** to create `FOREST_OFFICER` accounts (or another administrator). The admin chooses an initial password of at least 16 characters and shares it with that operator using a secure channel. The operator then signs in with their username or email. If the backend reports “not responding,” start MySQL first, then start Spring Boot in its own terminal; Vite does not start the API automatically.

The datasource password has no source-code default. `database/schema.sql` documents the tables; JPA creates/updates them with `spring.jpa.hibernate.ddl-auto=update`.

### Start the frontend

In a second terminal:

```powershell
cd "D:\exp 10\wildlife-monitoring-system\wms\frontend"
npm install
npm run dev
```

Open `http://localhost:5173`. `frontend/.env.example` contains only public frontend configuration; `VITE_API_URL` defaults to `http://localhost:8080`.

## Authentication endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/auth/csrf` | Return a CSRF token and set its cookie |
| POST | `/api/auth/login` | Validate credentials and issue the HttpOnly JWT cookie |
| GET | `/api/auth/me` | Return the authenticated user's public profile |
| POST | `/api/auth/logout` | Revoke the current token and clear the cookie |
| GET/POST | `/api/admin/users` | Admin-only user list/provisioning for `ADMIN` or `FOREST_OFFICER`; password hashes are never returned |

Login body: `{"identifier":"username-or-email","password":"…","rememberMe":false}`. Login and logout POSTs require the CSRF cookie and matching `X-XSRF-TOKEN` header.

## Existing wildlife API

All `/api/**` endpoints except CSRF and login require an authenticated role. Both roles retain monitoring and CRUD access to existing records.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/detections?species=&from=YYYY-MM-DD&to=YYYY-MM-DD` | List/search/filter detections |
| POST/PUT/DELETE | `/api/detections[/{id}]` | Manage detections |
| GET/POST/PUT/DELETE | `/api/cameras[/{id}]` | Manage cameras |
| GET/POST | `/api/alerts` | List/create alerts |
| PUT | `/api/alerts/{id}` | Update alert status |
| GET | `/api/dashboard/stats` | Dashboard summary |

## Verification

Run backend integration tests (uses an isolated in-memory H2 database; it does not need or change your MySQL data):

```powershell
cd "D:\exp 10\wildlife-monitoring-system\wms\backend"
mvn test
```

The integration suite verifies valid and invalid login, cookie attributes and token non-disclosure, protected APIs, logout revocation, admin/officer permissions, and existing detection, camera, and alert CRUD. Build the frontend with:

```powershell
cd "D:\exp 10\wildlife-monitoring-system\wms\frontend"
npm run build
```

Self-service password recovery is not enabled because no verified email delivery/reset service is configured; the login UI directs users to their administrator. Operational login rate limiting should also be enforced at the reverse proxy or API gateway before public production exposure.
