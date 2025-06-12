// utils/fileUpload.ts
import fileUpload from 'express-fileupload';
import { eventManager } from './eventUtils';
import { logger } from '../logger';

export interface FileUploadOptions {
    // File and naming options
    files: fileUpload.UploadedFile | fileUpload.UploadedFile[];
    preferredName?: string;
    customFileName?: string;
    preserveOriginalName?: boolean;

    // Path and organization options
    basePath?: string;
    subFolder?: string;
    datePrefix?: boolean;
    randomSuffix?: boolean;

    // Storage configuration
    storage: {
        bucket: string;
        client: any;
        uploadMethod: (file: fileUpload.UploadedFile, path: string) => Promise<void>;
        getPublicUrl: (bucket: string, path: string | fileUpload.UploadedFile) => string;
        rollback: (uploadUrls: string[]) => Promise<void>
    };

    // File validation options
    validation?: {
        maxSize?: number;
        allowedExtensions?: string[];
        allowedMimeTypes?: string[];
        maxFiles?: number;
    };

    // Metadata options
    metadata?: Record<string, any>;

    // Transform options
    transform?: {
        resize?: { width: number; height: number };
        quality?: number;
        format?: string;
    };
}

export interface SingleFileResult {
    success: boolean;
    publicUrl?: string;
    filePath?: string;
    fileName?: string;
    fileSize?: number;
    error?: string;
    metadata?: Record<string, any>;
    originalName?: string;
}

export interface FileUploadResult {
    success: boolean;
    files: SingleFileResult[];
    totalFiles: number;
    successCount: number;
    errorCount: number;
    errors: string[];
}

export class FileUploadError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'FileUploadError';
    }
}

export async function uploadFilesToStorage(options: FileUploadOptions): Promise<FileUploadResult> {
    const files = Array.isArray(options.files) ? options.files : [options.files];

    // Validate file count
    if (options.validation?.maxFiles && files.length > options.validation.maxFiles) {
        return {
            success: false,
            files: [],
            totalFiles: files.length,
            successCount: 0,
            errorCount: files.length,
            errors: [`Too many files: ${files.length}. Maximum allowed: ${options.validation.maxFiles}`]
        };
    }

    const results: SingleFileResult[] = [];
    const errors: string[] = [];
    let successCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];

        try {
            // Validate individual file
            if (options.validation) {
                const validationResult = validateFile(file, options.validation);
                if (!validationResult.isValid) {
                    const error = `File ${i + 1} (${file.name}): ${validationResult.error}`;
                    errors.push(error);
                    results.push({
                        success: false,
                        error: validationResult.error,
                        originalName: file.name
                    });
                    continue;
                }
            }

            // Generate file path for this specific file
            const filePath = generateFilePath(file, options, i);

            // Upload file
            await options.storage.uploadMethod(file, filePath);

            // Get public URL
            const publicUrl = options.storage.getPublicUrl(options.storage.bucket, file);

            const result: SingleFileResult = {
                success: true,
                publicUrl,
                filePath,
                fileName: filePath.split('/').pop(),
                fileSize: file.size,
                originalName: file.name,
                metadata: {
                    originalName: file.name,
                    mimeType: file.mimetype,
                    uploadDate: new Date().toISOString(),
                    fileIndex: i,
                    ...options.metadata
                }
            };

            results.push(result);
            successCount++;

        } catch (error) {
            console.log({ uploadFilesToStorage: error });

            const errorMsg = error instanceof Error ? error.message : 'Unknown upload error';
            const fileError = `File ${i + 1} (${file.name}): ${errorMsg}`;

            console.error('File upload error:', error);
            errors.push(fileError);

            results.push({
                success: false,
                error: errorMsg,
                originalName: file.name
            });
        }
    }

    return {
        success: successCount > 0,
        files: results,
        totalFiles: files.length,
        successCount,
        errorCount: files.length - successCount,
        errors
    };
}

