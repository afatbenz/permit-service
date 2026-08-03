# E-Permit Backend — Auth & Organization Module

NestJS + Sequelize (PostgreSQL) + Redis + JWT. Covers: **register**, **login**,
**create organization**, **invite organization**, **join organization**.

## 1. Configure environment

```bash
cp .env.example .env
```

Fill in with the values you already have:
```
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=password
DB_NAME=epermit
```
Plus Redis, JWT, and `AUTO_MIGRATE_ON_BOOT` settings (see `.env.example`).

Just make sure the `epermit` database itself exists first:
```bash
createdb -U postgres epermit
```
(Creating tables inside it is handled by the migration runner below — you
don't need to run any `.sql` file by hand.)

## 2. Install & run

```bash
npm install
npm run start:dev
```

With `AUTO_MIGRATE_ON_BOOT=true` (the default), pending files in
`src/database/migrations/*.sql` are applied automatically **before the
server starts listening** — this is what runs `001_init_auth_organization.sql`
(organizations, roles, users, etc.) and `002_organization_invites.sql`. Each
applied migration is recorded in a `schema_migrations` table, so it only
ever runs once, no matter how many times you restart the app.

```
[migrator] Running 2 pending migration(s): 001_init_auth_organization.sql, 002_organization_invites.sql
[migrator] Done.
E-Permit backend running on http://localhost:3000/api/v1
```

On the next boot, with nothing new to apply:
```
[migrator] Database schema is up to date, no pending migrations.
```

Then seed the fixed system roles (idempotent, safe to re-run):
```bash
npm run seed:roles
```

### Adding a new migration later
Drop a new file into `src/database/migrations/`, prefixed with the next
number (e.g. `003_add_permit_categories.sql`) so it runs in order. It'll be
picked up automatically on the next boot — no extra registration needed.

### Running migrations without booting the app
Useful for CI/CD or a Docker entrypoint step run before the app container
starts (recommended for multi-instance deployments — see the note in
`.env.example` about `AUTO_MIGRATE_ON_BOOT=false` in that scenario):
```bash
npm run migrate
```

---

## Flows implemented

### A. Self-register (Supervisor Sub-Con only) — `POST /auth/register`
Public endpoint. Requires a `registrationToken` — a token from a
`registration_links` row that an Org Admin generated for their organization
(this generation endpoint isn't built yet, see "Not yet built" below; for
now, insert a test row directly in `registration_links` to try this flow).

```json
{
  "name": "Dafit Khairul Akbar",
  "email": "dafit@example.com",
  "password": "SecurePass123",
  "phone": "081234567890",
  "subconCompanyId": "<uuid of a subcon_companies row>",
  "registrationToken": "<token from a registration_links row>"
}
```
Result: user created with `verification_status = pending`, `role = supervisor_subcon`,
`organization_id` and role resolved server-side from the link — never
supplied by the client.

### B. Login — `POST /auth/login`
Public endpoint.
```json
{ "email": "dafit@example.com", "password": "SecurePass123" }
```
Returns `{ accessToken, user }`. Use `Authorization: Bearer <accessToken>`
on every other request.

### C. Create Organization — `POST /organizations` (Super Admin only)
```json
{
  "organizationName": "PT. Jaya Obayashi",
  "adminName": "Org Admin JO",
  "adminEmail": "admin@jayaobayashi.com",
  "adminPassword": "SecurePass123",
  "adminPhone": "081200000000"
}
```
Creates the `organizations` row **and** its first `org_admin` user in one
transaction. `organization.code` is **auto-generated** — 5 consonant letters
from `organizationName` + 3 random digits (e.g. `"PT. Jaya Obayashi"` ->
`"JYBYS482"`), retried on collision. Not accepted as client input.

### D. Invite Organization — `POST /organizations/:id/invite` (Super Admin or Org Admin of that org)
```json
{ "email": "hse@jayaobayashi.com", "roleCode": "hse_maincon" }
```
Creates an `organization_invites` row and returns a `joinToken`. Email
delivery is stubbed — wire this to your mail provider/queue in production
instead of returning the token directly.

### E. Join Organization — `POST /organizations/join` (public, invite token required)
```json
{
  "inviteToken": "<joinToken from step D>",
  "name": "HSE Officer",
  "password": "SecurePass123",
  "phone": "081211111111"
}
```
Creates the user with `verification_status = pending` — **it cannot log in
yet**. A Super Admin must explicitly approve it first:

```
POST /organizations/users/:userId/approve   (Super Admin only)
POST /organizations/users/:userId/reject    (Super Admin only)
```

This is a deliberate extra security gate: an Org Admin invite alone isn't
enough to activate an account, even for privileged roles like HSE/CM. The
same approve/reject endpoints also apply to Sub-Con Supervisors who
self-registered via flow A.

> Note: `AuthService.login()` now blocks any account whose
> `verification_status` is `pending` or `rejected` — this is a behavior
> change from the earlier version of this backend, which didn't check
> `verification_status` at login at all.

---

## Not yet built (flagged as follow-ups)
- `POST /organizations/:id/registration-links` — to generate the self-register
  token used by flow A from the API (right now you'd insert that row by hand).
- Real email delivery for invites (currently returns the token in the response).
- `UserProfile` creation/management (model exists, no endpoints yet) —
  needed later for the reusable PDF signature discussed in the design doc.
- Fine-grained `permissions`/`role_permissions` — current RBAC is role-code
  based (`@Roles(RoleCode.X)`), which is enough for these 5 flows but will
  need the permission tables once the Permit module is built.

## Project structure
```
src/
  config/            # env loader + Joi validation
  common/             # enums, decorators, guards, filters, interceptors, base repository
  database/
    models/           # sequelize-typescript models
    migrations/        # raw SQL migrations (schema source of truth)
    seeders/           # standalone seed scripts
  redis/               # ioredis client + service
  modules/
    auth/              # register, login, JWT strategy
    users/              # shared user repository/service
    organization/       # create / invite / join
```
