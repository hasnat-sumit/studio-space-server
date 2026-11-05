import { getDatabase } from './database';
import { COLLECTIONS } from '../types/domain';
import logger from '../utils/logger';

let pending: Promise<void> | null = null;

async function createIndexes(): Promise<void> {
  const db = getDatabase();

  await Promise.all([
    db.collection(COLLECTIONS.studios).createIndex({ slug: 1 }, { unique: true }),
    db.collection(COLLECTIONS.studios).createIndex({ ownerId: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.studios).createIndex({ rating: -1, reviewCount: -1 }),
    db.collection(COLLECTIONS.bookings).createIndex({ guestId: 1, date: -1 }),
    db.collection(COLLECTIONS.bookings).createIndex({ hostId: 1, date: -1 }),
    db.collection(COLLECTIONS.bookings).createIndex({ studioId: 1, date: 1 }),
    db
      .collection(COLLECTIONS.bookingSlots)
      .createIndex({ studioId: 1, date: 1, slot: 1 }, { unique: true }),
    db.collection(COLLECTIONS.bookingSlots).createIndex({ bookingId: 1 }),
    db.collection(COLLECTIONS.reviews).createIndex({ studioId: 1, authorId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.reviews).createIndex({ studioSlug: 1, createdAt: -1 }),
    db.collection(COLLECTIONS.profiles).createIndex({ userId: 1 }, { unique: true }),
    db.collection(COLLECTIONS.newsletterSubscribers).createIndex({ email: 1 }, { unique: true }),
  ]);
}

/** Idempotent; runs once per process. A failure is logged and retried on the next request. */
export function ensureIndexes(): Promise<void> {
  if (!pending) {
    pending = createIndexes().catch((error: unknown) => {
      pending = null;
      logger.warn(
        'Could not create MongoDB indexes',
        error instanceof Error ? error.message : error,
      );
    });
  }
  return pending;
}
