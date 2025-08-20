import DatabaseCronHandler from "../utils/databaseCronHandler";
import { supabaseClient } from "../utils/supabase";


export const cronHandler = new DatabaseCronHandler(supabaseClient, {
    onSuccess(jobName, result, attempt) {
        console.log("[CRON_JOB] Success", {jobName});
    },
    onError(jobName, error, attempts) {
        console.log("[CRON_JOB] Error", {jobName});
    },
})


