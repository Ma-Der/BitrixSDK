export class TokenManager {
    constructor(oauth, tokens) {
        this.tokens = null;
        this.oauth = oauth;
        this.tokens = tokens || null;
    }
    async getValidToken() {
        if (!this.tokens) {
            throw new Error('No tokens available. Please authorize first.');
        }
        // Sprawdź czy token jest ważny (z marginesem 5 minut)
        const expiresAt = Date.now() + (this.tokens.expires_in * 1000);
        const isExpiringSoon = expiresAt - Date.now() < 5 * 60 * 1000;
        if (isExpiringSoon && this.tokens.refresh_token) {
            console.log('Token expiring soon, refreshing...');
            this.tokens = await this.oauth.refreshToken(this.tokens.refresh_token);
        }
        return this.tokens.access_token;
    }
    setTokens(tokens) {
        this.tokens = tokens;
    }
    getTokens() {
        return this.tokens;
    }
    clearTokens() {
        this.tokens = null;
    }
}
