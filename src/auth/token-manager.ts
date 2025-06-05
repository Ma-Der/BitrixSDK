import { BitrixOAuth2, TokenResponse } from "./oauth2";

export interface TokenManagerEvents {
  onTokenRefreshed?: (tokens: TokenResponse) => void;
  onTokenExpired?: () => void;
  onRefreshFailed?: (error: Error) => void;
}

export class TokenManager {
  private tokens: TokenResponse | null = null;
  private oauth: BitrixOAuth2;
  private events: TokenManagerEvents;
  private refreshPromise: Promise<TokenResponse> | null = null;
  private tokenIssuedAt: number | null = null; // Timestamp when token was issued

  constructor(oauth: BitrixOAuth2, tokens?: TokenResponse, events?: TokenManagerEvents) {
    this.oauth = oauth;
    this.events = events || {};
    
    if (tokens) {
      this.setTokens(tokens);
    }
  }

  /**
   * Pobierz ważny access token - automatycznie odświeża jeśli potrzeba
   */
  async getValidToken(): Promise<string> {
    if (!this.tokens) {
      throw new Error('No tokens available. Please authorize first.');
    }

    // Sprawdź czy token wymaga odświeżenia (z marginesem 5 minut)
    if (this.isTokenExpiringSoon()) {
      if (!this.tokens.refresh_token) {
        this.events.onTokenExpired?.();
        throw new Error('Access token expired and no refresh token available. Re-authentication required.');
      }

      // Zapobiegaj równoległym odświeżeniom
      if (!this.refreshPromise) {
        this.refreshPromise = this.refreshTokens();
      }

      try {
        this.tokens = await this.refreshPromise;
        this.events.onTokenRefreshed?.(this.tokens);
      } catch (error) {
        this.events.onRefreshFailed?.(error as Error);
        throw error;
      } finally {
        this.refreshPromise = null;
      }
    }

    return this.tokens.access_token;
  }

  /**
   * Sprawdź czy są dostępne jakiekolwiek tokeny
   */
  hasTokens(): boolean {
    return this.tokens !== null;
  }

  /**
   * Sprawdź czy tokeny są prawdopodobnie ważne (bez wywołania API)
   */
  hasValidTokens(): boolean {
    if (!this.tokens) {
      return false;
    }

    // Jeśli token wygaśnie w ciągu 1 minuty, uznaj za nieważny
    return !this.isTokenExpired(60);
  }

  /**
   * Ustaw nowe tokeny
   */
  setTokens(tokens: TokenResponse): void {
    this.validateTokenStructure(tokens);
    this.tokens = tokens;
    this.tokenIssuedAt = Math.floor(Date.now() / 1000); // Record when we received the token
  }

  /**
   * Pobierz obecne tokeny
   */
  getTokens(): TokenResponse | null {
    return this.tokens ? { ...this.tokens } : null; // Return copy to prevent mutations
  }

  /**
   * Wyczyść tokeny
   */
  clearTokens(): void {
    this.tokens = null;
    this.tokenIssuedAt = null;
    this.refreshPromise = null;
  }

  /**
   * Czas wygaśnięcia tokenu w sekundach od teraz
   */
  getTokenExpiresIn(): number {
    if (!this.tokens || !this.tokenIssuedAt) {
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = this.tokenIssuedAt + this.tokens.expires_in;
    
    return Math.max(0, expiresAt - now);
  }

  /**
   * Pobierz timestamp wygaśnięcia tokenu
   */
  getTokenExpirationTime(): Date | null {
    if (!this.tokens || !this.tokenIssuedAt) {
      return null;
    }

    return new Date((this.tokenIssuedAt + this.tokens.expires_in) * 1000);
  }

  /**
   * Sprawdź czy token wygaśnie wkrótce
   */
  private isTokenExpiringSoon(marginMinutes: number = 5): boolean {
    return this.isTokenExpired(marginMinutes);
  }

  /**
   * Sprawdź czy token wygasł lub wygaśnie w podanym czasie
   */
  private isTokenExpired(marginMinutes: number = 0): boolean {
    if (!this.tokens || !this.tokenIssuedAt) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    const marginSeconds = marginMinutes * 60;
    const expiresAt = this.tokenIssuedAt + this.tokens.expires_in;
    
    return (expiresAt - marginSeconds) <= now;
  }

  /**
   * Odśwież tokeny
   */
  private async refreshTokens(): Promise<TokenResponse> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available');
    }

    try {
      console.log('🔄 Refreshing access token...');
      const newTokens = await this.oauth.refreshToken(this.tokens.refresh_token);
      console.log('✅ Token refreshed successfully');
      
      // Update issued time for new token
      this.tokenIssuedAt = Math.floor(Date.now() / 1000);
      
      return newTokens;
    } catch (error) {
      // Jeśli refresh token też wygasł, wyczyść tokeny
      if (error instanceof Error && error.message.includes('invalid_grant')) {
        console.warn('⚠️  Refresh token expired, clearing tokens');
        this.clearTokens();
        throw new Error('Refresh token expired. Re-authentication required.');
      }
      
      console.error('❌ Token refresh failed:', error);
      throw error;
    }
  }

  /**
   * Waliduj strukturę tokenów
   */
  private validateTokenStructure(tokens: TokenResponse): void {
    const required = ['access_token', 'expires_in', 'domain'];
    const missing = required.filter(field => !tokens[field as keyof TokenResponse]);
    
    if (missing.length > 0) {
      throw new Error(`Invalid token structure. Missing fields: ${missing.join(', ')}`);
    }

    if (typeof tokens.expires_in !== 'number' || tokens.expires_in <= 0) {
      throw new Error('Invalid expires_in value in token response');
    }
  }

  /**
   * Debug info o tokenach
   */
  getDebugInfo(): {
    hasTokens: boolean;
    hasValidTokens: boolean;
    expiresIn: number;
    expirationTime: string | null;
    issuedAt: string | null;
  } {
    return {
      hasTokens: this.hasTokens(),
      hasValidTokens: this.hasValidTokens(),
      expiresIn: this.getTokenExpiresIn(),
      expirationTime: this.getTokenExpirationTime()?.toISOString() || null,
      issuedAt: this.tokenIssuedAt ? new Date(this.tokenIssuedAt * 1000).toISOString() : null
    };
  }
}