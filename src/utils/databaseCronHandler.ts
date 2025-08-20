import { SupabaseClient } from '@supabase/supabase-js';
import * as cron from 'node-cron';

interface CronJobRecord {
    id: string;
    name: string;
    schedule: string;
    task_name: string;
    enabled: boolean;
    retry_attempts: number;
    retry_delay: number;
    timezone: string;
    last_run?: string;
    last_error?: string;
    execution_count: number;
    failure_count: number;
    created_at: string;
    updated_at: string;
}

interface JobOptions {
    retryAttempts?: number;
    retryDelay?: number;
    timezone?: string;
}

interface HandlerOptions {
    tableName?: string;
    syncInterval?: number;
    retryAttempts?: number;
    retryDelay?: number;
    onError?: (jobName: string, error: Error, attempts: number) => void;
    onSuccess?: (jobName: string, result: any, attempt: number) => void;
}

interface CreateJobData {
    name: string;
    schedule: string;
    taskName: string;
    enabled?: boolean;
    retryAttempts?: number;
    retryDelay?: number;
    timezone?: string;
}

interface UpdateJobData {
    schedule?: string;
    task_name?: string;
    enabled?: boolean;
    retry_attempts?: number;
    retry_delay?: number;
    timezone?: string;
}

interface JobStats {
    success: boolean;
    attempt: number;
    error?: string;
    attempts?: number;
    result?: string;
}

interface LocalJobData {
    job: cron.ScheduledTask;
    task: () => Promise<any>;
    schedule: string;
    taskName: string;
    dbId: string;
    options: Required<JobOptions>;
}

type TaskFunction = (jobConfig: CronJobRecord) => Promise<any> | any;

class DatabaseCronHandler {
    private db: SupabaseClient;
    private jobs: Map<string, LocalJobData>;
    private tableName: string;
    private syncInterval: number;
    private retryAttempts: number;
    private retryDelay: number;
    private errorCallback: (jobName: string, error: Error, attempts: number) => void;
    private successCallback: (jobName: string, result: any, attempt: number) => void;
    private taskRegistry: Map<string, TaskFunction>;
    private syncTimer: NodeJS.Timeout | null;
    private isShuttingDown: boolean;

    constructor(supabaseClient: SupabaseClient, options: HandlerOptions = {}) {
        this.db = supabaseClient;
        this.jobs = new Map<string, LocalJobData>();
        this.tableName = options.tableName || 'cron_jobs';
        this.syncInterval = options.syncInterval || 60000; // 1 minute
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 1000;
        this.errorCallback = options.onError || this.defaultErrorHandler;
        this.successCallback = options.onSuccess || (() => { });
        this.taskRegistry = new Map<string, TaskFunction>();
        this.syncTimer = null;
        this.isShuttingDown = false;
    }

    // Register task functions that can be executed
    registerTask(name: string, taskFunction: TaskFunction): this {
        this.taskRegistry.set(name, taskFunction);
        return this;
    }

    // Initialize and start syncing with database
    async initialize(): Promise<this> {
        await this.ensureTableExists();
        await this.syncFromDatabase();
        this.startPeriodicSync();
        return this;
    }

    // Check if table exists by attempting to query it
    private async ensureTableExists(): Promise<void> {
        try {
            // Try to query the table - if it fails, it likely doesn't exist
            await this.db.from(this.tableName).select('id').limit(1);
        } catch (error) {
            console.warn(`Table ${this.tableName} may not exist. Please create it manually:

CREATE TABLE ${this.tableName} (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR UNIQUE NOT NULL,
  schedule VARCHAR NOT NULL,
  task_name VARCHAR NOT NULL,
  enabled BOOLEAN DEFAULT true,
  retry_attempts INTEGER DEFAULT 3,
  retry_delay INTEGER DEFAULT 1000,
  timezone VARCHAR DEFAULT 'UTC',
  last_run TIMESTAMPTZ,
  last_error TEXT,
  execution_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`);
        }
    }

