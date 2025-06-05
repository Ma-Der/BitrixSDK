export interface BitrixConfig {
    clientId: string;
    clientSecret: string;
    redirectUri?: string;
    domain: string;
}
export interface TokenResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
    domain: string;
    server_endpoint: string;
}
export declare class BitrixOAuth2 {
    private config;
    private callbackPort;
    constructor(config: BitrixConfig);
    /**
     * Generuje URL autoryzacji
     */
    getAuthorizationUrl(state?: string): string;
    /**
     * Autoryzacja dla aplikacji CLI/Desktop
     * Otwiera przeglądarkę i czeka na callback
     */
    authorizeDesktop(): Promise<TokenResponse>;
    /**
     * Wymiana authorization code na access token
     */
    exchangeCodeForToken(code: string): Promise<TokenResponse>;
    /**
     * Odświeżenie access token
     */
    refreshToken(refreshToken: string): Promise<TokenResponse>;
    /**
     * Callback handler dla aplikacji webowych
     */
    handleWebCallback(code: string, state: string): Promise<TokenResponse>;
    private generateState;
    private openBrowser;
}
//# sourceMappingURL=oauth2.d.ts.map