import { getDatabase } from '../config/database';
import { COLLECTIONS } from '../types/domain';

/** Idempotent, so signing up twice looks the same and reveals nothing about who's subscribed. */
export async function subscribe(email: string): Promise<void> {
  await getDatabase()
    .collection(COLLECTIONS.newsletterSubscribers)
    .updateOne({ email }, { $setOnInsert: { email, createdAt: new Date() } }, { upsert: true });
}