    // Sync jobs from database
    private async syncFromDatabase(): Promise<void> {
        if (this.isShuttingDown) return;

        try {
            const { data: dbJobs, error } = await this.db
                .from(this.tableName)
                .select('*')
                .eq('enabled', true)
                .returns<CronJobRecord[]>();

            if (error) throw error;

            // Remove jobs that no longer exist in DB
            for (const [name] of this.jobs) {
                if (!dbJobs?.find(job => job.name === name)) {
                    this.removeLocalJob(name);
                }
            }

            // Add/update jobs from DB
            if (dbJobs) {
                for (const dbJob of dbJobs) {
                    await this.syncJob(dbJob);
                }
            }

        } catch (error) {
            this.errorCallback('sync', error as Error, 0);
        }
    }

    // Sync individual job
    private async syncJob(dbJob: CronJobRecord): Promise<void> {
        const existing = this.jobs.get(dbJob.name);
        const task = this.taskRegistry.get(dbJob.task_name);

        if (!task) {
            console.warn(`Task '${dbJob.task_name}' not registered for job '${dbJob.name}'`);
            return;
        }

        // Check if job needs updating
        if (existing &&
            existing.schedule === dbJob.schedule &&
            existing.taskName === dbJob.task_name) {
            return; // No changes needed
        }

        // Remove existing job if it exists
        if (existing) {
            this.removeLocalJob(dbJob.name);
        }

        // Create new job
        this.addLocalJob(dbJob, task);
    }

    // Add job locally
    private addLocalJob(dbJob: CronJobRecord, task: TaskFunction): void {
        if (!cron.validate(dbJob.schedule)) {
            console.error(`Invalid cron schedule for job '${dbJob.name}': ${dbJob.schedule}`);
            return;
        }

        const wrappedTask = this.wrapTask(dbJob, task);

        const cronJob = cron.schedule(dbJob.schedule, wrappedTask, {
            // scheduled: true,
            timezone: dbJob.timezone || 'UTC'
        });

        this.jobs.set(dbJob.name, {
            job: cronJob,
            task: wrappedTask,
            schedule: dbJob.schedule,
            taskName: dbJob.task_name,
            dbId: dbJob.id,
            options: {
                retryAttempts: dbJob.retry_attempts || this.retryAttempts,
                retryDelay: dbJob.retry_delay || this.retryDelay,
                timezone: dbJob.timezone || 'UTC'
            }
        });
    }

    // Remove job locally
    private removeLocalJob(name: string): void {
        const jobData = this.jobs.get(name);
        if (jobData) {
            jobData.job.destroy();
            this.jobs.delete(name);
        }
    }

    // Wrap task with error handling and DB updates
    private wrapTask(dbJob: CronJobRecord, task: TaskFunction): () => Promise<any> {
        return async (): Promise<any> => {
            let attempt = 0;
            const maxAttempts = dbJob.retry_attempts || this.retryAttempts;

            while (attempt <= maxAttempts) {
                try {
                    const result = await Promise.resolve(task(dbJob));

                    // Update success in DB
                    await this.updateJobStats(dbJob.id, {
                        success: true,
                        attempt,
                        result: typeof result === 'object' ? JSON.stringify(result) : String(result)
                    });

                    this.successCallback(dbJob.name, result, attempt);
                    return result;

                } catch (error) {
                    attempt++;

                    if (attempt > maxAttempts) {
                        // Update failure in DB
                        await this.updateJobStats(dbJob.id, {
                            attempt,
                            success: false,
                            error: (error as Error).message,
                            attempts: attempt - 1
                        });

                        this.errorCallback(dbJob.name, error as Error, attempt - 1);
                        throw error;
                    }

                    // Wait before retry
                    const delay = (dbJob.retry_delay || this.retryDelay) * Math.pow(2, attempt - 1);
                    await this.sleep(delay);
                }
            }
        };
    }

