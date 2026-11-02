# StudioSpace Backend - Agent Notes

Express 5 + TypeScript (CommonJS) + MongoDB native driver + Better Auth. Keep new features modular and follow the layout below.

## Rules that are easy to break

- **Tests never touch `.env`'s database**: they set `MONGODB_URI` to `mongodb-memory-server` before importing the app. Keep it that way; `.env` points at a live Atlas cluster.
- **Double-booking**: `booking_slots` has a unique index on (studioId, date, slot). Bookings claim their 30-minute slots there first, so overlaps fail atomically without transactions. Releasing a booking (declined/cancelled) must delete its slots.
- **CSRF**: production cookies are `SameSite=None`, so `rejectForeignOrigins` guards every write, including `/api/auth`. Don't rely on Better Auth's own origin check in tests: it is disabled when `NODE_ENV=test`.
- **Authorization** is ownership-based (no roles): every account can both book and host. Check `ownerId`/`hostId`/`guestId` in services.
- **Prices** are computed from the listing in `booking.service.ts`, never read from the request.
- **Better Auth** owns the `user`, `session`, `account`, and `verification` collections. Change users through its API; extra profile fields live in `profiles`.
- **Better Auth is ESM-only**: load it only through `import()` in `src/config/auth.ts`. A static import elsewhere works locally but crashes on Vercel with `ERR_REQUIRE_ESM`. To reproduce it, build and run `node --no-require-module dist/server.js`.
- **Responses**: success bodies are the bare resource (the client expects this); errors use the central shape.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Watch mode via `tsx` (`src/server.ts`) |
| `npm run build` | Compile to `dist/` |
| `npm start` | Run the compiled build |
| `npm run type-check` | `tsc --noEmit` - always run this before finishing a task |
| `npm test` | API tests on a throwaway in-memory MongoDB (first run downloads the binary) |
| `npm run seed` | Adds the demo catalogue to the database in `.env`. Additive and safe to re-run |

## Layout

```
src/
  config/       env loading + MongoDB connection utility
  routes/       one file per resource; mounted in routes/index.ts under /api
  controllers/  request/response handling only (no business logic)
  services/     business logic (no Express types)
  middleware/   cross-cutting concerns + centralized error handling
  validators/   zod schemas for request input
  types/        shared interfaces and type aliases
  utils/        ApiError, logger, generic helpers
  scripts/      one-off commands (seed)
  tests/        end-to-end API tests
  app.ts        Express app (middleware, routes, error handlers)
  server.ts     bootstrap: DB connection, listening, graceful shutdown
```

## Conventions

- **Env vars**: read them only from `src/config/env.ts`. Do not scatter `process.env` (the logger's `LOG_LEVEL` is the only exception).
- **Errors**: throw `ApiError` from services/controllers and forward with `next(err)`. Never send ad hoc error responses - the central handler always replies with `{ success: false, statusCode, message, details? }`. Unknown routes automatically return 404 through the same shape.
- **Database**: use `getDatabase()` from `src/config/database.ts`. A failed connection at boot is non-fatal (logged as a warning); `GET /api/health` reports `database.status`.
- **New endpoint**: controller -> service -> route file -> mount it in `src/routes/index.ts`.
- **Secrets** live only in `.env` (gitignored). Commit `.env.example` with placeholder values and keep it in sync when adding variables.
- Keep `app.ts` free of business logic; `server.ts` is only bootstrap/shutdown wiring.
