import { getEnvVar } from "../utils/env";

export interface WhispaConfig {
    llm: {
      provider: 'openai' | 'anthropic';
      api_key: string;
      model: string;
      max_tokens: number;
      temperature: number;
      top_p?: number;
      frequency_penalty?: number;
      presence_penalty?: number;
      store?: boolean;
    };
    marketplace: {
      name: string;
      location: string; // e.g., "Nigeria"
      user_types: string[]; // ['buyer', 'seller', 'delivery_partner']
    };
    session: {
      timeout_minutes: number;
    };
    logging: {
      enabled: boolean;
      level: 'debug' | 'info' | 'warn' | 'error';
    };
  }


  

  
  export const DEFAULT_CONFIG: WhispaConfig = {
    llm: {
      provider: 'openai',
      api_key: getEnvVar("OPENAI_API_KEY") || '',
      // model: 'gpt-4.1',
      model: 'gpt-4o-mini',
      max_tokens: 2048,
      temperature: 1,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      store: true
    },
    marketplace: {
      name: 'MeetnMart',
      location: 'Nigeria',
      user_types: ['buyer', 'seller', 'delivery_partner']
    },
    session: {
      timeout_minutes: 30
    },
    logging: {
      enabled: true,
      level: 'info'
    }
  };