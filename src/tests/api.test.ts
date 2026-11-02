import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { Express } from 'express';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { ObjectId, type Db } from 'mongodb';

/**
 * End-to-end API tests against a throwaway in-memory MongoDB. The environment is
 * set before the app is imported (dotenv never overrides existing values), so
 * these tests cannot reach the database configured in `.env`.
 */
const CLIENT_ORIGIN = 'http://localhost:3000';
const PHOTO = 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=900';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;
let db: Db;
let closeDatabase: () => Promise<void>;

interface ApiResult<T = any> {
  status: number;
  body: T;
  cookie: string | null;
}

async function call<T = any>(
  method: string,
  path: string,
  options: { body?: unknown; cookie?: string | null; origin?: string } = {},
): Promise<ApiResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      origin: options.origin ?? CLIENT_ORIGIN,
      ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.cookie ? { cookie: options.cookie } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const setCookie = response.headers.getSetCookie();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
    cookie: setCookie.length ? setCookie.map((value) => value.split(';')[0]).join('; ') : null,
  };
}

async function signUp(name: string, email: string): Promise<string> {
  const result = await call('POST', '/api/auth/sign-up/email', {
    body: { name, email, password: 'correct-horse-1' },
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.ok(result.cookie, 'sign-up should set a session cookie');
  return result.cookie;
}

function studioInput(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Test Studio',
    category: 'photography',
    location: 'Austin, Texas',
    hourlyRate: 80,
    deposit: 100,
    capacity: 10,
    description: 'A bright daylight studio for portraits.',
    overview: ['A bright daylight studio with a cyclorama.'],
    amenities: ['gigabit-wifi', 'cyclorama'],
    gallery: [{ src: PHOTO, alt: 'A studio camera' }],
    ...overrides,
  };
}

/** A calendar date `days` from now, so tests never go stale. */
function futureDate(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongo.getUri();
  process.env.DB_NAME = 'studiospace_test';
  process.env.CLIENT_URL = CLIENT_ORIGIN;
  process.env.BETTER_AUTH_SECRET = 'test-only-secret-test-only-secret-1234';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-client-secret';
  process.env.LOG_LEVEL = 'error';

  const database = await import('../config/database.js');
  db = await database.connectDatabase();
  closeDatabase = database.closeDatabase;

  // TypeScript mistypes a dynamic import of this CommonJS module's default export.
  const imported = (await import('../app.js')) as unknown as { default: Express };
  const app = imported.default;
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
  process.env.BETTER_AUTH_URL = baseUrl;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await closeDatabase();
  await mongo.stop();
});

describe('safety', () => {
  it('runs against the in-memory database, never the configured one', () => {
    assert.equal(db.databaseName, 'studiospace_test');
    assert.match(mongo.getUri(), /127\.0\.0\.1/);
  });
});

describe('health', () => {
  it('reports a connected database', async () => {
    const { status, body } = await call('GET', '/api/health');
    assert.equal(status, 200);
    assert.equal(body.database.status, 'connected');
  });

  it('sends the base URL to the health check', async () => {
    const { status, body } = await call('GET', '/');
    assert.equal(status, 200);
    assert.equal(body.database.status, 'connected');
  });
});

