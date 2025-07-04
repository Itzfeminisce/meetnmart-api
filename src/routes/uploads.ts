import express from "express"
import { asyncHandler } from "../utils/asyncHandlerUtils"
import { uploadFile } from "."
import fileUpload from "express-fileupload"
import { supabaseClient } from "../utils/supabase"
import { authenticate } from "../middleware/authenticate"
import { createCloudinaryClient, uploadFiles } from "../utils/fileUpload"
import { BadRequest } from "../utils/responses"
import { fileUploadLimiter } from "../middleware/rateLimiter"
import { z } from "zod"


const router = express.Router()

router.post("/file/products", authenticate(), fileUploadLimiter, asyncHandler(async (req) => {
    const resourceName = req.headers['x-resource-group-name']

    if (!resourceName) {
        throw new BadRequest("Invalid or missing upload resource group in request header. (tip: x-resource-group-name: string)")
    }
    const file = req.files.file as fileUpload.UploadedFile

    
    const result = await uploadFiles({
        files: [file] as any,
        preferredName: resourceName?.toString(),
        storage: {
            provider: 'cloudinary',
            client: await createCloudinaryClient(),
            folder: `${resourceName}/${req.user.id}`,
            bucket: "uploads",
        },
    });

    return result.files.map(it => it.publicUrl).at(0)

    // const fileExt = file.name.split('.').pop();
    // const filePath = `${filePreferedName}/${Date.now()}-${Math.random()}.${fileExt}`

    // await uploadFile(file, filePath)


    // const { data } = supabaseClient.storage
    //     .from('products')
    //     .getPublicUrl(filePath);

    // console.log({ publicUrl: data.publicUrl, filePreferedName, filePath });

    // return data.publicUrl
}))

router.post("/file", authenticate(), fileUploadLimiter, asyncHandler(async (req) => {
    try {
        const fileSchema = z.object({
            name: z.string(),
            data: z.instanceof(Buffer),
            size: z.number().min(1),
            encoding: z.string(),
            tempFilePath: z.string().optional(),
            truncated: z.boolean(),
            mimetype: z.string(),
            md5: z.string(),
            mv: z.function()
        });

        const uploads = z.object({
            files: z.union([
                fileSchema,
                z.array(fileSchema)
            ])
        }).parse(req.files);

        const resourceName = req.headers['x-resource-group-name']

        if (!resourceName) {
            throw new BadRequest("Invalid or missing upload resource group in request header. (tip: x-resource-group-name: string)")
        }

        const result = await uploadFiles({
            files: uploads.files as any,
            preferredName: resourceName?.toString(),
            storage: {
                provider: 'cloudinary',
                client: await createCloudinaryClient(),
                folder: `${resourceName}/${req.user.id}`,
                bucket: "uploads",
            },
        });

        console.log({fileUpload: result});
        

        return {
            urls: result.files.map(it => it.publicUrl)
        };
    } catch (error: any) {
        console.log("[FileUploadError]", error);

        if (error instanceof z.ZodError) {
            throw new BadRequest("Invalid file upload format", 'Upload Failed');
        }
        throw error;
    }
}))


export { router as UploadRouter }