    // Update job statistics in database
    private async updateJobStats(jobId: string, stats: JobStats): Promise<void> {
        try {
            const updates: Partial<CronJobRecord> = {
                last_run: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            if (stats.success) {
                // Note: These RPC calls need to be created in Supabase
                // Or we can use a simpler approach with raw SQL updates
                const { data: currentJob } = await this.db
                    .from(this.tableName)
                    .select('execution_count')
                    .eq('id', jobId)
                    .single();

                updates.execution_count = (currentJob?.execution_count || 0) + 1;
            } else {
                const { data: currentJob } = await this.db
                    .from(this.tableName)
                    .select('failure_count')
                    .eq('id', jobId)
                    .single();

                updates.failure_count = (currentJob?.failure_count || 0) + 1;
                updates.last_error = stats.error;
            }

            await this.db
                .from(this.tableName)
                .update(updates)
                .eq('id', jobId);

        } catch (error) {
            console.error('Failed to update job stats:', (error as Error).message);
        }
    }

    // Start periodic sync with database
    private startPeriodicSync(): void {
        if (this.syncTimer) return;

        this.syncTimer = setInterval(async () => {
            await this.syncFromDatabase();
        }, this.syncInterval);
    }

    // Stop periodic sync
    private stopPeriodicSync(): void {
        if (this.syncTimer) {
            clearInterval(this.syncTimer);
            this.syncTimer = null;
        }
    }

    // Create a new job in database
    async createJob(jobData: CreateJobData): Promise<CronJobRecord> {
        const { data, error } = await this.db
            .from(this.tableName)
            .insert({
                name: jobData.name,
                schedule: jobData.schedule,
                task_name: jobData.taskName,
                enabled: jobData.enabled ?? true,
                retry_attempts: jobData.retryAttempts || this.retryAttempts,
                retry_delay: jobData.retryDelay || this.retryDelay,
                timezone: jobData.timezone || 'UTC'
            })
            .select()
            .single<CronJobRecord>()

        if (error) throw error;
        if (!data) throw new Error('Failed to create job');

        // Trigger immediate sync
        await this.syncFromDatabase();
        return data;
    }

    // Update job in database
    async updateJob(name: string, updates: UpdateJobData): Promise<CronJobRecord> {
        const { data, error } = await this.db
            .from(this.tableName)
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq('name', name)
            .select()
            .single<CronJobRecord>()

        if (error) throw error;
        if (!data) throw new Error('Job not found');

        // Trigger immediate sync
        await this.syncFromDatabase();
        return data;
    }

    // Delete job from database
    async deleteJob(name: string): Promise<void> {
        const { error } = await this.db
            .from(this.tableName)
            .delete()
            .eq('name', name);

        if (error) throw error;

        // Remove locally
        this.removeLocalJob(name);
    }

    // Enable/disable job
    async toggleJob(name: string, enabled: boolean): Promise<CronJobRecord> {
        return await this.updateJob(name, { enabled });
    }

    // Get job statistics from database
    async getJobStats(name?: string): Promise<CronJobRecord | CronJobRecord[]> {
        let query = this.db.from(this.tableName).select('*');

        if (name) {
            const { data, error } = await query.eq('name', name).single<CronJobRecord>()
            if (error) throw error;
            if (!data) throw new Error('Job not found');
            return data;
        }

        const { data, error } = await query.returns<CronJobRecord[]>();
        if (error) throw error;
        return data || [];
    }

    // Execute job immediately
    async executeNow(name: string): Promise<any> {
        const jobData = this.jobs.get(name);
        if (!jobData) {
            throw new Error(`Job '${name}' not found locally`);
        }

        return await jobData.task();
    }

    // List active jobs
    listJobs(): string[] {
        return Array.from(this.jobs.keys());
    }

    // Get registered tasks
    getRegisteredTasks(): string[] {
        return Array.from(this.taskRegistry.keys());
    }

    // Check if job exists locally
    hasJob(name: string): boolean {
        return this.jobs.has(name);
    }

    // Check if task is registered
    hasTask(name: string): boolean {
        return this.taskRegistry.has(name);
    }

    // Default error handler
    private defaultErrorHandler(jobName: string, error: Error, attempts: number): void {
        console.error(`[CronHandler] Job '${jobName}' failed after ${attempts} attempts:`, error.message);
    }

    // Utility sleep function
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Graceful shutdown
    async shutdown(): Promise<void> {
        this.isShuttingDown = true;
        this.stopPeriodicSync();

        // Stop all jobs
        for (const [name, jobData] of this.jobs) {
            jobData.job.destroy();
        }
        this.jobs.clear();

        console.log('[DatabaseCronHandler] Shutdown complete');
    }

    // Validate cron expression
    static validateCron(expression: string): boolean {
        return cron.validate(expression);
    }
}

export default DatabaseCronHandler;
export type {
    CronJobRecord,
    JobOptions,
    HandlerOptions,
    CreateJobData,
    UpdateJobData,
    TaskFunction
};