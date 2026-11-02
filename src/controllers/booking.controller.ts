import type { Request, Response } from 'express';
import { currentUser } from '../middleware/auth.middleware';
import {
  createBooking,
  getBooking,
  listGuestBookings,
  listHostBookings,
  updateBookingStatus,
} from '../services/booking.service';
import { parseInput, routeParam } from '../utils/validate';
import {
  createBookingSchema,
  listBookingsQuerySchema,
  updateBookingStatusSchema,
} from '../validators/booking.validators';

/** POST /api/bookings */
export async function postBooking(req: Request, res: Response): Promise<void> {
  const input = parseInput(createBookingSchema, req.body);
  res.status(201).json(await createBooking(currentUser(res), input));
}

/** GET /api/bookings/mine */
export async function getMyBookings(req: Request, res: Response): Promise<void> {
  const query = parseInput(listBookingsQuerySchema, req.query);
  res.json(await listGuestBookings(currentUser(res), query));
}

/** GET /api/bookings/host */
export async function getHostBookings(req: Request, res: Response): Promise<void> {
  const query = parseInput(listBookingsQuerySchema, req.query);
  res.json(await listHostBookings(currentUser(res), query));
}

/** GET /api/bookings/:id */
export async function getBookingById(req: Request, res: Response): Promise<void> {
  res.json(await getBooking(currentUser(res), routeParam(req.params.id)));
}

/** PATCH /api/bookings/:id/status */
export async function patchBookingStatus(req: Request, res: Response): Promise<void> {
  const { status } = parseInput(updateBookingStatusSchema, req.body);
  res.json(await updateBookingStatus(currentUser(res), routeParam(req.params.id), status));
}
