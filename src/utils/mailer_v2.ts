import nodemailer, { SentMessageInfo } from 'nodemailer';
import Mail, { Attachment } from 'nodemailer/lib/mailer';
import ejs from 'ejs';
import fs from 'node:fs';
import path from 'path';
import { logger as appLogger } from '../logger';
import { getEnvVar } from './env';

// SMTP Configuration
const SMTP_HOST = 'das111.truehost.cloud';
const SMTP_PORT = 587;
const SMTP_USER = 'no-reply@meetnmart.com';
const SMTP_PASSWORD = getEnvVar('SMTP_PASSWORD');
const EMAIL_FROM = 'info@meetnmart.com';
const SUPPORT_EMAIL = getEnvVar('SUPPORT_EMAIL', EMAIL_FROM);

const logger = {
  info: (context: string, message: string, data?: any) =>
    appLogger.info(`[${context}] ${message}`, data),
  warn: (context: string, message: string, data?: any) =>
    appLogger.warn(`[${context}] ${message}`, data),
  error: (context: string, message: string, error?: any) =>
    appLogger.error(`[${context}] ${message}`, error),
  debug: (context: string, message: string, data?: any) =>
    appLogger.debug(`[${context}] ${message}`, data)
};


interface TemplateData {
  [key: string]: unknown;
}

interface EmailConfig extends TemplateData {
  subject: string;
  to: string;
  template: string;
  layout?: string;
  attachments?: Attachment[];
}

class MailerV2 {
  private transporter?: Mail;
  private readonly emailsDir: string;
  private static instance: MailerV2;
  private isInitializing = false;
  private initializationPromise: Promise<void> | null = null;

  // Cache for templates
  private readonly templateCache = new Map<string, string>();

  private constructor() {
    this.emailsDir = path.join(process.cwd(), "emails");
    this.verifyEmailsDirectory();
    this.initializeTransporter().catch(err => {
      logger.error('constructor', 'Initial transporter setup failed', err);
    });
  }

  public static getInstance(): MailerV2 {
    if (!MailerV2.instance) {
      MailerV2.instance = new MailerV2();
    }
    return MailerV2.instance;
  }

  /* ------------------------- Initialization Methods ------------------------- */

  private verifyEmailsDirectory(): void {
    const requiredDirs = [
      this.emailsDir,
      path.join(this.emailsDir, 'templates'),
      path.join(this.emailsDir, 'layouts'),
      path.join(this.emailsDir, 'layouts/partials'),
      path.join(this.emailsDir, 'components')
    ];

    const missingDirs = requiredDirs.filter(dir => !fs.existsSync(dir));

    if (missingDirs.length > 0) {
      const missingPaths = missingDirs.map(dir => `- ${dir}`).join('\n');
      logger.warn('verifyEmailsDirectory', `The following required email directories are missing:\n${missingPaths}`);

      // Don't throw to allow operation without emails in development
      if (process.env.NODE_ENV === 'production') {
        logger.error('verifyEmailsDirectory', 'Missing critical email directories in production');
      }
    }
  }

  /* ------------------------- Transporter Management ------------------------- */

  private async initializeTransporter(): Promise<void> {
    if (this.isInitializing) {
      logger.debug('initializeTransporter', 'Initialization in progress - waiting');
      return this.initializationPromise!;
    }

    this.isInitializing = true;
    this.initializationPromise = this.setupTransporter();
    return this.initializationPromise;
  }

  private async setupTransporter(): Promise<void> {
    try {
      logger.info('setupTransporter', 'Starting SMTP transporter setup');

      this.transporter = this.createConfiguredTransporter();

      if (process.env.NODE_ENV !== 'production') {
        await this.verifyTransporterConnection();
      }

      this.setupTransporterEventListeners();
      logger.info('setupTransporter', 'SMTP transporter setup completed');
    } catch (error) {
      this.handleInitializationError(error);
      throw error;
    } finally {
      this.isInitializing = false;
    }
  }

