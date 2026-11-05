import { z } from 'zod';

export const newsletterSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email('Enter a valid email address.').max(254)),
});
