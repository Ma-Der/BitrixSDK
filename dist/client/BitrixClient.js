import { BitrixOAuth2 } from "../auth/oauth2";
import { TokenManager } from "../auth/token-manager";
export class BitrixSDK {
    constructor(config, tokens) {
        this.oauth = new BitrixOAuth2(config);
        this.tokenManager = new TokenManager(this.oauth, tokens);
        this.baseUrl = `https://${config.domain}/rest`;
    }
    /**
     * Autoryzacja desktop (CLI)
     */
    async authorize() {
        const tokens = await this.oauth.authorizeDesktop();
        this.tokenManager.setTokens(tokens);
        return tokens;
    }
    /**
     * Autoryzacja web - zwraca URL
     */
    getAuthUrl(state) {
        return this.oauth.getAuthorizationUrl(state);
    }
    /**
     * Obsługa callback z web aplikacji
     */
    async handleCallback(code, state) {
        const tokens = await this.oauth.handleWebCallback(code, state);
        this.tokenManager.setTokens(tokens);
        return tokens;
    }
    /**
     * Wykonaj zapytanie do API
     */
    async apiCall(method, params = {}) {
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
        if (!response.ok) {
            throw new Error(`API call failed: ${response.statusText}`);
        }
        return await response.json();
    }
    /**
     * Pobierz aktualnie zalogowanego użytkownika
     */
    async getCurrentUser() {
        return this.apiCall('user.current');
    }
    /**
     * Pobierz listę kontaktów CRM
     */
    async getCrmContacts(params = {}) {
        return this.apiCall('crm.contact.list', params);
    }
}