function validateFile(
    file: fileUpload.UploadedFile,
    validation: NonNullable<FileUploadOptions['validation']>
): { isValid: boolean; error?: string } {

    // Check file size
    if (validation.maxSize && file.size > validation.maxSize) {
        return {
            isValid: false,
            error: `File size ${file.size} bytes exceeds maximum allowed size of ${validation.maxSize} bytes`
        };
    }

    // Check file extension
    if (validation.allowedExtensions) {
        const fileExt = file.name.split('.').pop()?.toLowerCase();
        if (!fileExt || !validation.allowedExtensions.includes(fileExt)) {
            return {
                isValid: false,
                error: `File extension '${fileExt}' is not allowed. Allowed: ${validation.allowedExtensions.join(', ')}`
            };
        }
    }

    // Check MIME type
    if (validation.allowedMimeTypes && !validation.allowedMimeTypes.includes(file.mimetype)) {
        return {
            isValid: false,
            error: `MIME type '${file.mimetype}' is not allowed. Allowed: ${validation.allowedMimeTypes.join(', ')}`
        };
    }

    return { isValid: true };
}

function generateFilePath(
    file: fileUpload.UploadedFile,
    options: FileUploadOptions,
    fileIndex: number = 0
): string {
    const {
        preferredName,
        customFileName,
        preserveOriginalName,
        basePath = '',
        subFolder = '',
        datePrefix = true,
        randomSuffix = true
    } = options;

    const fileExt = file.name.split('.').pop();

    // Determine filename
    let fileName: string;

    if (customFileName) {
        fileName = fileIndex > 0 ? `${customFileName}-${fileIndex + 1}` : customFileName;
    } else if (preserveOriginalName) {
        fileName = file.name.replace(/\.[^/.]+$/, "");
    } else if (preferredName) {
        fileName = fileIndex > 0 ? `${preferredName}-${fileIndex + 1}` : preferredName;
    } else {
        fileName = `file-${fileIndex + 1}`;
    }

    // Add prefixes/suffixes
    const parts: string[] = [];

    if (datePrefix) {
        parts.push(Date.now().toString());
    }

    if (randomSuffix) {
        parts.push(Math.random().toString(36).substring(2, 8));
    }

    // For multiple files, add file index to ensure uniqueness
    if (Array.isArray(options.files) && options.files.length > 1) {
        parts.push(`f${fileIndex}`);
    }

    const finalFileName = parts.length > 0 ? `${parts.join('-')}-${fileName}` : fileName;

    // Build full path
    const pathParts = [basePath, subFolder].filter(Boolean);
    const folder = pathParts.join('/');

    return folder ? `${folder}/${finalFileName}.${fileExt}` : `${finalFileName}.${fileExt}`;
}

// Storage adapters remain the same
export const SupabaseStorageAdapter = {
    createAdapter: (supabaseClient: any, bucketName: string = 'products') => {
        const uploadedPaths: string[] = [];

        return {
            uploadMethod: async (file: fileUpload.UploadedFile, path: string) => {
                const { error } = await supabaseClient.storage
                    .from(bucketName)
                    .upload(path, file.data, {
                        contentType: file.mimetype,
                        upsert: false
                    });

                if (error) {
                    throw new FileUploadError(`Supabase upload failed: ${error.message}`, 'SUPABASE_ERROR');
                }
                uploadedPaths.push(path);
            },
            getPublicUrl: (bucket: string, path: string) => {
                const { data } = supabaseClient.storage
                    .from(bucket)
                    .getPublicUrl(path);
                return data.publicUrl;
            },
            rollback: async (uploadUrls?: string[]) => {
                if (uploadUrls && uploadUrls.length > 0) {
                    // Extract paths from URLs
                    const paths = uploadUrls.map(url => {
                        const urlObj = new URL(url);
                        return urlObj.pathname.split('/').slice(3).join('/'); // Remove bucket name and version
                    });

                    const { error } = await supabaseClient.storage
                        .from(bucketName)
                        .remove(paths);

                    if (error) {
                        throw new FileUploadError(`Supabase rollback failed: ${error.message}`, 'SUPABASE_ROLLBACK_ERROR');
                    }
                } else {
                    // Rollback all tracked paths
                    if (uploadedPaths.length > 0) {
                        const { error } = await supabaseClient.storage
                            .from(bucketName)
                            .remove(uploadedPaths);

                        if (error) {
                            throw new FileUploadError(`Supabase rollback failed: ${error.message}`, 'SUPABASE_ROLLBACK_ERROR');
                        }
                        uploadedPaths.length = 0; // Clear the array
                    }
                }
            }
        };
    }
};

