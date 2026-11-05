# StudioSpace Server

The REST API for StudioSpace, a peer-to-peer marketplace for booking creative spaces by the hour. It handles accounts, studio listings, bookings, reviews, and dashboard data.

The frontend lives in a separate repo: [studio-space](https://github.com/hasnat-sumit/studio-space).

## Features

- **Authentication:** email and password, plus optional Google sign-in, using Better Auth. The session is kept in a signed JWT in an `HttpOnly` cookie, and protected routes answer `401` without a valid session.
- **Image uploads:** signed-in hosts can upload listing photos, which are stored on imgbb.
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
npm run seed   # optional: adds demo studios, reviews, and the examiner account
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
| `IMGBB_API_KEY` | No | None | Turns on image uploads. Without it, hosts can still paste image URLs |
| `LOG_LEVEL` | No | `info` | `debug`, `info`, `warn`, or `error` |

In production, the server refuses to start if a required variable is missing. In development, it logs a warning instead, but sign-in and data routes still need both values to work.

For Google sign-in, create an OAuth client with the redirect URI `<BETTER_AUTH_URL>/api/auth/callback/google`.

