# StudioSpace Server

The REST API for StudioSpace, a peer-to-peer marketplace for booking creative spaces by the hour. It handles accounts, studio listings, bookings, reviews, and dashboard data.

The frontend lives in a separate repo: [studio-space](https://github.com/hasnat-sumit/studio-space).

## Features

- **Authentication:** email and password, plus optional Google sign-in, using Better Auth with `HttpOnly` session cookies.
- **Ownership-based access:** there are no roles. Every account can both book and host, and users can only change their own data.
- **No double-booking:** a unique database index on 30-minute slots makes overlapping requests fail atomically.
- **Server-side pricing:** totals are computed from the listing, never read from the request.
- **Validation and CSRF protection:** zod checks all input, and writes from other origins are rejected.
- **Graceful database failure:** the server still starts without MongoDB. `/api/health` reports the status and data routes return `503`.

## Tech stack

- Node.js and Express 5
- TypeScript
- MongoDB (native driver)
- Better Auth
- zod
- Node's built-in test runner with `mongodb-memory-server`

## Getting started

You need Node.js 22.12 or newer and a MongoDB database, either local or on Atlas.

```bash
git clone https://github.com/hasnat-sumit/studio-space-server.git
cd studio-space-server
npm install
cp .env.example .env
```

Fill in `.env`, using the table below, and then start the server:

```bash
npm run seed   # optional: adds demo studios and reviews
npm run dev
```

The API runs at http://localhost:5000. To check it, open http://localhost:5000/api/health.

To generate a value for `BETTER_AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Environment variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `MONGODB_URI` | In production | None | MongoDB connection string |
| `BETTER_AUTH_SECRET` | In production | None | Long random secret, at least 32 characters |
| `NODE_ENV` | No | `development` | Runtime environment |
| `PORT` | No | `5000` | Port to listen on |
| `DB_NAME` | No | `studiospace` | Database name |
| `CLIENT_URL` | No | `http://localhost:3000` | Exact client origin, with no trailing slash. Used for CORS and CSRF checks |
| `BETTER_AUTH_URL` | No | `http://localhost:5000` | Public URL browsers use to reach `/api/auth`, with no path |
| `GOOGLE_CLIENT_ID` | No | None | Turns on Google sign-in, together with the secret |
| `GOOGLE_CLIENT_SECRET` | No | None | Turns on Google sign-in, together with the ID |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, or `error` |

In production, the server refuses to start if a required variable is missing. In development, it logs a warning instead, but sign-in and data routes still need both values to work.

For Google sign-in, create an OAuth client with the redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start in watch mode |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run type-check` | Type-check without emitting files |
| `npm test` | Run the API tests |
| `npm run seed` | Add the demo catalogue to the database in `.env` |

**Tests** run on a temporary in-memory MongoDB and never touch the database in `.env`. The first run downloads the MongoDB binary.

**The seed script** writes to the database in `.env`, so check that value first. It only inserts missing records, so it is safe to re-run and won't change existing data.

## API reference

All routes start with `/api`. "Yes" means a signed-in session is required, and "Owner", "Author", and "Host or guest" mean it must also be that user.

### Health and auth

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/health` | No | Service and database status |
| POST | `/auth/sign-up/email` | No | Create an account and sign in (`name`, `email`, `password` of 8+ characters) |
| POST | `/auth/sign-in/email` | No | Sign in (`email`, `password`) |
| POST | `/auth/sign-in/social` | No | Start Google sign-in (`provider`, `callbackURL`) |
| POST | `/auth/sign-out` | Yes | Sign out |
| GET | `/auth/get-session` | No | Get the current session |
| POST | `/auth/change-password` | Yes | Change password (`currentPassword`, `newPassword`) |

Better Auth provides the `/auth` routes.

### Studios

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/studios` | No | Search and list studios |
| GET | `/studios/featured` | No | Top-rated studios (`limit`, default 6, max 24) |
| GET | `/studios/mine` | Yes | My listings |
| GET | `/studios/:idOrSlug` | No | Get one studio |
| GET | `/studios/:idOrSlug/availability` | No | Booked slots on a date (`date=YYYY-MM-DD`) |
| POST | `/studios` | Yes | Create a listing |
| PATCH | `/studios/:id` | Owner | Update any listing fields |
| DELETE | `/studios/:id` | Owner | Delete a listing and its reviews (`409` if it has upcoming bookings) |

`GET /studios` accepts these query parameters:

| Parameter | Values |
| --- | --- |
| `q` | Search text |
| `category` | `photography`, `sound-stage`, `podcast`, `music`, or `art` |
| `minPrice`, `maxPrice`, `minCapacity` | Numbers |
| `sort` | `rating` (default), `price-asc`, `price-desc`, or `newest` |
| `limit`, `skip` | Paging (`limit` default and max are both 200) |

Example `POST /studios` body:

```json
{
  "title": "Daylight Loft",
  "category": "photography",
  "location": "Brooklyn, NY",
  "hourlyRate": 85,
  "deposit": 100,
  "capacity": 10,
  "description": "A bright loft with a white cyclorama.",
  "overview": ["North-facing windows and a full strobe kit."],
  "amenities": [],
  "gallery": [
    { "src": "https://images.unsplash.com/photo-1452587925148-ce544e77e70d", "alt": "Camera on a table" }
  ]
}
```

Gallery images must be `https://images.unsplash.com` links, with 1 to 8 per listing. The allowed amenities are listed in `src/types/domain.ts`.

### Bookings

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| POST | `/bookings` | Yes | Request a booking (`studioId`, `date`, `start`, `end`, optional `notes`) |
| GET | `/bookings/mine` | Yes | Bookings I made (`status`, `limit`, `skip`) |
| GET | `/bookings/host` | Yes | Requests for my studios (`status`, `limit`, `skip`) |
| GET | `/bookings/:id` | Host or guest | Get one booking |
| PATCH | `/bookings/:id/status` | Host or guest | Change the status (`status`) |

Booking times run from `07:00` to `22:00` in 30-minute steps, and a booking must last at least 1 hour. Overlapping requests get `409`, and booking your own studio gets `403`.

| Change | Who | Allowed from |
| --- | --- | --- |
| `confirmed` | Host | `pending` |
| `declined` | Host | `pending` |
| `completed` | Host | `confirmed`, on or after the booking date |
| `cancelled` | Host or guest | `pending` or `confirmed` |

Declining or cancelling frees the booked slots.

### Reviews

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/studios/:idOrSlug/reviews` | No | List reviews, newest first |
| POST | `/studios/:idOrSlug/reviews` | Yes | Create a review (`rating` 1-5, `comment`, `projectType`) |
| DELETE | `/reviews/:id` | Author | Delete my review |

A review needs a completed booking at that studio. Each user can leave one per studio, and not on their own listing.

### Account

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/users/me` | Yes | Get my profile |
| PATCH | `/users/me` | Yes | Update `name`, `tagline`, `bio`, `location`, `phone`, or `responseNote` |
| GET | `/dashboard/summary` | Yes | Dashboard stats and upcoming sessions |

### Responses

Successful responses return the resource itself, with no wrapper. Errors always have this shape:

```json
{
  "success": false,
  "statusCode": 400,
  "message": "Please check the highlighted fields.",
  "details": {
    "fieldErrors": { "title": ["Title must be at least 3 characters."] }
  }
}
```

`details` is optional. Validation errors use it for per-field messages.

## Project structure

```
src/
├── config/        Environment, database, indexes, and Better Auth
├── routes/        One file per resource, mounted in routes/index.ts
├── controllers/   Request and response handling
├── services/      Business logic
├── middleware/    Auth, database guard, CSRF guard, and error handling
├── validators/    zod schemas
├── types/         Shared types
├── utils/         ApiError, logger, and helpers
├── scripts/       Seed script and data
├── tests/         End-to-end API tests
├── app.ts         Express app setup
└── server.ts      Startup and shutdown
```

To add an endpoint, write the controller and service, add the route file, and mount it in `src/routes/index.ts`. `AGENTS.md` has the detailed conventions, including mistakes that are easy to make here.

## Deployment

Use any host that runs Node.js 22.12 or newer.

- **Build command:** `npm ci && npm run build`
- **Start command:** `npm start`

Set these variables:

| Variable | Value |
| --- | --- |
| `NODE_ENV` | `production` |
| `MONGODB_URI` | Your production connection string. On Atlas, also allow the host's IPs under Network Access |
| `DB_NAME` | Your database name |
| `BETTER_AUTH_SECRET` | A new random value, different from development |
| `CLIENT_URL` | The client's URL |
| `BETTER_AUTH_URL` | **Also the client's URL**, not the API's |

`BETTER_AUTH_URL` points at the client because the client rewrites `/api` to this server, so browsers only ever talk to the client's domain. If it points at the API instead, session cookies and Google sign-in break.

For the same reason, the production Google redirect URI is `<client URL>/api/auth/callback/google`.

## Known limitations

- **Timezones:** booking dates have no timezone and "today" uses UTC, so dates near midnight can be accepted or rejected a few hours off.
- **Rate limiting:** Better Auth's rate limits are held in memory per instance, so running several instances needs shared storage.
- **Not built:** payments, photo uploads, password reset, and email verification.
