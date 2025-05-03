import formidable from 'formidable';
import type { Fields, Files } from 'formidable';
import fs from 'fs';
import path from 'path';
import { Request } from 'express';
import { logger } from '../logger';
import { uploadFromPath } from '../utils/cloudinaryUtil';

/**
 * Options for file upload
 */
export interface UploadOptions {
  /** Maximum file size in bytes (default: 5MB) */
  maxFileSize?: number;
  /** Maximum fields size in bytes (default: 5MB) */
  maxFieldsSize?: number;
  /** Maximum number of fields (default: 10) */
  maxFields?: number;
  /** Whether to allow multiple files (default: false) */
  multiples?: boolean;
  /** Whether to keep file extensions (default: true) */
  keepExtensions?: boolean;
  /** Custom upload directory (default: uploads folder in project root) */
  uploadDir?: string;
  /** Custom filename function */
  filename?: (name: string, ext: string) => string;
  /** Cloudinary upload options */
  cloudinaryOptions?: {
    /** Folder in Cloudinary to upload to */
    folder?: string;
    /** Transformation options for the uploaded image */
    transformation?: {
      width?: number;
      height?: number;
      crop?: string;
      quality?: string;
      format?: string;
      [key: string]: any;
    };
  };
}

/**
 * Default upload options
 */
const defaultOptions: UploadOptions = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFieldsSize: 5 * 1024 * 1024, // 5MB
  maxFields: 10,
  multiples: false,
  keepExtensions: true,
  uploadDir: path.join(process.cwd(), 'uploads'),
  filename: (name, ext) => `${Date.now()}-${name}${ext}`,
  cloudinaryOptions: {
    folder: 'uploads',
    transformation: {
      width: 1000,
      height: 1000,
      crop: 'limit'
    }
  }
};

/**
 * Parse form data using formidable
 */
export function parseFormData(form: ReturnType<typeof formidable>, req: Request): Promise<{ fields: Fields, files: Files }> {
  return new Promise((resolve, reject) => {
    // Add a timeout to prevent hanging
    const timeout = setTimeout(() => {
      reject(new Error('Form parsing timed out'));
    }, 3000); // 3 seconds timeout

    form.parse(req, (err: Error | null, fields: Fields, files: Files) => {
      clearTimeout(timeout);
      if (err) {
        logger.error('Error parsing form data:', err);
        reject(err);
        return;
      }
      resolve({ fields, files });
    });
  });
}

/**
 * Upload a file to Cloudinary and return the URL
 * @param filePath Path to the file to upload
 * @param options Cloudinary upload options
 * @returns Promise resolving to the uploaded file URL
 */
export async function uploadFileToCloudinary(
  filePath: string,
  options: UploadOptions['cloudinaryOptions'] = {}
): Promise<string> {
  try {
    const uploadOptions = {
      folder: options.folder || defaultOptions.cloudinaryOptions!.folder,
      transformation: {
        ...defaultOptions.cloudinaryOptions!.transformation,
        ...options.transformation
      }
    };

    logger.debug(`Uploading file to Cloudinary: ${filePath}`, uploadOptions);
    const url = await uploadFromPath(filePath, uploadOptions);
    logger.info(`File uploaded successfully: ${url}`);
    return url;
  } catch (error) {
    logger.error('Failed to upload file to Cloudinary', error);
    throw error;
  }
}

/**
 * Process a file upload from a form request
 * @param req Express request object
 * @param fieldName Name of the file field in the form
 * @param options Upload options
 * @returns Promise resolving to the uploaded file URL or empty string if no file was uploaded
 */
export async function processFileUpload(
  req: Request,
  fieldName: string,
  options: UploadOptions = {}
): Promise<string | null> {
  const uploadOptions = { ...defaultOptions, ...options };
  const uploadDir = uploadOptions.uploadDir!;

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadDir)) {
    logger.debug(`Creating uploads directory: ${uploadDir}`);
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  // Configure formidable for file uploads
  const form = formidable({
    multiples: uploadOptions.multiples,
    keepExtensions: uploadOptions.keepExtensions,
    maxFileSize: uploadOptions.maxFileSize,
    maxFieldsSize: uploadOptions.maxFieldsSize,
    maxFields: uploadOptions.maxFields,
    uploadDir,
    filename: uploadOptions.filename
  });

  try {
    logger.debug(`Parsing form data for file upload: ${fieldName}`);
    const { fields, files } = await parseFormData(form, req);
    
    // Check if the file field exists
    const fileField = files[fieldName];
    if (!fileField) {
      logger.debug(`No file uploaded for field: ${fieldName}`);
      throw new Error("No files found")
    }

    // Handle single file or multiple files
    const fileEntries = Array.isArray(fileField) ? fileField : [fileField];
    
    if (fileEntries.length === 0) {
      logger.debug(`No files found for field: ${fieldName}`);
      return '';
    }

    // Process the first file (or you could map through all files if needed)
    const filePath = fileEntries[0].filepath;
    logger.debug(`Processing file upload from path: ${filePath}`);

    // Upload to Cloudinary
    const url = await uploadFileToCloudinary(filePath, uploadOptions.cloudinaryOptions);
    
    return url;
  } catch (error) {
    logger.error(`File upload failed for field ${fieldName}:`, error);
    throw error;
  }
}

/**
 * Process multiple file uploads from a form request
 * @param req Express request object
 * @param fieldNames Array of field names to process
 * @param options Upload options
 * @returns Promise resolving to an object with field names as keys and URLs as values
 */
export async function processMultipleFileUploads(
  req: Request,
  fieldNames: string[],
  options: UploadOptions = {}
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  
  for (const fieldName of fieldNames) {
    try {
      const result = await processFileUpload(req, fieldName, options);
      results[fieldName] = result || ''; // Convert null to empty string
    } catch (error) {
      logger.error(`Failed to process upload for field ${fieldName}:`, error);
      results[fieldName] = '';
    }
  }
  
  return results;
} 