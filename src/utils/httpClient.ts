import axios, { AxiosInstance, AxiosRequestConfig, CreateAxiosDefaults } from 'axios';
import { logger } from '../logger';

export class HttpClient {
  private instance: AxiosInstance;

  constructor(baseURL: string, apiKey: string, _configs?: CreateAxiosDefaults) {
    const config = {
      baseURL,
      headers: {
        Authorization: `Token ${apiKey}`,
        'Content-Type': 'application/json',
      },
      ..._configs
    }

    this.instance = axios.create(config);

    // Add interceptors for logging and error handling
    this.instance.interceptors.request.use((config) => {
      console.log({config: JSON.stringify(config)});
      
      logger.info(`Request: ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    this.instance.interceptors.response.use(
      (response) => {
        logger.info(`Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        if (axios.isAxiosError(error)) {
          console.error(`Axios Error: ${error.response?.status} ${error.response?.statusText}`, {
            url: error.config?.url,
            data: error.response?.data
          });
        } else {
          console.error(`Non-Axios Error: ${error.message}`);
        }
        
        logger.error(`Error: ${error.message}`, error, error);
        return Promise.reject(error);
      }
    );
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.get<T>(url, config);
    return response.data;
  }

  async post<T>(url: string, data: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.post<T>(url, data, config);
    return response.data;
  }

  async put<T>(url: string, data: any, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.put<T>(url, data, config);
    return response.data;
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    const response = await this.instance.delete<T>(url, config);
    return response.data;
  }
}