import { z } from 'zod';

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(80),
    tagline: z.string().trim().max(100),
    bio: z.string().trim().max(1000),
    location: z.string().trim().max(120),
    phone: z
      .string()
      .trim()
      .max(30)
      .regex(/^[\d\s()+.-]*$/, 'Enter a valid phone number.'),
    responseNote: z.string().trim().max(100),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, { message: 'Nothing to update.' });
export type UpdateProfileInput = z.output<typeof updateProfileSchema>;