describe('authentication', () => {
  it('signs up, reads the session, signs out', async () => {
    const cookie = await signUp('Sam Session', 'session@example.com');

    const session = await call('GET', '/api/auth/get-session', { cookie });
    assert.equal(session.status, 200);
    assert.equal(session.body.user.email, 'session@example.com');

    const signOut = await call('POST', '/api/auth/sign-out', { cookie, body: {} });
    assert.equal(signOut.status, 200);

    const after = await call('GET', '/api/users/me', { cookie });
    assert.equal(after.status, 401);
  });

  it('signs in with the right password only', async () => {
    await signUp('Pat Password', 'password@example.com');

    const wrong = await call('POST', '/api/auth/sign-in/email', {
      body: { email: 'password@example.com', password: 'wrong-password-1' },
    });
    assert.equal(wrong.status, 401);

    const right = await call('POST', '/api/auth/sign-in/email', {
      body: { email: 'password@example.com', password: 'correct-horse-1' },
    });
    assert.equal(right.status, 200);
    assert.ok(right.cookie);
  });

  it('rejects duplicate emails and short passwords', async () => {
    await signUp('First User', 'dupe@example.com');
    const dupe = await call('POST', '/api/auth/sign-up/email', {
      body: { name: 'Second', email: 'dupe@example.com', password: 'correct-horse-1' },
    });
    assert.notEqual(dupe.status, 200);

    const short = await call('POST', '/api/auth/sign-up/email', {
      body: { name: 'Short', email: 'short@example.com', password: 'abc' },
    });
    assert.equal(short.status, 400);
  });

  it('starts Google sign-in with the API callback', async () => {
    const { status, body } = await call('POST', '/api/auth/sign-in/social', {
      body: { provider: 'google', callbackURL: `${CLIENT_ORIGIN}/dashboard` },
    });
    assert.equal(status, 200, JSON.stringify(body));

    const url = new URL(body.url);
    assert.equal(url.hostname, 'accounts.google.com');
    assert.equal(url.searchParams.get('client_id'), 'test-google-client-id');
    assert.match(url.searchParams.get('redirect_uri') ?? '', /\/api\/auth\/callback\/google$/);
  });

  it('never returns the password hash', async () => {
    const cookie = await signUp('Hash Check', 'hash@example.com');
    const session = await call('GET', '/api/auth/get-session', { cookie });
    assert.equal(JSON.stringify(session.body).includes('password'), false);
  });

  it('rejects cookie-authenticated auth requests from untrusted origins', async () => {
    const cookie = await signUp('Csrf Target', 'csrf@example.com');
    const result = await call('POST', '/api/auth/change-password', {
      origin: 'https://evil.example',
      cookie,
      body: { currentPassword: 'correct-horse-1', newPassword: 'attacker-chosen-1' },
    });
    assert.equal(result.status, 403);
  });

  it('rejects a cross-site form post to the API even with a valid session', async () => {
    const cookie = await signUp('Form Target', 'form@example.com');
    const response = await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        origin: 'https://evil.example',
        cookie,
        'content-type': 'application/x-www-form-urlencoded',
      },
      body: 'studioId=abc&date=2030-01-01&start=09:00&end=11:00',
    });
    assert.equal(response.status, 403);
  });
});

describe('protected routes', () => {
  const routes: [string, string][] = [
    ['GET', '/api/studios/mine'],
    ['POST', '/api/studios'],
    ['PATCH', '/api/studios/abc'],
    ['DELETE', '/api/studios/abc'],
    ['GET', '/api/bookings/mine'],
    ['GET', '/api/bookings/host'],
    ['POST', '/api/bookings'],
    ['GET', '/api/users/me'],
    ['PATCH', '/api/users/me'],
    ['GET', '/api/dashboard/summary'],
  ];

  for (const [method, path] of routes) {
    it(`${method} ${path} requires a session`, async () => {
      const result = await call(method, path, method === 'GET' ? {} : { body: {} });
      assert.equal(result.status, 401);
      assert.equal(result.body.success, false);
    });
  }
});

