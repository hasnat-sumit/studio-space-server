import { ObjectId, type Filter } from 'mongodb';
import { getDatabase } from '../config/database';
import { ApiError } from '../utils/api-error';
import { isDuplicateKeyError, toObjectId } from '../utils/validate';
import {
  COLLECTIONS,
  type AuthUser,
  type BookingDocument,
  type BookingSlotDocument,
  type BookingStatus,
  type BookingView,
} from '../types/domain';
import {
  minutesToTime,
  timeToMinutes,
  type CreateBookingInput,
  type ListBookingsQuery,
  type UpdateBookingStatus,
} from '../validators/booking.validators';
import { findStudioDocument, todayString } from './studio.service';

const SLOT_STEP_MINUTES = 30;
const MAX_DAYS_AHEAD = 365;
const DAY_MS = 24 * 60 * 60 * 1000;

function bookings() {
  return getDatabase().collection<BookingDocument>(COLLECTIONS.bookings);
}

function bookingSlots() {
  return getDatabase().collection<BookingSlotDocument>(COLLECTIONS.bookingSlots);
}

function dateOffset(days: number): string {
  return new Date(Date.now() + days * DAY_MS).toISOString().slice(0, 10);
}

/** Only the booking's two parties ever reach this, so the guest's email is safe to include. */
export function toBookingView(doc: BookingDocument, viewerId: string): BookingView {
  const { _id, createdAt, updatedAt, ...rest } = doc;
  return {
    ...rest,
    id: _id.toHexString(),
    role: doc.hostId === viewerId ? 'host' : 'guest',
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function slotsBetween(start: string, end: string): string[] {
  const slots: string[] = [];
  for (
    let minutes = timeToMinutes(start);
    minutes < timeToMinutes(end);
    minutes += SLOT_STEP_MINUTES
  ) {
    slots.push(minutesToTime(minutes));
  }
  return slots;
}

export async function createBooking(
  user: AuthUser,
  input: CreateBookingInput,
): Promise<BookingView> {
  // Dates are plain calendar strings with no timezone. Accept "yesterday" in UTC
  // so a user behind UTC can still book their own local today.
  if (input.date < dateOffset(-1)) {
    throw ApiError.badRequest("You can't book a date in the past.", {
      fieldErrors: { date: ["You can't book a date in the past."] },
    });
  }
  if (input.date > dateOffset(MAX_DAYS_AHEAD)) {
    throw ApiError.badRequest('Bookings open up to one year ahead.', {
      fieldErrors: { date: ['Bookings open up to one year ahead.'] },
    });
  }

  const studio = await findStudioDocument(input.studioId);
  if (studio.ownerId === user.id) {
    throw ApiError.forbidden("You can't book your own studio.");
  }

  const studioId = studio._id.toHexString();
  const bookingId = new ObjectId();
  const slots = slotsBetween(input.start, input.end).map(
    (slot): BookingSlotDocument => ({
      studioId,
      date: input.date,
      slot,
      bookingId: bookingId.toHexString(),
    }),
  );

  // Claim every slot first: the unique index rejects overlaps atomically.
  try {
    await bookingSlots().insertMany(slots, { ordered: true });
  } catch (error) {
    await bookingSlots().deleteMany({ bookingId: bookingId.toHexString() });
    if (isDuplicateKeyError(error)) {
      throw ApiError.conflict('Those times are already booked. Please choose another slot.');
    }
    throw error;
  }

  const hours = (timeToMinutes(input.end) - timeToMinutes(input.start)) / 60;
  const now = new Date();
  const doc: BookingDocument = {
    _id: bookingId,
    studioId,
    studioTitle: studio.title,
    studioSlug: studio.slug,
    studioImage: studio.gallery[0]?.src ?? '',
    studioLocation: studio.location,
    hostId: studio.ownerId,
    hostName: studio.host.name,
    guestId: user.id,
    guestName: user.name,
    guestEmail: user.email,
    date: input.date,
    start: input.start,
    end: input.end,
    hours,
    hourlyRate: studio.hourlyRate,
    // Prices are always computed here, never trusted from the client.
    subtotal: Math.round(hours * studio.hourlyRate * 100) / 100,
    deposit: studio.deposit,
    notes: input.notes,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await bookings().insertOne(doc);
  } catch (error) {
    await bookingSlots().deleteMany({ bookingId: bookingId.toHexString() });
    throw error;
  }

  return toBookingView(doc, user.id);
}

async function listBookings(
  filter: Filter<BookingDocument>,
  { status, limit, skip }: ListBookingsQuery,
  viewerId: string,
): Promise<BookingView[]> {
  const docs = await bookings()
    .find({ ...filter, ...(status ? { status } : {}) })
    // `_id` breaks ties, so paging stays stable across same-time bookings.
    .sort({ date: -1, start: -1, _id: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();
  return docs.map((doc) => toBookingView(doc, viewerId));
}

export function listGuestBookings(user: AuthUser, query: ListBookingsQuery): Promise<BookingView[]> {
  return listBookings({ guestId: user.id }, query, user.id);
}

export function listHostBookings(user: AuthUser, query: ListBookingsQuery): Promise<BookingView[]> {
  return listBookings({ hostId: user.id }, query, user.id);
}

async function findBookingForParty(user: AuthUser, id: string): Promise<BookingDocument> {
  const objectId = toObjectId(id);
  const doc = objectId ? await bookings().findOne({ _id: objectId }) : null;
  if (!doc) throw ApiError.notFound('Booking not found.');
  if (doc.guestId !== user.id && doc.hostId !== user.id) {
    throw ApiError.forbidden("You don't have access to this booking.");
  }
  return doc;
}

export async function getBooking(user: AuthUser, id: string): Promise<BookingView> {
  return toBookingView(await findBookingForParty(user, id), user.id);
}

/** Which status each role may move a booking to, and from where. */
const TRANSITIONS: Record<
  UpdateBookingStatus,
  { from: BookingStatus[]; roles: ('host' | 'guest')[] }
> = {
  confirmed: { from: ['pending'], roles: ['host'] },
  declined: { from: ['pending'], roles: ['host'] },
  cancelled: { from: ['pending', 'confirmed'], roles: ['host', 'guest'] },
  completed: { from: ['confirmed'], roles: ['host'] },
};

export async function updateBookingStatus(
  user: AuthUser,
  id: string,
  status: UpdateBookingStatus,
): Promise<BookingView> {
  const doc = await findBookingForParty(user, id);
  const role = doc.hostId === user.id ? 'host' : 'guest';
  const rule = TRANSITIONS[status];

  if (!rule.roles.includes(role)) {
    throw ApiError.forbidden(`Only the host can mark a booking as ${status}.`);
  }
  if (!rule.from.includes(doc.status)) {
    throw ApiError.conflict(`A ${doc.status} booking can't be marked as ${status}.`);
  }
  if (status === 'completed' && doc.date > todayString()) {
    throw ApiError.conflict("A booking can't be completed before its date.");
  }

  // The status filter makes the transition atomic if two requests race.
  const updated = await bookings().findOneAndUpdate(
    { _id: doc._id, status: { $in: rule.from } },
    { $set: { status, updatedAt: new Date() } },
    { returnDocument: 'after' },
  );
  if (!updated) {
    throw ApiError.conflict('This booking was just updated. Refresh and try again.');
  }

  if (status === 'declined' || status === 'cancelled') {
    await bookingSlots().deleteMany({ bookingId: doc._id.toHexString() });
  }

  return toBookingView(updated, user.id);
}

/** Reserved 30-minute slot starts for one studio on one date. */
export async function getBookedSlots(idOrSlug: string, date: string): Promise<string[]> {
  const studio = await findStudioDocument(idOrSlug);
  const slots = await bookingSlots()
    .find({ studioId: studio._id.toHexString(), date })
    .sort({ slot: 1 })
    .toArray();
  return slots.map((slot) => slot.slot);
}
