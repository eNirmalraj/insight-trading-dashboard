// src/services/apiClient.ts
// Centralized HTTP client for all backend API calls

/**
 * Environment configuration for API client
 */
interface ApiConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  useMockApi: boolean;
}

/**
 * Get API configuration from environment variables
 */
const getConfig = (): ApiConfig => ({
  supabaseUrl: process.env.VITE_SUPABASE_URL || '',
  supabaseAnonKey: process.env.VITE_SUPABASE_ANON_KEY || '',
  useMockApi: process.env.VITE_USE_MOCK_API !== 'false',
});

/**
 * Check if the app should use mock API
 */
export const shouldUseMockApi = (): boolean => {
  const config = getConfig();
  return config.useMockApi || !config.supabaseUrl;
};

/**
 * HTTP request options
 */
interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

/**
 * Build URL with query parameters
 */
const buildUrl = (endpoint: string, params?: Record<string, string>): string => {
  const config = getConfig();
  const baseUrl = config.supabaseUrl;
  const url = new URL(endpoint, baseUrl);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  
  return url.toString();
};

/**
 * Get default headers for API requests
 */
const getDefaultHeaders = (): Record<string, string> => {
  const config = getConfig();
  return {
    'Content-Type': 'application/json',
    'apikey': config.supabaseAnonKey,
    'Authorization': `Bearer ${config.supabaseAnonKey}`,
  };
};

/**
 * Handle API response
 */
const handleResponse = async <T>(response: Response): Promise<T> => {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }
  return response.json();
};

/**
 * API Client class for making HTTP requests to the backend
 */
export const apiClient = {
  /**
   * GET request
   */
  async get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const url = buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        ...getDefaultHeaders(),
        ...options?.headers,
      },
    });
    return handleResponse<T>(response);
  },

  /**
   * POST request
   */
  async post<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    const url = buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...getDefaultHeaders(),
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  /**
   * PUT request
   */
  async put<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    const url = buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...getDefaultHeaders(),
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  /**
   * PATCH request
   */
  async patch<T>(endpoint: string, data?: unknown, options?: RequestOptions): Promise<T> {
    const url = buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...getDefaultHeaders(),
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
    return handleResponse<T>(response);
  },

  /**
   * DELETE request
   */
  async delete<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    const url = buildUrl(endpoint, options?.params);
    const response = await fetch(url, {
      method: 'DELETE',
      headers: {
        ...getDefaultHeaders(),
        ...options?.headers,
      },
    });
    return handleResponse<T>(response);
  },
};

export default apiClient;
