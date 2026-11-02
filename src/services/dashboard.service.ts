import type { Filter } from 'mongodb';
import { getDatabase } from '../config/database';
import {
  COLLECTIONS,
  type AuthUser,
  type BookingDocument,
  type BookingStatus,
  type DashboardSummary,
  type StudioDocument,
} from '../types/domain';
import { toBookingView } from './booking.service';
import { todayString } from './studio.service';

const UPCOMING_LIMIT = 5;
const ACTIVE: BookingStatus[] = ['pending', 'confirmed'];
const BILLABLE: BookingStatus[] = ['confirmed', 'completed'];

export async function getDashboardSummary(user: AuthUser): Promise<DashboardSummary> {
  const db = getDatabase();
  const bookings = db.collection<BookingDocument>(COLLECTIONS.bookings);
  const today = todayString();

  const sumSubtotal = async (match: Filter<BookingDocument>): Promise<number> => {
    const [row] = await bookings
      .aggregate<{ total: number }>([
        { $match: match },
        { $group: { _id: null, total: { $sum: '$subtotal' } } },
      ])
      .toArray();
    return row?.total ?? 0;
  };

  const [
    listings,
    pendingRequests,
    hostUpcoming,
    earnings,
    guestUpcoming,
    totalBookings,
    totalSpent,
    upcoming,
  ] = await Promise.all([
    db.collection<StudioDocument>(COLLECTIONS.studios).countDocuments({ ownerId: user.id }),
    bookings.countDocuments({ hostId: user.id, status: 'pending', date: { $gte: today } }),
    bookings.countDocuments({ hostId: user.id, status: { $in: ACTIVE }, date: { $gte: today } }),
    sumSubtotal({ hostId: user.id, status: { $in: BILLABLE } }),
    bookings.countDocuments({ guestId: user.id, status: { $in: ACTIVE }, date: { $gte: today } }),
    bookings.countDocuments({ guestId: user.id }),
    sumSubtotal({ guestId: user.id, status: { $in: BILLABLE } }),
    bookings
      .find({
        $or: [{ hostId: user.id }, { guestId: user.id }],
        status: { $in: ACTIVE },
        date: { $gte: today },
      })
      .sort({ date: 1, start: 1 })
      .limit(UPCOMING_LIMIT)
      .toArray(),
  ]);

  return {
    hosting: { listings, pendingRequests, upcomingBookings: hostUpcoming, earnings },
    renting: { upcomingBookings: guestUpcoming, totalBookings, totalSpent },
    upcoming: upcoming.map((doc) => toBookingView(doc, user.id)),
  };
}
