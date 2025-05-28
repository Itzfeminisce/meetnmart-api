import express from "express"
import { asyncHandler } from "../utils/asyncHandlerUtils"
import { uploadFile } from "."
import fileUpload from "express-fileupload"
import { supabaseClient } from "../utils/supabase"


const router = express.Router()

router.post("/file", asyncHandler(async (req) => {
    const file = req.files.file as fileUpload.UploadedFile
    const { filePreferedName } = req.body


    const fileExt = file.name.split('.').pop();
    const filePath = `${filePreferedName}/${Date.now()}-${Math.random()}.${fileExt}`
    
    await uploadFile(file, filePath)
    
    
    const { data } = supabaseClient.storage
    .from('products')
    .getPublicUrl(filePath);
    
    console.log({publicUrl: data.publicUrl, filePreferedName, filePath});

    return data.publicUrl
}))


export { router as UploadRouter }