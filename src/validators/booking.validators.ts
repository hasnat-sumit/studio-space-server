import { z } from 'zod';
import { BOOKING_STATUSES } from '../types/domain';

const FIRST_SLOT_MINUTES = 7 * 60;
const LAST_SLOT_MINUTES = 22 * 60;
const SLOT_STEP_MINUTES = 30;

export function timeToMinutes(value: string): number {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60).toString().padStart(2, '0');
  const minutes = (value % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/** Rejects impossible dates such as 2026-02-31, which `Date` would silently roll over. */
function isRealDate(value: string): boolean {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const slotTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'Use the HH:mm format.')
  .refine(
    (value) => {
      const minutes = timeToMinutes(value);
      return (
        minutes >= FIRST_SLOT_MINUTES &&
        minutes <= LAST_SLOT_MINUTES &&
        minutes % SLOT_STEP_MINUTES === 0
      );
    },
    { message: 'Choose a time between 7:00 AM and 10:00 PM in 30-minute steps.' },
  );

export const createBookingSchema = z
  .object({
    studioId: z.string().trim().min(1, 'A studio is required.'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the YYYY-MM-DD format.')
      .refine(isRealDate, { message: 'Choose a valid date.' }),
    start: slotTime,
    end: slotTime,
    notes: z.string().trim().max(500).default(''),
  })
  .refine((value) => timeToMinutes(value.end) - timeToMinutes(value.start) >= 60, {
    message: 'Bookings must be at least 1 hour, with the end after the start.',
    path: ['end'],
  });
export type CreateBookingInput = z.output<typeof createBookingSchema>;

export const updateBookingStatusSchema = z.object({
  status: z.enum(['confirmed', 'declined', 'cancelled', 'completed'], {
    message: 'Unsupported status.',
  }),
});
export type UpdateBookingStatus = z.output<typeof updateBookingStatusSchema>['status'];

export const listBookingsQuerySchema = z.object({
  status: z.enum(BOOKING_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(100),
  skip: z.coerce.number().int().min(0).default(0),
});
export type ListBookingsQuery = z.output<typeof listBookingsQuerySchema>;
