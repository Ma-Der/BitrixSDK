import { BitrixError } from './bitrixError';
import { BitrixErrorDetails } from './types';

export interface ErrorHandlerOptions {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (error: BitrixError, attempt: number) => void;
    onAuthRequired?: (error: BitrixError) => Promise<void>;
    onRateLimit?: (error: BitrixError) => Promise<void>;
  }
  
  export class ErrorHandler {
    private options: Required<ErrorHandlerOptions>;
  
    constructor(options: ErrorHandlerOptions = {}) {
      this.options = {
        maxRetries: options.maxRetries ?? 3,
        retryDelay: options.retryDelay ?? 1000,
        onRetry: options.onRetry ?? (() => {}),
        onAuthRequired: options.onAuthRequired ?? (async () => {}),
        onRateLimit: options.onRateLimit ?? (async () => {})
      };
    }
  
    /**
     * Obsłuż błąd z automatycznym retry
     */
    async handleWithRetry<T>(
      operation: () => Promise<T>,
      context?: string
    ): Promise<T> {
      let lastError: BitrixError;
      
      for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = this.ensureBitrixError(error);
          
          // Jeśli to ostatnia próba, rzuć błąd
          if (attempt === this.options.maxRetries) {
            break;
          }
  
          // Sprawdź czy warto ponowić próbę
          if (!lastError.isRetryable) {
            break;
          }
  
          // Obsłuż specjalne przypadki
          if (lastError.isAuthError()) {
            await this.options.onAuthRequired(lastError);
            // Po re-auth spróbuj ponownie natychmiast
            continue;
          }
  
          if (lastError.isRateLimitError()) {
            await this.options.onRateLimit(lastError);
          }
  
          // Poczekaj przed ponowną próbą
          const delay = lastError.getRetryAfter() || this.options.retryDelay;
          
          this.options.onRetry(lastError, attempt + 1);
          console.warn(`⚠️  Retrying ${context || 'operation'} in ${delay}ms (attempt ${attempt + 1}/${this.options.maxRetries})`);
          
          await this.sleep(delay);
        }
      }
  
      throw lastError!;
    }
  
    /**
     * Upewnij się że błąd jest instancją BitrixError
     */
    private ensureBitrixError(error: any): BitrixError {
      if (error instanceof BitrixError) {
        return error;
      }
  
      // Konwertuj standardowy Error na BitrixError
      const details: BitrixErrorDetails = {
        code: 'UNKNOWN_ERROR',
        message: error.message || 'Unknown error occurred',
        httpStatus: 500,
        isSystemError: false,
        isRetryable: false,
        requiresAuth: false
      };
  
      return new BitrixError(details, error);
    }
  
    /**
     * Helper do oczekiwania
     */
    private sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  }
  
  export * from './bitrixError';
  export * from './ErrorMapper';
  export * from './ErrorHandler';
  export * from './types';