export interface BitrixErrorResponse {
  error: string;
  error_description: string;
}

export interface BitrixErrorDetails {
  code: string;
  message: string;
  httpStatus: number;
  isSystemError: boolean;
  isRetryable: boolean;
  requiresAuth: boolean;
}
