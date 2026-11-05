import type { Request, Response } from 'express';
import { uploadImage } from '../services/upload.service';
import { parseInput } from '../utils/validate';
import { imageUploadSchema } from '../validators/upload.validators';

/** POST /api/uploads/image */
export async function postImage(req: Request, res: Response): Promise<void> {
  const { image } = parseInput(imageUploadSchema, req.body);
  res.status(201).json({ url: await uploadImage(image) });
}
