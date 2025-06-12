import { EventEmitter } from 'events';

export class EventManager extends EventEmitter {
    private static instance: EventManager;

    private constructor() {
        super();
    }

    public static getInstance(): EventManager {
        if (!EventManager.instance) {
            EventManager.instance = new EventManager();
        }
        return EventManager.instance;
    }

    public emitEvent(eventName: string, data?: any): boolean {
        return this.emit(eventName, data);
    }

    public onEvent(eventName: string, listener: (...args: any[]) => void): this {
        return this.on(eventName, listener);
    }

    public onceEvent(eventName: string, listener: (...args: any[]) => void): this {
        return this.once(eventName, listener);
    }

    public removeListener(eventName: string, listener: (...args: any[]) => void): this {
        return this.removeListener(eventName, listener);
    }

    public removeAllListeners(eventName?: string): this {
        return this.removeAllListeners(eventName);
    }
}

// Export a singleton instance
export const eventManager = EventManager.getInstance();