  private createConfiguredTransporter(): Mail {
    return nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: false, // true for 465, false for other ports
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASSWORD,
      },
      requireTLS: true, // Use TLS
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      connectionTimeout: 15000,
      socketTimeout: 30000,
      debug: process.env.NODE_ENV === 'development',
      logger: process.env.NODE_ENV === 'development'
    });
  }

  private async verifyTransporterConnection(): Promise<void> {
    try {
      logger.debug('verifyTransporterConnection', 'Starting verification');
      await Promise.race([
        this.transporter!.verify(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Verification timeout')), 10000)
        )
      ]);
      logger.info('verifyTransporterConnection', 'Verification successful');
    } catch (error) {
      logger.warn('verifyTransporterConnection', 'Verification failed (proceeding anyway)', error);
    }
  }

  private setupTransporterEventListeners(): void {
    this.transporter!
      .on('error', (err) => {
        logger.error('transportError', 'Transport error', err);
        this.transporter = undefined;
      })
      .on('idle', () => logger.debug('transportState', 'Transport idle'));
  }

  private handleInitializationError(error: unknown): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('handleInitializationError', `Initialization failed: ${errorMessage}`, error);
    this.transporter = undefined;
  }

  /* ------------------------- Email Sending Methods ------------------------- */

  public async sendEmail(mailOptions: Mail.Options): Promise<SentMessageInfo> {
    const startTime = Date.now();
    const recipient = mailOptions.to as string;

    try {
      logger.info('sendEmail', `Sending email to ${recipient}`, {
        subject: mailOptions.subject
      });

      const transporter = await this.ensureHealthyTransporter();
      const platformName = await this.getPlatformName();
      const emailOptions = this.prepareEmailOptions(mailOptions, platformName!);

      const result = await this.sendWithTimeout(transporter, emailOptions);

      logger.info('sendEmail', `Email sent successfully to ${recipient}`, {
        messageId: result.messageId,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      this.handleEmailError(error, recipient);
      throw error;
    }
  }

  private async ensureHealthyTransporter(): Promise<Mail> {
    if (this.isInitializing && this.initializationPromise) {
      await this.initializationPromise;
    }

    if (!this.transporter) {
      await this.initializeTransporter();
      if (!this.transporter) {
        throw new Error('Failed to initialize email transporter');
      }
    }

    return this.transporter;
  }

  private async getPlatformName(): Promise<string> {
    try {
      // You can implement a caching mechanism here if needed
      return 'MeetnMart';
    } catch (error) {
      logger.warn('getPlatformName', 'Failed to get platform name, using default', error);
      return 'MeetnMart';
    }
  }

  private prepareEmailOptions(mailOptions: Mail.Options, platformName: string): Mail.Options {
    const options: Mail.Options = {
      ...mailOptions,
      from: `"${platformName}" <${EMAIL_FROM}>`,
      headers: {
        ...mailOptions.headers,
        'X-Mailer': 'NodeMailer'
      }
    };

    if (options.html && !options.text) {
      options.text = this.htmlToText(options.html.toString());
    }

    return options;
  }

  private async sendWithTimeout(transporter: Mail, options: Mail.Options): Promise<SentMessageInfo> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Email sending timed out after 30 seconds')), 30000);
    });

    return Promise.race([
      transporter.sendMail(options),
      timeoutPromise
    ]);
  }

  private handleEmailError(error: unknown, recipient: string): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('handleEmailError', `Failed to send to ${recipient}: ${errorMessage}`, error);

    if (errorMessage.includes('auth') || errorMessage.includes('timeout')) {
      logger.info('handleEmailError', 'Auth/timeout issue - reinitializing');
      this.transporter = undefined;
    }
  }

  /* ------------------------- Template Email Methods ------------------------- */

  public async sendTemplateEmail(config: EmailConfig): Promise<SentMessageInfo> {
    const startTime = Date.now();

    try {
      logger.info('sendTemplateEmail', `Preparing email to ${config.to}`, {
        template: config.template
      });

      const platformName = await this.getPlatformName();
      const appUrl = await this.getAppUrl();
      const defaultData = this.createDefaultTemplateData(platformName, appUrl);
      const html = await this.renderTemplate(config.template, { ...defaultData, ...config }, config.layout);

      return this.sendEmail({
        to: config.to,
        subject: config.subject ?? platformName,
        html,
        text: this.htmlToText(html),
        attachments: config.attachments
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('sendTemplateEmail', `Failed to send to ${config.to}: ${errorMessage}`, error);
      throw new Error(`Failed to send template email: ${errorMessage}`);
    } finally {
      logger.info('sendTemplateEmail', `Process completed in ${Date.now() - startTime}ms`);
    }
  }

  private async getAppUrl(): Promise<string> {
    try {
      // You can implement a caching mechanism here if needed
      return getEnvVar('APP_URL', 'https://meetnmart.com');
    } catch (error) {
      logger.warn('getAppUrl', 'Failed to get app URL, using default', error);
      return 'https://meetnmart.com';
    }
  }

  private createDefaultTemplateData(platformName: string, appUrl: string): TemplateData {
    return {
      contact_us_email: EMAIL_FROM,
      app_logo_url: `${appUrl}/apple-icon-precomposed.jpg`,
      login_url: `${appUrl}/?utm_source=email`,
      app_name: platformName,
      app_url: appUrl,
      support_email: SUPPORT_EMAIL || EMAIL_FROM,
    };
  }

  public async sendEmailWithRetry(options: Mail.Options): Promise<SentMessageInfo> {
    return this.retry(
      () => this.sendEmail(options),
      3,
      1000,
      2
    );
  }

  /* ------------------------- Template Rendering Methods ------------------------- */

  private async renderTemplate(template: string, data: TemplateData, layout = 'base'): Promise<string> {
    const startTime = Date.now();
    const cacheKey = this.getTemplateCacheKey(template, data, layout);

    try {
      if (process.env.NODE_ENV === 'production') {
        const cached = this.templateCache.get(cacheKey);
        if (cached) {
          logger.debug('renderTemplate', `Using cached template: ${template}`);
          return cached;
        }
      }

      const templatePath = this.validateTemplatePath(template);
      const content = await this.renderTemplateContent(templatePath, data);
      const result = layout ? await this.renderWithLayout(layout, content, data) : content;

      this.cacheTemplateResult(cacheKey, result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorContext = {
        template,
        layout,
        dataKeys: Object.keys(data),
        error: errorMessage
      };

      logger.error('renderTemplate', `Failed to render ${template}: ${errorMessage}`, errorContext);
      throw new Error(`Failed to render template '${template}' with layout '${layout}': ${errorMessage}`);
    } finally {
      logger.debug('renderTemplate', `Rendered ${template} in ${Date.now() - startTime}ms`);
    }
  }

  private getTemplateCacheKey(template: string, data: TemplateData, layout?: string): string {
    const dataString = JSON.stringify(data, Object.keys(data).sort());
    return `${template}:${layout || 'none'}:${dataString}`;
  }

  private validateTemplatePath(template: string): string {
    const templatePath = path.join(this.emailsDir, 'templates', `${template}.ejs`);
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Template not found: ${templatePath}`);
    }
    return templatePath;
  }

  private async renderTemplateContent(templatePath: string, data: TemplateData): Promise<string> {
    const options: ejs.Options = {
      root: this.emailsDir,
      views: [
        path.join(this.emailsDir, 'templates'),
        path.join(this.emailsDir, 'components'),
        path.join(this.emailsDir, 'layouts/partials')
      ],
      cache: process.env.NODE_ENV === 'production',
      async: false,
      filename: templatePath,
    };

    const helpers = {
      include: (file: string, localData = {}) => this.renderPartial(file, { ...data, ...localData }),
      component: (name: string, localData = {}) => this.renderComponent(name, { ...data, ...localData }),
      partial: (name: string, localData = {}) => this.renderLayoutPartial(name, { ...data, ...localData }),
    };

    const templateContent = fs.readFileSync(templatePath, 'utf-8');
    return ejs.render(templateContent, { ...data, ...helpers }, options);
  }

  private async renderWithLayout(layout: string, content: string, data: TemplateData): Promise<string> {
    const layoutPath = path.join(this.emailsDir, 'layouts', `${layout}.ejs`);
    if (!fs.existsSync(layoutPath)) {
      throw new Error(`Layout not found: ${layoutPath}`);
    }

    const layoutOptions: ejs.Options = {
      root: this.emailsDir,
      views: [
        path.join(this.emailsDir, 'templates'),
        path.join(this.emailsDir, 'components'),
        path.join(this.emailsDir, 'layouts/partials')
      ],
      cache: process.env.NODE_ENV === 'production',
      async: false,
      filename: layoutPath,
    };

    // Add the helper functions to the layout context
    const helpers = {
      include: (file: string, localData = {}) => this.renderPartial(file, { ...data, ...localData }),
      component: (name: string, localData = {}) => this.renderComponent(name, { ...data, ...localData }),
      partial: (name: string, localData = {}) => this.renderLayoutPartial(name, { ...data, ...localData }),
    };

    const layoutContent = fs.readFileSync(layoutPath, 'utf-8');
    return ejs.render(layoutContent, { ...data, ...helpers, content }, layoutOptions);
  }

  private cacheTemplateResult(cacheKey: string, result: string): void {
    if (process.env.NODE_ENV === 'production') {
      this.templateCache.set(cacheKey, result);
      if (this.templateCache.size > 100) {
        this.templateCache.delete(this.templateCache.keys().next().value);
      }
    }
  }

  private renderLayoutPartial(partial: string, data: TemplateData): string {
    const partialPath = path.join(this.emailsDir, 'layouts/partials', `${partial}.ejs`);
    if (!fs.existsSync(partialPath)) {
      throw new Error(`Layout partial not found: ${partial}`);
    }
    return this.renderFile(partialPath, data, 'renderLayoutPartial');
  }

  private renderComponent(component: string, data: TemplateData): string {
    const componentPath = path.join(this.emailsDir, 'components', `${component}.ejs`);
    if (!fs.existsSync(componentPath)) {
      throw new Error(`Component not found: ${component}`);
    }
    return this.renderFile(componentPath, data, 'renderComponent');
  }

  private renderPartial(partial: string, data: TemplateData): string {
    // First check for component files
    const componentPath = path.join(this.emailsDir, 'components', `${partial}.ejs`);
    if (fs.existsSync(componentPath)) {
      return this.renderComponent(partial, data);
    }

    // Then check for layout partials
    const partialPath = path.join(this.emailsDir, 'layouts/partials', `${partial}.ejs`);
    if (fs.existsSync(partialPath)) {
      return this.renderLayoutPartial(partial, data);
    }

    throw new Error(`Partial not found: ${partial} (checked components and layouts/partials directories)`);
  }

  private renderFile(filePath: string, data: TemplateData, context: string): string {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const options: ejs.Options = {
        root: path.dirname(filePath),
        cache: process.env.NODE_ENV === 'production',
        filename: filePath,
      };

      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return ejs.render(fileContent, data, options) as string;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(context, `Failed to render ${filePath}: ${errorMessage}`, error);
      throw new Error(`Failed to render file: ${errorMessage}`);
    }
  }

  /* ------------------------- Utility Methods ------------------------- */

  public async retry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delayMs = 1000,
    backoffFactor = 2
  ): Promise<T> {
    let lastError: Error | null = null;
    let currentDelay = delayMs;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt > maxRetries) {
          logger.error('retry', `Operation failed after ${maxRetries + 1} attempts`, lastError);
          throw new Error(`Operation failed after ${maxRetries + 1} attempts: ${lastError.message}`);
        }

        logger.warn(
          'retry',
          `Attempt ${attempt}/${maxRetries + 1} failed, retrying in ${currentDelay}ms`,
          lastError.message
        );

        await new Promise(resolve => setTimeout(resolve, currentDelay));
        currentDelay = Math.floor(currentDelay * backoffFactor * (Math.random() * 0.3 + 0.85));
      }
    }

    throw lastError || new Error('Unexpected error in retry mechanism');
  }

  private htmlToText(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}

// Export a singleton instance
const mailerV2 = MailerV2.getInstance();

// Also export the class for testing or other use cases
export { mailerV2 };