export const S3StorageAdapter = {
    createAdapter: (s3Client: any, bucketName: string) => {
        const uploadedPaths: string[] = [];

        return {
            uploadMethod: async (file: fileUpload.UploadedFile, path: string) => {
                await s3Client.upload({
                    Bucket: bucketName,
                    Key: path,
                    Body: file.data,
                    ContentType: file.mimetype
                }).promise();
                uploadedPaths.push(path);
            },
            getPublicUrl: (bucket: string, path: string) => {
                return `https://${bucket}.s3.amazonaws.com/${path}`;
            },
            rollback: async (uploadUrls?: string[]) => {
                if (uploadUrls && uploadUrls.length > 0) {
                    // Extract keys from URLs
                    const keys = uploadUrls.map(url => {
                        const urlObj = new URL(url);
                        return urlObj.pathname.substring(1); // Remove leading slash
                    });

                    await Promise.all(keys.map(key =>
                        s3Client.deleteObject({
                            Bucket: bucketName,
                            Key: key
                        }).promise()
                    ));
                } else {
                    // Rollback all tracked paths
                    if (uploadedPaths.length > 0) {
                        await Promise.all(uploadedPaths.map(path =>
                            s3Client.deleteObject({
                                Bucket: bucketName,
                                Key: path
                            }).promise()
                        ));
                        uploadedPaths.length = 0; // Clear the array
                    }
                }
            }
        };
    }
};

export const CloudinaryStorageAdapter = {
    createAdapter: (cloudinary: any, options: { folder?: string; resourceType?: 'image' | 'video' | 'raw' } = {}) => {
        const uploadedPublicIds: string[] = [];

        return {
            uploadMethod: async (file: fileUpload.UploadedFile, path: string): Promise<void> => {
                const uploadOptions = {
                    public_id: path.replace(/\.[^/.]+$/, ""), // Remove extension
                    folder: options.folder,
                    resource_type: options.resourceType || 'auto',
                    use_filename: false,
                    unique_filename: true
                };

                const result: any = await new Promise((resolve, reject) => {
                    cloudinary.uploader.upload_stream(
                        uploadOptions,
                        (error: any, result: any) => {
                            if (error) reject(error);
                            else resolve(result);
                        }
                    ).end(file.data);
                });

                uploadedPublicIds.push(result.public_id);
                (file as any).__cloudinary_url = result.secure_url;
            },
            getPublicUrl: (bucket: string, path: string | fileUpload.UploadedFile) => {
                if (typeof path !== 'string' && (path as any).__cloudinary_url) {
                    return (path as any).__cloudinary_url;
                }
                return `https://res.cloudinary.com/${cloudinary.config().cloud_name}/${path}`;
            },
            rollback: async (uploadUrls?: string[]) => {
                if (uploadUrls && uploadUrls.length > 0) {
                    // Extract public IDs from URLs
                    const publicIds = uploadUrls.map(url => {
                        const urlObj = new URL(url);
                        const pathParts = urlObj.pathname.split('/');
                        const publicId = pathParts.slice(pathParts.length - 3, pathParts.length).join("/").split('.')[0];
                        return publicId;
                    });

                    const revokedItems = await Promise.all(publicIds.map(publicId =>
                        new Promise((resolve, reject) => {
                            cloudinary.uploader.destroy(publicId, (error: any, result: any) => {
                                if (error) reject(error);
                                else resolve(result);
                            });
                        })
                    ));

                    console.info("[Cloudinary::ROLLBACK]", {revokedItems, publicIds });

                } else {
                    // Rollback all tracked public IDs
                    if (uploadedPublicIds.length > 0) {
                        const revokedItems = await Promise.all(uploadedPublicIds.map(publicId =>
                            new Promise((resolve, reject) => {
                                cloudinary.uploader.destroy(publicId, (error: any, result: any) => {
                                    if (error) reject(error);
                                    else resolve(result);
                                });
                            })
                        ));
                        uploadedPublicIds.length = 0; // Clear the array

                        console.info("[Cloudinary::ROLLBACK]", {revokedItems, uploadedPublicIds });
                    }
                }
            }
        };
    }
};

// Storage configuration with client and adapter factory
export interface StorageConfig {
    provider: 'supabase' | 'cloudinary' | 's3';
    client: any;
    bucket?: string; // For Supabase/S3
    folder?: string; // For Cloudinary
    resourceType?: 'image' | 'video' | 'raw'; // For Cloudinary
}

