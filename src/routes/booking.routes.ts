import { Router } from 'express';
import {
  getBookingById,
  getHostBookings,
  getMyBookings,
  patchBookingStatus,
  postBooking,
} from '../controllers/booking.controller';
import { requireAuth } from '../middleware/auth.middleware';

const bookingRouter = Router();

bookingRouter.use(requireAuth);

bookingRouter.post('/', postBooking);
// Fixed paths must come before `/:id`.
bookingRouter.get('/mine', getMyBookings);
bookingRouter.get('/host', getHostBookings);
bookingRouter.get('/:id', getBookingById);
bookingRouter.patch('/:id/status', patchBookingStatus);

export default bookingRouter;
