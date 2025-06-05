import { BitrixErrorDetails } from "./types";

export class BitrixError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly isSystemError: boolean;
  public readonly isRetryable: boolean;
  public readonly requiresAuth: boolean;
  public readonly originalResponse?: any;

  constructor(details: BitrixErrorDetails, originalResponse?: any) {
    super(details.message);
    this.name = 'BitrixError';
    this.code = details.code;
    this.httpStatus = details.httpStatus;
    this.isSystemError = details.isSystemError;
    this.isRetryable = details.isRetryable;
    this.requiresAuth = details.requiresAuth;
    this.originalResponse = originalResponse;
  }

  /**
   * Sprawdź czy błąd wymaga ponownej autoryzacji
   */
  isAuthError(): boolean {
    return this.requiresAuth || ['NO_AUTH_FOUND', 'expired_token', 'INVALID_CREDENTIALS'].includes(this.code);
  }

  /**
   * Sprawdź czy błąd jest związany z rate limiting
   */
  isRateLimitError(): boolean {
    return ['QUERY_LIMIT_EXCEEDED', 'OVERLOAD_LIMIT'].includes(this.code);
  }

  /**
   * Sprawdź czy błąd jest tymczasowy (warto ponowić próbę)
   */
  isTemporaryError(): boolean {
    return this.isRetryable;
  }

  /**
   * Pobierz sugerowany czas oczekiwania przed ponowną próbą (w ms)
   */
  getRetryAfter(): number {
    if (this.isRateLimitError()) {
      return 60000; // 1 minuta dla rate limit
    }
    if (this.httpStatus >= 500) {
      return 5000; // 5 sekund dla błędów serwera
    }
    return 0;
  }

  /**
   * Reprezentacja błędu jako string
   */
  toString(): string {
    return `BitrixError [${this.code}]: ${this.message} (HTTP ${this.httpStatus})`;
  }
}