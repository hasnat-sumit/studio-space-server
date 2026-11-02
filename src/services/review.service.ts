import { ObjectId } from 'mongodb';
import { getDatabase } from '../config/database';
import { ApiError } from '../utils/api-error';
import { isDuplicateKeyError, toObjectId } from '../utils/validate';
import {
  COLLECTIONS,
  type AuthUser,
  type BookingDocument,
  type ReviewDocument,
  type ReviewView,
  type StudioDocument,
} from '../types/domain';
import type { CreateReviewInput } from '../validators/review.validators';
import { findStudioDocument } from './studio.service';

function reviews() {
  return getDatabase().collection<ReviewDocument>(COLLECTIONS.reviews);
}

function toReviewView(doc: ReviewDocument): ReviewView {
  const { _id, studioId: _studioId, createdAt, ...rest } = doc;
  return { ...rest, id: _id.toHexString(), createdAt: createdAt.toISOString() };
}

/**
 * Atomically folds one rating in or out of a studio's average. Incremental rather
 * than recomputed, so counts carried over from imported listings stay correct.
 */
async function applyRatingChange(studioId: string, rating: number, direction: 1 | -1): Promise<void> {
  const objectId = toObjectId(studioId);
  if (!objectId) return;

  const nextCount = { $max: [0, { $add: ['$reviewCount', direction] }] };
  await getDatabase()
    .collection<StudioDocument>(COLLECTIONS.studios)
    .updateOne({ _id: objectId }, [
      {
        $set: {
          rating: {
            $cond: [
              { $lte: [nextCount, 0] },
              0,
              {
                $round: [
                  {
                    $divide: [
                      {
                        $add: [
                          { $multiply: ['$rating', '$reviewCount'] },
                          { $multiply: [rating, direction] },
                        ],
                      },
                      nextCount,
                    ],
                  },
                  2,
                ],
              },
            ],
          },
          reviewCount: nextCount,
        },
      },
    ]);
}

export async function listReviews(idOrSlug: string): Promise<ReviewView[]> {
  const studio = await findStudioDocument(idOrSlug);
  const docs = await reviews().find({ studioSlug: studio.slug }).sort({ createdAt: -1 }).toArray();
  return docs.map(toReviewView);
}

export async function createReview(
  user: AuthUser,
  idOrSlug: string,
  input: CreateReviewInput,
): Promise<ReviewView> {
  const studio = await findStudioDocument(idOrSlug);
  const studioId = studio._id.toHexString();

  if (studio.ownerId === user.id) {
    throw ApiError.forbidden("You can't review your own studio.");
  }

  const completedBooking = await getDatabase()
    .collection<BookingDocument>(COLLECTIONS.bookings)
    .findOne({ studioId, guestId: user.id, status: 'completed' });
  if (!completedBooking) {
    throw ApiError.forbidden('You can review a studio after a completed booking there.');
  }

  const doc: ReviewDocument = {
    _id: new ObjectId(),
    studioId,
    studioSlug: studio.slug,
    authorId: user.id,
    authorName: user.name,
    rating: input.rating,
    comment: input.comment,
    projectType: input.projectType,
    createdAt: new Date(),
  };

  try {
    await reviews().insertOne(doc);
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw ApiError.conflict('You have already reviewed this studio.');
    }
    throw error;
  }

  await applyRatingChange(studioId, input.rating, 1);
  return toReviewView(doc);
}

export async function deleteReview(user: AuthUser, id: string): Promise<void> {
  const objectId = toObjectId(id);
  const doc = objectId ? await reviews().findOne({ _id: objectId }) : null;
  if (!doc) throw ApiError.notFound('Review not found.');
  if (doc.authorId !== user.id) {
    throw ApiError.forbidden('You can only delete your own reviews.');
  }

  const { deletedCount } = await reviews().deleteOne({ _id: doc._id, authorId: user.id });
  if (deletedCount > 0) await applyRatingChange(doc.studioId, doc.rating, -1);
}
