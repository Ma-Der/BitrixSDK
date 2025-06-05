import { BitrixConfig, BitrixOAuth2, TokenResponse } from "../auth/oauth2";
import { TokenManager, TokenManagerEvents } from "../auth/token-manager";
import { BitrixRateLimiter, RateLimitConfig } from "../rateLimiter/rateLimiter";
import { CRM } from "../modules/crm/CRM";
import { BitrixError } from "../error/bitrixError";
import { ErrorHandler } from "../error/ErrorHandler";
import { ErrorMapper } from "../error/ErrorMapper";

export interface SDKEvents extends TokenManagerEvents {
  onAuthRequired?: () => void;
  onAuthSuccess?: (tokens: TokenResponse) => void;
  onApiCallStart?: (method: string, params: any) => void;
  onApiCallSuccess?: (method: string, result: any) => void;
  onApiCallError?: (method: string, error: Error) => void;
}

export interface SDKOptions {
  tokens?: TokenResponse;
  events?: SDKEvents;
  autoAuth?: boolean; // Czy automatycznie rozpocząć autoryzację gdy brak tokenów
  rateLimiting?: {
    enabled?: boolean;
    config?: Partial<RateLimitConfig>;
    enterprisePlan?: boolean; // Auto-configure for Enterprise plan
  };
}

export class BitrixSDK {
  private oauth: BitrixOAuth2;
  private tokenManager: TokenManager;
  private rateLimiter: BitrixRateLimiter | null = null;
  private baseUrl: string;
  private events: SDKEvents;
  private autoAuth: boolean;
  private authInProgress: boolean = false;
  private errorHandler: ErrorHandler;

  // CRM Module
  public readonly crm: CRM;

  constructor(config: BitrixConfig, options: SDKOptions = {}) {
    this.oauth = new BitrixOAuth2(config);
    this.events = options.events || {};
    this.autoAuth = options.autoAuth ?? true;

    // Initialize rate limiter if enabled
    if (options.rateLimiting?.enabled !== false) {
      this.rateLimiter = new BitrixRateLimiter(options.rateLimiting?.config);
      
      if (options.rateLimiting?.enterprisePlan) {
        this.rateLimiter.setEnterprisePlan();
      } else {
        this.rateLimiter.setStandardPlan();
      }
      
      console.log('🚦 Rate limiting enabled');
    }

    // Initialize TokenManager with events
    this.tokenManager = new TokenManager(
      this.oauth, 
      options.tokens,
      {
        onTokenRefreshed: (tokens) => {
          this.events.onTokenRefreshed?.(tokens);
        },
        onTokenExpired: () => {
          this.events.onTokenExpired?.();
          this.events.onAuthRequired?.();
        },
        onRefreshFailed: (error) => {
          this.events.onRefreshFailed?.(error);
          this.events.onAuthRequired?.();
        }
      }
    );

    this.baseUrl = `https://${config.domain}/rest`;

    // Initialize error handler
    this.errorHandler = new ErrorHandler({
      maxRetries: 3,
      retryDelay: 1000,
      onRetry: (error, attempt) => {
        console.warn(`🔄 Retrying API call: ${error.code} (attempt ${attempt})`);
      },
      onAuthRequired: async (error) => {
        console.warn('🔐 Authentication required due to error:', error.code);
        this.events.onAuthRequired?.();
      },
      onRateLimit: async (error) => {
        console.warn('⏰ Rate limit encountered:', error.message);
        // Rate limiter already handles delays
      }
    });

    // Initialize CRM module
    this.crm = new CRM(this);
  }

  /**
   * Główna metoda autoryzacji - uruchamia lokalny serwer OAuth
   */
  async authorize(): Promise<TokenResponse> {
    if (this.authInProgress) {
      throw new Error('Authorization already in progress');
    }

    this.authInProgress = true;

    try {
      console.log('🚀 Starting Bitrix24 authorization...');
      const tokens = await this.oauth.authorize();
      
      this.tokenManager.setTokens(tokens);
      this.events.onAuthSuccess?.(tokens);
      
      console.log(`🔑 Access token received (expires in ${tokens.expires_in} seconds)`);
      return tokens;
    } catch (error) {
      console.error('❌ Authorization failed:', error);
      throw error;
    } finally {
      this.authInProgress = false;
    }
  }

  /**
   * Pobierz URL autoryzacji (dla custom flow)
   */
  getAuthUrl(redirectUri?: string): string {
    return this.oauth.getAuthUrl(redirectUri);
  }

  /**
   * Obsługa callback z aplikacji webowych (dla custom flow)
   */
  async handleCallback(code: string, redirectUri?: string): Promise<TokenResponse> {
    try {
      console.log('🔄 Processing authorization callback...');
      const tokens = await this.oauth.handleCallback(code, redirectUri);
      
      this.tokenManager.setTokens(tokens);
      this.events.onAuthSuccess?.(tokens);
      
      console.log('✅ Authorization via callback successful!');
      return tokens;
    } catch (error) {
      console.error('❌ Callback processing failed:', error);
      throw error;
    }
  }

