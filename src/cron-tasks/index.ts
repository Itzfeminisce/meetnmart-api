import { cronHandler } from "./handler";
import "./tasks/weekend-feeds-insight";  

// Initialize and create the job
async function setupDailyNotifications() {
    await cronHandler.initialize();
 
    try {
        await cronHandler.getJobStats('weekend-feeds-insight-notification');
        console.log('Job already exists, skipping creation');
    } catch (error) { 
        await cronHandler.createJob({
            name: 'weekend-feeds-insight-notification',
            schedule: '0 18 * * 1-5',   //- 6:00 PM weekdays only
            taskName: 'weekend-feeds-insight',
            retryAttempts: 2,
            timezone: 'Africa/Lagos'
        });
        console.log('weekend post insights notification job created!');
    }

    await cronHandler.executeNow("weekend-feeds-insight-notification")

}


// Alternative schedules you might want:
// '0 17 * * *'     - 5:00 PM daily
// '0 19 * * *'     - 7:00 PM daily  
// '0 18 * * 1-5'   - 6:00 PM weekdays only
// '30 17 * * *'    - 5:30 PM daily

setupDailyNotifications().catch(console.error);