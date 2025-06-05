import { BitrixConfig, TokenResponse } from "../auth/oauth2";
export declare class BitrixSDK {
    private oauth;
    private tokenManager;
    private baseUrl;
    constructor(config: BitrixConfig, tokens?: TokenResponse);
    /**
     * Autoryzacja desktop (CLI)
     */
    authorize(): Promise<TokenResponse>;
    /**
     * Autoryzacja web - zwraca URL
     */
    getAuthUrl(state?: string): string;
    /**
     * Obsługa callback z web aplikacji
     */
    handleCallback(code: string, state: string): Promise<TokenResponse>;
    /**
     * Wykonaj zapytanie do API
     */
    apiCall(method: string, params?: Record<string, any>): Promise<any>;
    /**
     * Pobierz aktualnie zalogowanego użytkownika
     */
    getCurrentUser(): Promise<any>;
    /**
     * Pobierz listę kontaktów CRM
     */
    getCrmContacts(params?: Record<string, any>): Promise<any>;
}
export { BitrixConfig, TokenResponse };
//# sourceMappingURL=BitrixClient.d.ts.map