  /**
   * Upewnij się że użytkownik jest zautoryzowany
   * Automatycznie rozpocznie autoryzację jeśli brak tokenów i autoAuth=true
   */
  async ensureAuthenticated(): Promise<void> {
    // Sprawdź czy mamy ważne tokeny
    if (this.tokenManager.hasValidTokens()) {
      return;
    }

    // Jeśli mamy tokeny ale są wygasłe, spróbuj je odświeżyć
    if (this.tokenManager.hasTokens()) {
      try {
        await this.tokenManager.getValidToken(); // To automatycznie odświeży tokeny
        return;
      } catch (error) {
        // Odświeżanie się nie powiodło, potrzebna nowa autoryzacja
        console.warn('⚠️  Token refresh failed, clearing tokens');
        this.tokenManager.clearTokens();
      }
    }

    // Brak ważnych tokenów
    this.events.onAuthRequired?.();

    if (this.autoAuth) {
      // Automatycznie rozpocznij autoryzację
      console.log('🔐 No valid tokens found. Starting authorization...');
      await this.authorize();
    } else {
      // Rzuć błąd, jeśli autoAuth wyłączone
      throw new Error('Authentication required. Please call authorize() or provide valid tokens.');
    }
  }

  /**
   * Wykonaj zapytanie do API z automatyczną autoryzacją i rate limiting
   */
  async apiCall(method: string, params: Record<string, any> = {}, priority: number = 0): Promise<any> {
    this.events.onApiCallStart?.(method, params);

    const executeRequest = async (): Promise<any> => {
      try {
        // Upewnij się że jesteśmy zautoryzowani
        await this.ensureAuthenticated();
        
        // Pobierz ważny token
        const token = await this.tokenManager.getValidToken();
        
        const url = `${this.baseUrl}/${method}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(params)
        });

        // Parse response body
        let responseBody: any;
        try {
          responseBody = await response.json();
        } catch (parseError) {
          // If JSON parsing fails, use text
          responseBody = await response.text();
        }

        if (!response.ok) {
          // Map HTTP error to BitrixError
          throw ErrorMapper.mapHttpResponse(response, responseBody);
        }

        // Check for Bitrix API errors in successful HTTP response
        if (responseBody && typeof responseBody === 'object' && responseBody.error) {
          throw ErrorMapper.mapApiError(responseBody, response.status);
        }

        this.events.onApiCallSuccess?.(method, responseBody);
        return responseBody;

      } catch (error) {
        // Ensure error is BitrixError for consistent handling
        const bitrixError = error instanceof BitrixError ? 
          error : 
          ErrorMapper.mapHttpResponse(new Response(null, { status: 500 }), error);
          
        this.events.onApiCallError?.(method, bitrixError);
        throw bitrixError;
      }
    };

    // Use error handler with retry logic
    const operation = async () => {
      if (this.rateLimiter) {
        return this.rateLimiter.executeRequest(method, executeRequest, priority);
      } else {
        return executeRequest();
      }
    };

    return this.errorHandler.handleWithRetry(operation, `API call: ${method}`);
  }

  /**
   * Wykonaj zapytanie do API bez automatycznej autoryzacji
   * Rzuci błąd jeśli brak ważnych tokenów
   */
  async apiCallRaw(method: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.tokenManager.hasValidTokens()) {
      throw new Error('No valid tokens available. Call ensureAuthenticated() first.');
    }

    return this.apiCall(method, params);
  }

  // === High Priority API Calls ===

  /**
   * Wykonaj zapytanie z wysokim priorytetem (omija kolejkę)
   */
  async apiCallHighPriority(method: string, params: Record<string, any> = {}): Promise<any> {
    return this.apiCall(method, params, 100);
  }

  /**
   * Wykonaj zapytanie z niskim priorytetem (może czekać w kolejce)
   */
  async apiCallLowPriority(method: string, params: Record<string, any> = {}): Promise<any> {
    return this.apiCall(method, params, -100);
  }

  // === Batch operations with rate limiting ===

  /**
   * Wykonaj wiele zapytań jednocześnie z optymalizacją rate limiting
   */
  async batch(calls: Array<{ method: string; params?: Record<string, any> }>, priority: number = 0) {
    // Jeśli rate limiting włączony i dużo calls, użyj chunking
    if (this.rateLimiter && calls.length > 10) {
      console.log(`📦 Batch processing ${calls.length} calls with rate limiting`);
      return this.batchWithChunking(calls, priority);
    }

    const cmd = calls.reduce((acc, call, index) => {
      acc[`cmd_${index}`] = `${call.method}?${new URLSearchParams(call.params || {}).toString()}`;
      return acc;
    }, {} as Record<string, string>);

    return this.apiCall('batch', { cmd }, priority);
  }

  /**
   * Batch z podziałem na chunki dla rate limiting
   */
  private async batchWithChunking(
    calls: Array<{ method: string; params?: Record<string, any> }>, 
    priority: number = 0
  ): Promise<any> {
    const chunkSize = 50; // Bitrix batch limit
    const chunks = [];
    
    for (let i = 0; i < calls.length; i += chunkSize) {
      chunks.push(calls.slice(i, i + chunkSize));
    }

    const results = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`📦 Processing batch chunk ${i + 1}/${chunks.length} (${chunk.length} calls)`);
      
      const cmd = chunk.reduce((acc, call, index) => {
        acc[`cmd_${index}`] = `${call.method}?${new URLSearchParams(call.params || {}).toString()}`;
        return acc;
      }, {} as Record<string, string>);

      const result = await this.apiCall('batch', { cmd }, priority);
      results.push(result);
      
      // Krótka pauza między chunkami jeśli rate limiting włączony
      if (this.rateLimiter && i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Scal wyniki
    return {
      result: results.reduce((acc, result) => ({ ...acc, ...result.result }), {}),
      total: results.reduce((sum, result) => sum + (result.total || 0), 0)
    };
  }

  // === Rate Limiting Control ===

  /**
   * Włącz/wyłącz rate limiting
   */
  setRateLimiting(enabled: boolean, config?: Partial<RateLimitConfig>): void {
    if (enabled && !this.rateLimiter) {
      this.rateLimiter = new BitrixRateLimiter(config);
      console.log('🚦 Rate limiting enabled');
    } else if (!enabled && this.rateLimiter) {
      this.rateLimiter.destroy();
      this.rateLimiter = null;
      console.log('🚦 Rate limiting disabled');
    } else if (enabled && this.rateLimiter && config) {
      // Recreate with new config
      this.rateLimiter.destroy();
      this.rateLimiter = new BitrixRateLimiter(config);
      console.log('🚦 Rate limiting reconfigured');
    }
  }

  /**
   * Ustaw plan Enterprise dla rate limiting
   */
  setEnterprisePlan(): void {
    if (this.rateLimiter) {
      this.rateLimiter.setEnterprisePlan();
    } else {
      console.warn('⚠️  Rate limiting not enabled. Call setRateLimiting(true) first.');
    }
  }

  /**
   * Pobierz status rate limiting
   */
  getRateLimitStatus(): {
    enabled: boolean;
    requestCounter?: number;
    isBlocked?: boolean;
    queueLength?: number;
    operatingTimeUsed?: number;
    operatingTimeLimit?: number;
    blockedMethods?: string[];
    config?: RateLimitConfig;
  } {
    if (!this.rateLimiter) {
      return { enabled: false };
    }
    
    const status = this.rateLimiter.getStatus();
    return {
      enabled: true,
      requestCounter: status.requestCounter,
      isBlocked: status.isBlocked,
      queueLength: status.queueLength,
      operatingTimeUsed: status.operatingTimeUsed,
      operatingTimeLimit: status.operatingTimeLimit,
      blockedMethods: status.blockedMethods,
      config: status.config
    };
  }

  /**
   * Sprawdź status autoryzacji i rate limiting
   */
  getAuthStatus(): {
    isAuthenticated: boolean;
    hasTokens: boolean;
    hasValidTokens: boolean;
    tokenExpiresIn: number;
    tokenExpirationTime: Date | null;
    authInProgress: boolean;
    rateLimiting: {
      enabled: boolean;
      requestCounter?: number;
      isBlocked?: boolean;
      queueLength?: number;
      operatingTimeUsed?: number;
      operatingTimeLimit?: number;
      blockedMethods?: string[];
      config?: RateLimitConfig;
    };
  } {
    const authStatus = {
      isAuthenticated: this.tokenManager.hasValidTokens(),
      hasTokens: this.tokenManager.hasTokens(),
      hasValidTokens: this.tokenManager.hasValidTokens(),
      tokenExpiresIn: this.tokenManager.getTokenExpiresIn(),
      tokenExpirationTime: this.tokenManager.getTokenExpirationTime(),
      authInProgress: this.authInProgress
    };

    if (this.rateLimiter) {
      const rateLimitStatus = this.rateLimiter.getStatus();
      return {
        ...authStatus,
        rateLimiting: {
          enabled: true,
          requestCounter: rateLimitStatus.requestCounter,
          isBlocked: rateLimitStatus.isBlocked,
          queueLength: rateLimitStatus.queueLength,
          operatingTimeUsed: rateLimitStatus.operatingTimeUsed,
          operatingTimeLimit: rateLimitStatus.operatingTimeLimit,
          blockedMethods: rateLimitStatus.blockedMethods,
          config: rateLimitStatus.config
        }
      };
    }

    return {
      ...authStatus,
      rateLimiting: {
        enabled: false
      }
    };
  }

  /**
   * Pobierz tokeny (kopia do zapisu)
   */
  getTokens(): TokenResponse | null {
    return this.tokenManager.getTokens();
  }

  /**
   * Ustaw nowe tokeny
   */
  setTokens(tokens: TokenResponse): void {
    this.tokenManager.setTokens(tokens);
  }

  /**
   * Wyloguj użytkownika i wyczyść zasoby
   */
  logout(): void {
    console.log('👋 Logging out and clearing tokens...');
    this.tokenManager.clearTokens();
    
    if (this.rateLimiter) {
      this.rateLimiter.destroy();
      this.rateLimiter = null;
      console.log('🚦 Rate limiter destroyed');
    }
  }

  /**
   * Test połączenia z Bitrix
   */
  async ping(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  // === Convenience methods for common API calls ===

  /**
   * Pobierz aktualnie zalogowanego użytkownika
   */
  async getCurrentUser() {
    return this.apiCall('user.current');
  }

  /**
   * Pobierz informacje o aplikacji/prawach
   */
  async getAppInfo() {
    return this.apiCall('app.info');
  }

  /**
   * Pomocnicza metoda do pobierania wszystkich wyników z paginacją
   */
  async getAllPages<T = any>(
    method: string, 
    params: Record<string, any> = {},
    pageSize: number = 50
  ): Promise<T[]> {
    const results: T[] = [];
    let start = 0;
    let hasMore = true;

    console.log(`📄 Fetching all pages for ${method}...`);

    while (hasMore) {
      const response = await this.apiCall(method, {
        ...params,
        start,
        limit: pageSize
      });

      if (response.result) {
        results.push(...response.result);
        
        // Sprawdź czy są jeszcze wyniki
        hasMore = response.total > start + pageSize;
        start += pageSize;
        
        console.log(`📄 Fetched ${results.length}/${response.total || 'unknown'} items`);
      } else {
        hasMore = false;
      }
    }

    console.log(`✅ Fetched all ${results.length} items`);
    return results;
  }

  /**
   * Debug informacje o SDK
   */
  getDebugInfo() {
    const authStatus = this.getAuthStatus();
    const tokenDebug = this.tokenManager.getDebugInfo();
    const config = this.oauth.getConfig();

    return {
      config: {
        domain: config.domain,
        clientId: config.clientId,
        authPort: config.auth?.port,
        authTimeout: config.auth?.timeout,
        autoOpenBrowser: config.auth?.autoOpenBrowser
      },
      auth: authStatus,
      tokens: tokenDebug,
      sdk: {
        autoAuth: this.autoAuth,
        baseUrl: this.baseUrl
      }
    };
  }

  /**
   * Wyświetl debug informacje w konsoli
   */
  printDebugInfo() {
    const debug = this.getDebugInfo();
    
    console.log('\n=== Bitrix SDK Debug Info ===');
    console.log('📋 Config:', debug.config);
    console.log('🔐 Auth Status:', debug.auth);
    console.log('🎫 Token Info:', debug.tokens);
    console.log('⚙️  SDK Settings:', debug.sdk);
    console.log('==============================\n');
  }

  // === Error Handling Methods ===

  /**
   * Skonfiguruj obsługę błędów
   */
  configureErrorHandling(options: {
    maxRetries?: number;
    retryDelay?: number;
    onRetry?: (error: BitrixError, attempt: number) => void;
    onAuthRequired?: (error: BitrixError) => Promise<void>;
    onRateLimit?: (error: BitrixError) => Promise<void>;
  }): void {
    this.errorHandler = new ErrorHandler({
      maxRetries: options.maxRetries,
      retryDelay: options.retryDelay,
      onRetry: options.onRetry || ((error, attempt) => {
        console.warn(`🔄 Retrying API call: ${error.code} (attempt ${attempt})`);
      }),
      onAuthRequired: options.onAuthRequired || (async (error) => {
        console.warn('🔐 Authentication required due to error:', error.code);
        this.events.onAuthRequired?.();
      }),
      onRateLimit: options.onRateLimit || (async (error) => {
        console.warn('⏰ Rate limit encountered:', error.message);
      })
    });
  }

  /**
   * Sprawdź czy błąd jest związany z Bitrix
   */
  static isBitrixError(error: any): error is BitrixError {
    return error instanceof BitrixError;
  }

  /**
   * Pobierz wszystkie kody błędów systemowych
   */
  static getSystemErrorCodes(): string[] {
    return ErrorMapper.getSystemErrorCodes();
  }
}

// Re-export types for convenience
export { BitrixConfig, TokenResponse, BitrixError };