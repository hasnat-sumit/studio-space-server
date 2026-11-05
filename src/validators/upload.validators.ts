import { z } from 'zod';

/** About 3 MB once decoded. Hosts such as Vercel reject request bodies over 4.5 MB. */
const MAX_DATA_URL_LENGTH = 4_200_000;

export const imageUploadSchema = z.object({
  image: z
    .string()
    .max(MAX_DATA_URL_LENGTH, 'Images must be 3 MB or smaller.')
    .regex(
      /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/,
      'Choose a PNG, JPEG, WebP, or GIF image.',
    ),
});