describe('studios', () => {
  let owner: string;
  let stranger: string;
  let studioId: string;

  before(async () => {
    owner = await signUp('Olive Owner', 'owner@example.com');
    stranger = await signUp('Stan Stranger', 'stranger@example.com');
  });

  it('creates a listing owned by the caller', async () => {
    const { status, body } = await call('POST', '/api/studios', { cookie: owner, body: studioInput() });
    assert.equal(status, 201);
    assert.equal(body.slug, 'test-studio');
    assert.equal(body.host.name, 'Olive Owner');
    assert.equal(body.image, PHOTO);
    assert.equal(body.rating, 0);
    assert.equal('ownerId' in body, false);
    assert.equal('_id' in body, false);
    studioId = body.id;
  });

  it('gives a duplicate title a unique slug', async () => {
    const { status, body } = await call('POST', '/api/studios', { cookie: owner, body: studioInput() });
    assert.equal(status, 201);
    assert.notEqual(body.slug, 'test-studio');
    assert.match(body.slug, /^test-studio-/);
  });

  it('returns field errors for invalid input', async () => {
    const { status, body } = await call('POST', '/api/studios', {
      cookie: owner,
      body: studioInput({ title: 'x', hourlyRate: -5, category: 'nope', gallery: [] }),
    });
    assert.equal(status, 400);
    for (const field of ['title', 'hourlyRate', 'category', 'gallery']) {
      assert.ok(body.details.fieldErrors[field], `missing error for ${field}`);
    }
  });

  it('rejects image hosts the client cannot render', async () => {
    const { status } = await call('POST', '/api/studios', {
      cookie: owner,
      body: studioInput({ gallery: [{ src: 'https://evil.example/a.jpg', alt: 'x' }] }),
    });
    assert.equal(status, 400);
  });

  it('ignores attempts to set server-owned fields', async () => {
    const { body } = await call('POST', '/api/studios', {
      cookie: owner,
      body: studioInput({ title: 'Sneaky Studio', rating: 5, reviewCount: 999, ownerId: 'someone' }),
    });
    assert.equal(body.rating, 0);
    assert.equal(body.reviewCount, 0);
  });

  it('reads by id and by slug, 404s otherwise', async () => {
    assert.equal((await call('GET', `/api/studios/${studioId}`)).body.id, studioId);
    assert.equal((await call('GET', '/api/studios/test-studio')).body.id, studioId);
    assert.equal((await call('GET', '/api/studios/no-such-studio')).status, 404);
  });

  it('filters, searches, and treats regex characters literally', async () => {
    const byQuery = await call('GET', '/api/studios?q=austin&category=photography');
    assert.ok(byQuery.body.length >= 1);

    const none = await call('GET', '/api/studios?category=music');
    assert.deepEqual(none.body, []);

    const regex = await call('GET', `/api/studios?q=${encodeURIComponent('.*')}`);
    assert.equal(regex.status, 200);
    assert.deepEqual(regex.body, []);

    assert.equal((await call('GET', '/api/studios?sort=bogus')).status, 400);
  });

  it('never lets NoSQL operators reach a query', async () => {
    // Express 5's simple query parser keeps `category[$ne]` as a literal, ignored key.
    const viaQuery = await call('GET', '/api/studios?category[$ne]=photography');
    assert.equal(viaQuery.status, 200);
    assert.ok(viaQuery.body.some((studio: any) => studio.category === 'photography'));

    const viaBody = await call('POST', '/api/bookings', {
      cookie: stranger,
      body: { studioId: { $ne: null }, date: futureDate(5), start: '09:00', end: '11:00' },
    });
    assert.equal(viaBody.status, 400);
  });

  it('lists only the caller’s listings under /mine', async () => {
    const mine = await call('GET', '/api/studios/mine', { cookie: owner });
    assert.ok(mine.body.length >= 2);
    const theirs = await call('GET', '/api/studios/mine', { cookie: stranger });
    assert.deepEqual(theirs.body, []);
  });

  it('only lets the owner edit or delete', async () => {
    const edit = await call('PATCH', `/api/studios/${studioId}`, {
      cookie: stranger,
      body: { title: 'Hijacked' },
    });
    assert.equal(edit.status, 403);
    assert.equal((await call('DELETE', `/api/studios/${studioId}`, { cookie: stranger })).status, 403);

    const ok = await call('PATCH', `/api/studios/${studioId}`, {
      cookie: owner,
      body: { hourlyRate: 95 },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.hourlyRate, 95);
    assert.equal(ok.body.title, 'Test Studio');
  });

  it('rejects empty updates', async () => {
    const { status } = await call('PATCH', `/api/studios/${studioId}`, { cookie: owner, body: {} });
    assert.equal(status, 400);
  });
});

describe('bookings', () => {
  let host: string;
  let guest: string;
  let other: string;
  let studioId: string;
  const date = futureDate(10);

  const book = (cookie: string, start: string, end: string, on = date) =>
    call('POST', '/api/bookings', { cookie, body: { studioId, date: on, start, end } });

  before(async () => {
    host = await signUp('Hana Host', 'host@example.com');
    guest = await signUp('Gus Guest', 'guest@example.com');
    other = await signUp('Oli Other', 'other@example.com');
    const studio = await call('POST', '/api/studios', {
      cookie: host,
      body: studioInput({ title: 'Booking Studio', hourlyRate: 50, deposit: 25 }),
    });
    studioId = studio.body.id;
  });

  it('computes the price on the server and starts as pending', async () => {
    const { status, body } = await call('POST', '/api/bookings', {
      cookie: guest,
      body: { studioId, date, start: '09:00', end: '11:30', subtotal: 1, hourlyRate: 1 },
    });
    assert.equal(status, 201);
    assert.equal(body.status, 'pending');
    assert.equal(body.hours, 2.5);
    assert.equal(body.subtotal, 125);
    assert.equal(body.deposit, 25);
    assert.equal(body.role, 'guest');
  });

  it('refuses overlapping times and leaves no partial reservation', async () => {
    const overlap = await book(other, '11:00', '13:00');
    assert.equal(overlap.status, 409);

    const free = await book(other, '11:30', '13:00');
    assert.equal(free.status, 201, 'the adjoining slot must remain bookable');

    const { body } = await call('GET', `/api/studios/${studioId}/availability?date=${date}`);
    assert.deepEqual(body.bookedSlots, ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30']);
  });

  it('allows exactly one winner when requests race for a slot', async () => {
    const raceDate = futureDate(11);
    const results = await Promise.all(
      Array.from({ length: 6 }, () => book(guest, '14:00', '16:00', raceDate)),
    );
    assert.equal(results.filter((result) => result.status === 201).length, 1);
    assert.equal(results.filter((result) => result.status === 409).length, 5);
  });

  it('validates dates and times', async () => {
    assert.equal((await book(guest, '09:00', '09:30', futureDate(20))).status, 400, 'under 1 hour');
    assert.equal((await book(guest, '12:00', '10:00', futureDate(20))).status, 400, 'end before start');
    assert.equal((await book(guest, '09:15', '11:00', futureDate(20))).status, 400, 'off-step');
    assert.equal((await book(guest, '05:00', '08:00', futureDate(20))).status, 400, 'too early');
    assert.equal((await book(guest, '09:00', '11:00', '2020-01-01')).status, 400, 'past date');
    assert.equal((await book(guest, '09:00', '11:00', '2030-02-31')).status, 400, 'impossible date');
    assert.equal((await book(guest, '09:00', '11:00', futureDate(400))).status, 400, 'too far ahead');
  });

  it('stops hosts booking their own studio', async () => {
    assert.equal((await book(host, '09:00', '11:00', futureDate(21))).status, 403);
  });

  it('404s for an unknown studio', async () => {
    const result = await call('POST', '/api/bookings', {
      cookie: guest,
      body: { studioId: 'missing-studio', date, start: '09:00', end: '11:00' },
    });
    assert.equal(result.status, 404);
  });

  it('enforces who can see and change a booking', async () => {
    const created = await book(guest, '09:00', '11:00', futureDate(30));
    const id = created.body.id;

    assert.equal((await call('GET', `/api/bookings/${id}`, { cookie: other })).status, 403);
    assert.equal((await call('GET', `/api/bookings/${id}`, { cookie: host })).body.role, 'host');

    const update = (cookie: string, status: string) =>
      call('PATCH', `/api/bookings/${id}/status`, { cookie, body: { status } });

    assert.equal((await update(other, 'cancelled')).status, 403);
    assert.equal((await update(guest, 'confirmed')).status, 403, 'guests cannot self-confirm');
    assert.equal((await update(host, 'pending')).status, 400, 'pending is not a target');
    assert.equal((await update(host, 'confirmed')).status, 200);
    assert.equal((await update(host, 'declined')).status, 409, 'confirmed cannot be declined');
    assert.equal((await update(host, 'completed')).status, 409, 'cannot complete before the date');
    assert.equal((await update(guest, 'cancelled')).status, 200);
    assert.equal((await update(guest, 'cancelled')).status, 409, 'already cancelled');
  });

  it('lets only the host complete a confirmed booking once its date arrives', async () => {
    // Past bookings can't be created through the API, so backdate one directly.
    const created = await book(guest, '09:00', '11:00', futureDate(32));
    const id = created.body.id;
    const update = (cookie: string, status: string) =>
      call('PATCH', `/api/bookings/${id}/status`, { cookie, body: { status } });

    assert.equal((await update(host, 'confirmed')).status, 200);
    await db.collection('bookings').updateOne({ _id: new ObjectId(id) }, { $set: { date: '2024-01-01' } });

    assert.equal((await update(guest, 'completed')).status, 403);
    const completed = await update(host, 'completed');
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, 'completed');

    const summary = await call('GET', '/api/dashboard/summary', { cookie: host });
    assert.ok(summary.body.hosting.earnings >= completed.body.subtotal);
  });

  it('releases the slot when cancelled or declined', async () => {
    const day = futureDate(31);
    const first = await book(guest, '09:00', '11:00', day);
    assert.equal((await book(other, '09:00', '11:00', day)).status, 409);

    const declined = await call('PATCH', `/api/bookings/${first.body.id}/status`, {
      cookie: host,
      body: { status: 'declined' },
    });
    assert.equal(declined.status, 200);
    assert.equal((await book(other, '09:00', '11:00', day)).status, 201);
  });

  it('separates guest and host lists, with a status filter', async () => {
    const mine = await call('GET', '/api/bookings/mine', { cookie: guest });
    assert.ok(mine.body.every((booking: any) => booking.role === 'guest'));

    const incoming = await call('GET', '/api/bookings/host', { cookie: host });
    assert.ok(incoming.body.length > 0);
    assert.ok(incoming.body.every((booking: any) => booking.role === 'host'));

    const pending = await call('GET', '/api/bookings/host?status=pending', { cookie: host });
    assert.ok(pending.body.every((booking: any) => booking.status === 'pending'));

    assert.deepEqual((await call('GET', '/api/bookings/host', { cookie: other })).body, []);
  });

  it('pages through bookings without gaps or repeats', async () => {
    const all = await call('GET', '/api/bookings/host', { cookie: host });
    assert.ok(all.body.length >= 4, 'needs a few bookings to page through');

    const first = await call('GET', '/api/bookings/host?limit=2', { cookie: host });
    const second = await call('GET', '/api/bookings/host?limit=2&skip=2', { cookie: host });
    assert.equal(first.body.length, 2);
    assert.deepEqual(
      [...first.body, ...second.body].map((booking: any) => booking.id),
      all.body.slice(0, 4).map((booking: any) => booking.id),
    );

    assert.equal((await call('GET', '/api/bookings/host?limit=0', { cookie: host })).status, 400);
    assert.equal((await call('GET', '/api/bookings/host?limit=1001', { cookie: host })).status, 400);
  });

  it('blocks deleting a listing with upcoming bookings', async () => {
    const result = await call('DELETE', `/api/studios/${studioId}`, { cookie: host });
    assert.equal(result.status, 409);
    assert.equal((await call('GET', `/api/studios/${studioId}`)).status, 200);
  });

  it('summarises both roles on the dashboard', async () => {
    const hostView = await call('GET', '/api/dashboard/summary', { cookie: host });
    assert.equal(hostView.status, 200);
    assert.equal(hostView.body.hosting.listings, 1);
    assert.ok(hostView.body.hosting.pendingRequests > 0);
    assert.ok(hostView.body.upcoming.length <= 5);

    const guestView = await call('GET', '/api/dashboard/summary', { cookie: guest });
    assert.equal(guestView.body.hosting.listings, 0);
    assert.ok(guestView.body.renting.totalBookings > 0);
  });
});

describe('deleting a listing', () => {
  it('removes a listing with no upcoming bookings', async () => {
    const owner = await signUp('Dee Delete', 'delete@example.com');
    const studio = await call('POST', '/api/studios', {
      cookie: owner,
      body: studioInput({ title: 'Disposable Studio' }),
    });
    const removed = await call('DELETE', `/api/studios/${studio.body.id}`, { cookie: owner });
    assert.equal(removed.status, 204);
    assert.equal((await call('GET', `/api/studios/${studio.body.id}`)).status, 404);
  });
});

describe('reviews', () => {
  let host: string;
  let guest: string;
  let guestId: string;
  let studioId: string;
  let reviewId: string;
  const review = { rating: 4, comment: 'Great light and a helpful host.', projectType: 'Portraits' };

  before(async () => {
    host = await signUp('Rae Host', 'reviewhost@example.com');
    guest = await signUp('Ren Guest', 'reviewguest@example.com');
    guestId = (await call('GET', '/api/users/me', { cookie: guest })).body.id;
    const studio = await call('POST', '/api/studios', {
      cookie: host,
      body: studioInput({ title: 'Review Studio' }),
    });
    studioId = studio.body.id;
  });

  it('requires a completed booking', async () => {
    const { status } = await call('POST', `/api/studios/${studioId}/reviews`, { cookie: guest, body: review });
    assert.equal(status, 403);
  });

  it('blocks owners reviewing their own studio', async () => {
    const { status } = await call('POST', `/api/studios/${studioId}/reviews`, { cookie: host, body: review });
    assert.equal(status, 403);
  });

  it('accepts one review after a completed stay and updates the rating', async () => {
    // Past bookings can't be created through the API, so insert the fixture directly.
    await db.collection('bookings').insertOne({ studioId, guestId, hostId: 'x', status: 'completed', date: '2024-01-01' });

    const created = await call('POST', `/api/studios/${studioId}/reviews`, { cookie: guest, body: review });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    reviewId = created.body.id;

    const studio = await call('GET', `/api/studios/${studioId}`);
    assert.equal(studio.body.rating, 4);
    assert.equal(studio.body.reviewCount, 1);

    const list = await call('GET', `/api/studios/${studioId}/reviews`);
    assert.equal(list.body.length, 1);
    assert.equal(list.body[0].authorName, 'Ren Guest');

    const again = await call('POST', `/api/studios/${studioId}/reviews`, { cookie: guest, body: review });
    assert.equal(again.status, 409);
  });

  it('only lets the author delete, and restores the rating', async () => {
    assert.equal((await call('DELETE', `/api/reviews/${reviewId}`, { cookie: host })).status, 403);
    assert.equal((await call('DELETE', `/api/reviews/${reviewId}`, { cookie: guest })).status, 204);

    const studio = await call('GET', `/api/studios/${studioId}`);
    assert.equal(studio.body.rating, 0);
    assert.equal(studio.body.reviewCount, 0);
  });
});

describe('profile', () => {
  it('reads, updates, and syncs the public host card', async () => {
    const cookie = await signUp('Paige Profile', 'profile@example.com');
    const studio = await call('POST', '/api/studios', {
      cookie,
      body: studioInput({ title: 'Profile Studio' }),
    });

    const initial = await call('GET', '/api/users/me', { cookie });
    assert.equal(initial.body.email, 'profile@example.com');
    assert.equal(initial.body.tagline, '');

    const updated = await call('PATCH', '/api/users/me', {
      cookie,
      body: { name: 'Paige Renamed', tagline: 'Portrait specialist', phone: '+1 (512) 555-0100' },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(updated.body.name, 'Paige Renamed');

    const session = await call('GET', '/api/auth/get-session', { cookie });
    assert.equal(session.body.user.name, 'Paige Renamed');

    const publicStudio = await call('GET', `/api/studios/${studio.body.id}`);
    assert.equal(publicStudio.body.host.name, 'Paige Renamed');
    assert.equal(publicStudio.body.host.tagline, 'Portrait specialist');
    assert.equal(JSON.stringify(publicStudio.body).includes('555-0100'), false, 'phone stays private');
    assert.equal(JSON.stringify(publicStudio.body).includes('profile@example.com'), false, 'email stays private');
  });

  it('cannot change email through the profile route', async () => {
    const cookie = await signUp('Eve Email', 'eve@example.com');
    const result = await call('PATCH', '/api/users/me', {
      cookie,
      body: { name: 'Eve Email', email: 'hijack@example.com' },
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.email, 'eve@example.com');
  });

  it('validates input', async () => {
    const cookie = await signUp('Val Valid', 'valid@example.com');
    const bad = await call('PATCH', '/api/users/me', { cookie, body: { name: 'x', phone: 'not-a-phone!' } });
    assert.equal(bad.status, 400);
    assert.ok(bad.body.details.fieldErrors.name);
    assert.ok(bad.body.details.fieldErrors.phone);
  });

  it('changes the password', async () => {
    const cookie = await signUp('Cass Change', 'change@example.com');
    const changed = await call('POST', '/api/auth/change-password', {
      cookie,
      body: { currentPassword: 'correct-horse-1', newPassword: 'new-horse-battery-2' },
    });
    assert.equal(changed.status, 200);

    const old = await call('POST', '/api/auth/sign-in/email', {
      body: { email: 'change@example.com', password: 'correct-horse-1' },
    });
    assert.equal(old.status, 401);

    const fresh = await call('POST', '/api/auth/sign-in/email', {
      body: { email: 'change@example.com', password: 'new-horse-battery-2' },
    });
    assert.equal(fresh.status, 200);
  });
});

describe('errors', () => {
  it('returns the standard shape for unknown routes and malformed JSON', async () => {
    const missing = await call('GET', '/api/nope');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.success, false);

    const response = await fetch(`${baseUrl}/api/studios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: CLIENT_ORIGIN },
      body: '{not json',
    });
    assert.equal(response.status, 400);
  });
});
