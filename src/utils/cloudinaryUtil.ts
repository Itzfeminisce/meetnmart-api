import { DeleteApiResponse, UploadApiOptions } from 'cloudinary';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { logger } from '../logger';

// Configure Cloudinary from environment variables
// The CLOUDINARY_URL environment variable should be in format:
// cloudinary://api_key:api_secret@cloud_name
cloudinary.config({
  secure: true
});

/**
 * Upload a file to Cloudinary from a local file path
 * 
 * @param filePath - Path to the file to upload
 * @param options - Optional Cloudinary upload options
 * @returns The Cloudinary upload result
 */
export const uploadFromPath = async (
  filePath: string,
  options: UploadApiOptions = {}
): Promise<string> => {
  try {
    // Ensure the file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    // Upload the file to Cloudinary
    const result = await cloudinary.uploader.upload(filePath, {
      resource_type: 'auto',
      ...options
    });

    // delete the file from the local filesystem
    fs.unlinkSync(filePath);

    logger.info(`File uploaded to Cloudinary: ${result.public_id}`);
    return result.url;
  } catch (error) {
    logger.error('Cloudinary upload from path failed:', error);
    throw error;
  }
};

/**
 * Upload a file to Cloudinary from a file object
 * 
 * @param file - The file object from formidable or similar
 * @param options - Optional Cloudinary upload options
 * @returns The Cloudinary upload result
 */
export const uploadFile = async (
  file: { filepath: string; originalFilename?: string },
  options: UploadApiOptions = {}
): Promise<string> => {
  try {
    // Use the original filename if available
    const filename = file.originalFilename || path.basename(file.filepath);
    
    // Upload the file to Cloudinary
    const result = await cloudinary.uploader.upload(file.filepath, {
      resource_type: 'auto',
      filename_override: filename,
      ...options
    });

    // delete the file from the local filesystem
    fs.unlinkSync(file.filepath);

    logger.info(`File uploaded to Cloudinary: ${result.public_id}`);
    return result.url;
  } catch (error) {
    logger.error('Cloudinary upload file failed:', error);
    throw error;
  }
};

/**
 * Delete a file from Cloudinary by public_id
 * 
 * @param publicId - The public_id of the file to delete
 * @param options - Optional Cloudinary delete options
 * @returns The Cloudinary deletion result
 */
export const deleteFile = async (
  publicId: string,
  options: any = {}
): Promise<DeleteApiResponse> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId, options);
    logger.info(`File deleted from Cloudinary: ${publicId}`);
    return result;
  } catch (error) {
    logger.error(`Cloudinary delete failed for ${publicId}:`, error);
    throw error;
  }
};
