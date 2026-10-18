# Den Suite

Den Suite is a connected workspace for dental practices. The portal brings four products together:

- **Den Staff** — employee profiles and holiday requests.
- **Den Stock** — practice consumables and stock management.
- **Den Roaster** — weekly nurse and reception rotas.
- **Den OS** — the main dental practice and clinical software.

## Monorepo layout

```text
src/                    React web portal (Next.js)
apps/mobile/            React Native mobile app (Expo)
services/
  dentstaff/            Quarkus employee and leave service
  dentstock/            Quarkus stock service
  dentrota/             Quarkus rota service
  dentos/               Quarkus dental practice service
infra/postgres/         Local database initialisation
compose.yaml            Local PostgreSQL and service stack
```

Each backend service owns a separate PostgreSQL database. They currently expose a small service-info endpoint to establish independent service boundaries; product APIs, authentication, and clinical workflows are not implemented yet.

## Run the web portal

Requirements: Node.js LTS and npm.

```sh
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Open `Den Suite.code-workspace` in VS Code
to use the renamed project workspace and window title.
Run `npm run lint` to check the web and mobile source with Biome.

## Run the mobile app

Requirements: Node.js LTS and Expo Go or an iOS/Android simulator.

```sh
cd apps/mobile
npm install
npm start
```

Scan the QR code with Expo Go, or use the Expo CLI to launch an emulator.
Run `npm run typecheck` in `apps/mobile` to check the native app TypeScript.

## Run the backend services and PostgreSQL

Requirements: Docker Desktop with Compose.

Copy `.env.example` to `.env` and set unique local values for the Keycloak administrator
password, PostgreSQL password, and employer registration code before starting the stack. Do not
commit `.env`.

```sh
docker compose up --build
```

Den Staff is exposed on port 8085 by default (to avoid Expo Metro's usual 8081 port); Den Stock,
Den Roaster, and Den OS use ports 8082–8084.
Keycloak is available at [http://localhost:8180](http://localhost:8180); the browser uses its
hosted sign-in page and redirects authenticated users to `/workspace`. The Den Staff registration
API creates the identity in Keycloak and stores its practice-scoped profile in PostgreSQL.
The hosted sign-in page uses the Den Suite theme and displays username and password together, with
a registration link back to the Den Suite account-creation flow.

`EMPLOYER_JOIN_CODE` is a one-use bootstrap code for the first employer account. After an initial
account has been created, assign it the `DENTSUITE_ADMIN` realm role in the Den Suite Keycloak
realm: open the Keycloak Admin Console, select the `dentsuite` realm, open the user, choose
**Role mapping** → **Assign role**, and assign `DENTSUITE_ADMIN`. Then sign out and back in.
Den Suite administrators can open
[http://localhost:3000/admin/employers](http://localhost:3000/admin/employers) to issue employer
invitations with the practice/group name, single- or multiple-practice setup, employer email, and
an expiry from 1 to 30 days. The code is sent to that email, bound to the invited details, stored
only as a SHA-256 hash, and can be revoked before redemption. Den Admin can edit an active,
unused invitation; saving revokes the old code and issues a replacement with the updated details.
The replacement code is emailed and shown once in the invitation history during the current page
session. Existing codes cannot be recovered. The invite list records issuer, creation, redemption,
and revocation details.
After sign-in, administrators land on [http://localhost:3000/admin](http://localhost:3000/admin),
which lists registered practice groups, employer profile status, linked practice locations, and
account counts.

Local Compose sends mail to Mailpit; inspect messages at
[http://localhost:8025](http://localhost:8025). Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`,
`SMTP_PASSWORD`, `SMTP_START_TLS`, `SMTP_SSL`, `EMAIL_FROM`, and `DENTSUITE_PUBLIC_WEB_URL` for the
deployment's SMTP provider and public website URL. If email delivery fails, the newly created code
is disabled and the API reports the failure. If replacement delivery fails, the replacement code is
disabled; the previous code remains revoked, so Den Admin must issue a new invitation.

Owner registration requires only account details and the one-use Den Admin invitation code. The
code binds the owner to the invited email and sets the practice license; no practice name, address,
or single/multiple choice is collected during registration. After signing in, owners register
their first location at `/hr/practices`. A single-practice license allows one location; multiple
licenses allow additional locations. Den Admin can approve a license upgrade from the
administrator practice dashboard. Owners can then create email-bound, one-use manager codes for
locations. Owners and practice managers can create employee codes at `/hr/employees`; manager
registration codes assign the `PRACTICE_MANAGER` role automatically and verify the invited email.
Employee and manager codes expire after seven days, are shown only once, and are stored only as
SHA-256 hashes. Owners can edit an existing location's details from `/hr/practices`, including
locations created before address details were collected.

The web form requires an email address for password recovery. Configure SMTP in Keycloak separately
before expecting the hosted reset-password flow to deliver email.

The registration service currently uses the Keycloak bootstrap administrator credentials to
provision users, so this setup is for local development only. A deployment must use a
least-privilege Keycloak service account, HTTPS, managed secrets, rate limiting, email verification,
and a reviewed account recovery policy before accepting real users.

The staff schema is migrated automatically by Flyway when Den Staff starts. PostgreSQL's
`init.sql` database creation script runs only when its data volume is first initialized. If an
older local volume exists, create the `dentsuite_keycloak` database in PostgreSQL before starting
Keycloak.

The services' info endpoints are:

```text
http://localhost:8085/api/v1/info
http://localhost:8082/api/v1/info
http://localhost:8083/api/v1/info
http://localhost:8084/api/v1/info
```

Quarkus health checks are available at `/q/health`. PostgreSQL is exposed on host port 5433 by default to avoid colliding with a local PostgreSQL installation; change `POSTGRES_HOST_PORT` if needed. Set `POSTGRES_PASSWORD` in a root `.env` file before using this stack beyond local development.

## Current scope

Web sign-in and account registration use Keycloak; Den Staff stores employer, employee, practice,
and invitation records in PostgreSQL. Mobile sign-in and registration are not connected yet. The
other Quarkus services and most dashboard data remain prototypes. Before using real employee,
patient, or clinical data, add audit trails, data retention controls, backups, and a security/privacy
review appropriate to UK health data.
