import { ObjectId } from 'mongodb';
import { closeDatabase, connectDatabase } from '../config/database';
import { ensureIndexes } from '../config/indexes';
import env from '../config/env';
import {
  COLLECTIONS,
  type ReviewDocument,
  type StudioAmenity,
  type StudioCategory,
  type StudioDocument,
  type StudioHost,
  type StudioImage,
} from '../types/domain';
import logger from '../utils/logger';
import seedData from './seed-data.json';

interface SeedStudio {
  slug: string;
  title: string;
  category: string;
  location: string;
  hourlyRate: number;
  rating: number;
  reviewCount: number;
  capacity: number;
  description: string;
  overview: string[];
  deposit: number;
  amenities: string[];
  host: StudioHost;
  gallery: StudioImage[];
  createdAt: string;
}

interface SeedReview {
  id: string;
  studioSlug: string;
  authorName: string;
  rating: number;
  comment: string;
  projectType: string;
  createdAt: string;
}

/**
 * Loads the demo catalogue into the database named by `DB_NAME`.
 *
 * Additive and idempotent: studios are matched by slug and reviews by a stable
 * author id, and only ever inserted. Nothing is updated or deleted, so re-running
 * it leaves existing listings, edits, and bookings untouched.
 */
async function seed(): Promise<void> {
  const db = await connectDatabase();
  await ensureIndexes();
  logger.info(`Seeding database "${env.DB_NAME}"`);

  const studios = db.collection<StudioDocument>(COLLECTIONS.studios);
  const reviews = db.collection<ReviewDocument>(COLLECTIONS.reviews);
  let studiosAdded = 0;
  let reviewsAdded = 0;

  for (const seedStudio of seedData.studios as SeedStudio[]) {
    const createdAt = new Date(seedStudio.createdAt);
    const result = await studios.updateOne(
      { slug: seedStudio.slug },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          // Seed hosts aren't real accounts, so nobody can sign in and edit these.
          ownerId: `seed:${seedStudio.host.id}`,
          slug: seedStudio.slug,
          title: seedStudio.title,
          category: seedStudio.category as StudioCategory,
          location: seedStudio.location,
          hourlyRate: seedStudio.hourlyRate,
          deposit: seedStudio.deposit,
          capacity: seedStudio.capacity,
          description: seedStudio.description,
          overview: seedStudio.overview,
          amenities: seedStudio.amenities as StudioAmenity[],
          gallery: seedStudio.gallery,
          host: seedStudio.host,
          rating: seedStudio.rating,
          reviewCount: seedStudio.reviewCount,
          createdAt,
          updatedAt: createdAt,
        },
      },
      { upsert: true },
    );
    studiosAdded += result.upsertedCount;
  }

  for (const seedReview of seedData.reviews as SeedReview[]) {
    const studio = await studios.findOne({ slug: seedReview.studioSlug });
    if (!studio) continue;

    const studioId = studio._id.toHexString();
    const authorId = `seed:${seedReview.id}`;
    const result = await reviews.updateOne(
      { studioId, authorId },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          studioId,
          studioSlug: seedReview.studioSlug,
          authorId,
          authorName: seedReview.authorName,
          rating: seedReview.rating,
          comment: seedReview.comment,
          projectType: seedReview.projectType,
          createdAt: new Date(seedReview.createdAt),
        },
      },
      { upsert: true },
    );
    reviewsAdded += result.upsertedCount;
  }

  logger.info(`Seed complete: ${studiosAdded} studios and ${reviewsAdded} reviews added.`);
}

seed()
  .catch((error: unknown) => {
    logger.error('Seed failed', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDatabase());