// Upload configuration interface
export interface UploadConfig {
    files: fileUpload.UploadedFile | fileUpload.UploadedFile[];
    preferredName: string;
    storage: StorageConfig;
    validation?: {
        maxSize?: number;
        maxFiles?: number;
        allowedExtensions?: string[];
        allowedMimeTypes?: string[];
    };
    options?: {
        datePrefix?: boolean;
        randomSuffix?: boolean;
        basePath?: string;
        subFolder?: string;
        preserveOriginalName?: boolean;
        metadata?: Record<string, any>;
    };
}

// Default validation presets
export const ValidationPresets = {
    images: {
        maxSize: 10 * 1024 * 1024, // 10MB
        maxFiles: 10,
        allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    },
    documents: {
        maxSize: 50 * 1024 * 1024, // 50MB
        maxFiles: 5,
        allowedExtensions: ['pdf', 'doc', 'docx', 'txt'],
        allowedMimeTypes: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    },
    videos: {
        maxSize: 100 * 1024 * 1024, // 100MB
        maxFiles: 3,
        allowedExtensions: ['mp4', 'mov', 'avi', 'webm'],
        allowedMimeTypes: ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm']
    },
    any: {
        maxSize: 20 * 1024 * 1024, // 20MB
        maxFiles: 10
    }
} as const;

// Helper function to create storage adapter
function createStorageAdapter(config: StorageConfig): FileUploadOptions['storage'] {
    const adapter = (() => {
        switch (config.provider) {
            case 'supabase':
                return SupabaseStorageAdapter.createAdapter(config.client, config.bucket!);
            case 'cloudinary':
                return CloudinaryStorageAdapter.createAdapter(config.client, {
                    folder: config.folder,
                    resourceType: config.resourceType
                });
            case 's3':
                return S3StorageAdapter.createAdapter(config.client, config.bucket!);
            default:
                throw new Error(`Unsupported storage provider: ${config.provider}`);
        }
    })();

    eventManager.onEvent(`${config.provider}_upload_error`, async fileUrls => {
        logger.info(`Received [EVENT:${config.provider}_upload_error`, fileUrls)
        await adapter.rollback(fileUrls)
    })

    // @ts-ignore
    return adapter;
}

// Main upload function
export async function uploadFiles(config: UploadConfig): Promise<FileUploadResult> {
    const {
        files,
        preferredName,
        storage,
        validation = ValidationPresets.images,
        options = {}
    } = config;

    const storageAdapter = createStorageAdapter(storage);

    return uploadFilesToStorage({
        files,
        preferredName,
        storage: storageAdapter,
        // @ts-ignore
        validation,
        datePrefix: options.datePrefix ?? true,
        randomSuffix: options.randomSuffix ?? true,
        basePath: options.basePath,
        subFolder: options.subFolder,
        preserveOriginalName: options.preserveOriginalName,
        metadata: options.metadata
    });
}

// Simplified single file handler
export async function uploadSingleFile(config: UploadConfig): Promise<string> {
    const result = await uploadFiles(config);

    if (!result.success || result.files.length === 0 || !result.files[0].success) {
        const error = result.errors[0] || result.files[0]?.error || 'File upload failed';
        throw new Error(error);
    }

    return result.files[0].publicUrl!;
}

// Multiple files handler
export async function uploadMultipleFiles(config: UploadConfig): Promise<string[]> {
    const result = await uploadFiles(config);

    return result.files
        .filter(file => file.success && file.publicUrl)
        .map(file => file.publicUrl!);
}

// Utility functions for common use cases
export function getSuccessfulUploads(result: FileUploadResult): SingleFileResult[] {
    return result.files.filter(file => file.success);
}

export function getFailedUploads(result: FileUploadResult): SingleFileResult[] {
    return result.files.filter(file => !file.success);
}

export function getAllPublicUrls(result: FileUploadResult): string[] {
    return result.files
        .filter(file => file.success && file.publicUrl)
        .map(file => file.publicUrl!);
}

let cloudinaryClient: typeof import('cloudinary').v2 | null = null;

export async function createCloudinaryClient(): Promise<typeof import('cloudinary').v2> {
    if (!cloudinaryClient) {
        const { default: cloudinary } = await import("cloudinary");
        cloudinary.v2.config({ secure: true });
        cloudinaryClient = cloudinary.v2;
    }
    return cloudinaryClient;
}