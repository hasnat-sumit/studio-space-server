import { ObjectId, type Filter } from 'mongodb';
import { getDatabase } from '../config/database';
import { ApiError } from '../utils/api-error';
import { isDuplicateKeyError, toObjectId } from '../utils/validate';
import {
  COLLECTIONS,
  type AuthUser,
  type BookingDocument,
  type StudioDocument,
  type StudioView,
} from '../types/domain';
import type {
  CreateStudioInput,
  ListStudiosQuery,
  UpdateStudioInput,
} from '../validators/studio.validators';
import { getProfileDocument } from './profile.service';

const DEFAULT_TAGLINE = 'StudioSpace host';
const DEFAULT_RESPONSE_NOTE = 'Usually responds within a day';

function studios() {
  return getDatabase().collection<StudioDocument>(COLLECTIONS.studios);
}

export function toStudioView(doc: StudioDocument): StudioView {
  const { _id, ownerId: _ownerId, ownerEmail: _ownerEmail, updatedAt: _updatedAt, createdAt, ...rest } = doc;
  const cover = doc.gallery[0];
  return {
    ...rest,
    id: _id.toHexString(),
    image: cover?.src ?? '',
    imageAlt: cover?.alt ?? doc.title,
    createdAt: createdAt.toISOString(),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || 'studio';
}

/** Filter matching a studio by its id or slug (public URLs use either). */
function studioRefFilter(idOrSlug: string): Filter<StudioDocument> {
  const objectId = toObjectId(idOrSlug);
  return objectId ? { $or: [{ _id: objectId }, { slug: idOrSlug }] } : { slug: idOrSlug };
}

const SORTS = {
  rating: { rating: -1, reviewCount: -1 },
  'price-asc': { hourlyRate: 1 },
  'price-desc': { hourlyRate: -1 },
  newest: { createdAt: -1 },
} as const;

export async function listStudios(query: ListStudiosQuery): Promise<StudioView[]> {
  const filter: Filter<StudioDocument> = {};

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: pattern }, { location: pattern }];
  }
  if (query.category) filter.category = query.category;
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    filter.hourlyRate = {
      ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
    };
  }
  if (query.minCapacity !== undefined) filter.capacity = { $gte: query.minCapacity };

  const docs = await studios()
    .find(filter)
    .sort(SORTS[query.sort])
    .skip(query.skip)
    .limit(query.limit)
    .toArray();
  return docs.map(toStudioView);
}

export async function listFeaturedStudios(limit: number): Promise<StudioView[]> {
  const docs = await studios().find().sort(SORTS.rating).limit(limit).toArray();
  return docs.map(toStudioView);
}

export async function listStudiosByOwner(ownerId: string): Promise<StudioView[]> {
  const docs = await studios().find({ ownerId }).sort({ createdAt: -1 }).toArray();
  return docs.map(toStudioView);
}

export async function findStudioDocument(idOrSlug: string): Promise<StudioDocument> {
  const doc = await studios().findOne(studioRefFilter(idOrSlug));
  if (!doc) throw ApiError.notFound('Studio not found.');
  return doc;
}

async function findOwnedStudio(user: AuthUser, id: string): Promise<StudioDocument> {
  const doc = await findStudioDocument(id);
  if (doc.ownerId !== user.id) {
    throw ApiError.forbidden('You can only manage your own studio listings.');
  }
  return doc;
}

export async function createStudio(user: AuthUser, input: CreateStudioInput): Promise<StudioView> {
  const profile = await getProfileDocument(user.id);
  const now = new Date();
  const base = slugify(input.title);

  const doc: StudioDocument = {
    _id: new ObjectId(),
    ownerId: user.id,
    ownerEmail: user.email,
    slug: base,
    ...input,
    host: {
      id: user.id,
      name: user.name,
      tagline: profile?.tagline || DEFAULT_TAGLINE,
      responseNote: profile?.responseNote || DEFAULT_RESPONSE_NOTE,
      joinedYear: user.createdAt.getFullYear(),
    },
    rating: 0,
    reviewCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  // The unique slug index is the source of truth; retry with a suffix on collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await studios().insertOne(doc);
      return toStudioView(doc);
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
      doc.slug = `${base}-${new ObjectId().toHexString().slice(-6)}`;
    }
  }
  throw ApiError.conflict('Could not generate a unique address for this studio. Try another title.');
}

export async function updateStudio(
  user: AuthUser,
  id: string,
  input: UpdateStudioInput,
): Promise<StudioView> {
  const existing = await findOwnedStudio(user, id);
  const updated = await studios().findOneAndUpdate(
    { _id: existing._id, ownerId: user.id },
    { $set: { ...input, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!updated) throw ApiError.notFound('Studio not found.');
  return toStudioView(updated);
}

/** Today in UTC as `YYYY-MM-DD`; dates are stored as plain calendar strings. */
export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function deleteStudio(user: AuthUser, id: string): Promise<void> {
  const existing = await findOwnedStudio(user, id);
  const db = getDatabase();
  const studioId = existing._id.toHexString();

  const activeBookings = await db.collection<BookingDocument>(COLLECTIONS.bookings).countDocuments({
    studioId,
    status: { $in: ['pending', 'confirmed'] },
    date: { $gte: todayString() },
  });
  if (activeBookings > 0) {
    throw ApiError.conflict(
      `This listing has ${activeBookings} upcoming booking${activeBookings === 1 ? '' : 's'}. Resolve them before deleting it.`,
    );
  }

  await studios().deleteOne({ _id: existing._id, ownerId: user.id });
  // Past bookings stay: they carry their own snapshot of the listing.
  await Promise.all([
    db.collection(COLLECTIONS.reviews).deleteMany({ studioId }),
    db.collection(COLLECTIONS.bookingSlots).deleteMany({ studioId }),
  ]);
}
