import { z } from 'zod';




export const UpdateProfileSchema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string().optional(),
  description: z.string().optional(),
  is_online: z.boolean().optional(),
  is_reachable: z.boolean().optional(),
  is_verified: z.boolean().optional(),
  is_premium: z.boolean().optional(),
  phone_number: z.string().optional(),
  avatar: z.string().optional()
});

export const updateLocationSchema = z.object({
    lng: z.number(),
    lat: z.number(),
  });

export const updateProfileSchema = UpdateProfileSchema.partial();

export type TUpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type TUpdateLocationInput = z.infer<typeof updateLocationSchema>;
