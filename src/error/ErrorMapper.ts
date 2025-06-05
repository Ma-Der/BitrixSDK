import { BitrixError } from "./bitrixError";
import { BitrixErrorDetails, BitrixErrorResponse } from "./types";

export class ErrorMapper {
    private static readonly SYSTEM_ERRORS: Record<string, Partial<BitrixErrorDetails>> = {
      // 5xx Server Errors
      'INTERNAL_SERVER_ERROR': {
        httpStatus: 500,
        isSystemError: true,
        isRetryable: true,
        requiresAuth: false,
        message: 'Internal server error has occurred'
      },
      'ERROR_UNEXPECTED_ANSWER': {
        httpStatus: 500,
        isSystemError: true,
        isRetryable: true,
        requiresAuth: false,
        message: 'Server returned an unexpected response'
      },
  
      // 503 Service Unavailable
      'QUERY_LIMIT_EXCEEDED': {
        httpStatus: 503,
        isSystemError: true,
        isRetryable: true,
        requiresAuth: false,
        message: 'Request intensity limit has been exceeded'
      },
      'OVERLOAD_LIMIT': {
        httpStatus: 503,
        isSystemError: true,
        isRetryable: true,
        requiresAuth: false,
        message: 'REST API is blocked due to overload'
      },
  
      // 405 Method Not Allowed
      'ERROR_BATCH_METHOD_NOT_ALLOWED': {
        httpStatus: 405,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: false,
        message: 'Method is not allowed for batch usage'
      },
  
      // 400 Bad Request
      'ERROR_BATCH_LENGTH_EXCEEDED': {
        httpStatus: 400,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: false,
        message: 'Maximum batch length exceeded'
      },
      'INVALID_REQUEST': {
        httpStatus: 400,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: false,
        message: 'HTTPS protocol is required for calling REST methods'
      },
  
      // 401 Unauthorized
      'NO_AUTH_FOUND': {
        httpStatus: 401,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: true,
        message: 'Invalid access token or webhook code'
      },
      'expired_token': {
        httpStatus: 401,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: true,
        message: 'The provided access token has expired'
      },
  
      // 403 Forbidden
      'ACCESS_DENIED': {
        httpStatus: 403,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: false,
        message: 'REST API is available only on commercial plans'
      },
      'INVALID_CREDENTIALS': {
        httpStatus: 403,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: true,
        message: 'User lacks required permissions'
      },
      'insufficient_scope': {
        httpStatus: 403,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: true,
        message: 'The request requires higher privileges than provided by the webhook token'
      },
      'user_access_error': {
        httpStatus: 403,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: false,
        message: 'User does not have access to the application'
      },
  
      // 404 Not Found
      'ERROR_MANIFEST_IS_NOT_AVAILABLE': {
        httpStatus: 404,
        isSystemError: true,
        isRetryable: false,
        requiresAuth: false,
        message: 'Manifest is not available'
      }
    };
  
    /**
     * Mapuj odpowiedź HTTP na BitrixError
     */
    static mapHttpResponse(response: Response, responseBody?: any): BitrixError {
      const httpStatus = response.status;
      
      // Próbuj wyciągnąć informacje o błędzie z JSON response
      if (responseBody && typeof responseBody === 'object') {
        if (responseBody.error) {
          return this.mapApiError(responseBody, httpStatus);
        }
      }
  
      // Fallback na podstawie HTTP status
      return this.mapHttpStatus(httpStatus, responseBody);
    }
  
    /**
     * Mapuj błąd API (z JSON response)
     */
    static mapApiError(errorResponse: BitrixErrorResponse, httpStatus: number): BitrixError {
      const code = errorResponse.error;
      const description = errorResponse.error_description || 'Unknown error';
  
      const systemError = this.SYSTEM_ERRORS[code];
      
      const details: BitrixErrorDetails = {
        code,
        message: description,
        httpStatus: systemError?.httpStatus || httpStatus,
        isSystemError: !!systemError,
        isRetryable: systemError?.isRetryable || false,
        requiresAuth: systemError?.requiresAuth || false
      };
  
      return new BitrixError(details, errorResponse);
    }
  
    /**
     * Mapuj błąd na podstawie HTTP status (gdy brak JSON response)
     */
    static mapHttpStatus(httpStatus: number, responseBody?: any): BitrixError {
      let code: string;
      let message: string;
      let isRetryable = false;
      let requiresAuth = false;
  
      switch (httpStatus) {
        case 400:
          code = 'BAD_REQUEST';
          message = 'Bad request';
          break;
        case 401:
          code = 'UNAUTHORIZED';
          message = 'Unauthorized access';
          requiresAuth = true;
          break;
        case 403:
          code = 'FORBIDDEN';
          message = 'Access forbidden';
          break;
        case 404:
          code = 'NOT_FOUND';
          message = 'Resource not found';
          break;
        case 405:
          code = 'METHOD_NOT_ALLOWED';
          message = 'Method not allowed';
          break;
        case 429:
          code = 'TOO_MANY_REQUESTS';
          message = 'Too many requests';
          isRetryable = true;
          break;
        case 500:
          code = 'INTERNAL_SERVER_ERROR';
          message = 'Internal server error';
          isRetryable = true;
          break;
        case 502:
          code = 'BAD_GATEWAY';
          message = 'Bad gateway';
          isRetryable = true;
          break;
        case 503:
          code = 'SERVICE_UNAVAILABLE';
          message = 'Service unavailable';
          isRetryable = true;
          break;
        case 504:
          code = 'GATEWAY_TIMEOUT';
          message = 'Gateway timeout';
          isRetryable = true;
          break;
        default:
          code = 'UNKNOWN_HTTP_ERROR';
          message = `HTTP ${httpStatus} error`;
          isRetryable = httpStatus >= 500;
      }
  
      const details: BitrixErrorDetails = {
        code,
        message,
        httpStatus,
        isSystemError: false,
        isRetryable,
        requiresAuth
      };
  
      return new BitrixError(details, responseBody);
    }
  
    /**
     * Sprawdź czy kod błędu jest znany jako system error
     */
    static isSystemError(code: string): boolean {
      return code in this.SYSTEM_ERRORS;
    }
  
    /**
     * Pobierz wszystkie kody błędów systemowych
     */
    static getSystemErrorCodes(): string[] {
      return Object.keys(this.SYSTEM_ERRORS);
    }
  }