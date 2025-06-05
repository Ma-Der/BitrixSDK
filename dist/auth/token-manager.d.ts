import { BitrixOAuth2, TokenResponse } from "./oauth2";
export declare class TokenManager {
    private tokens;
    private oauth;
    constructor(oauth: BitrixOAuth2, tokens?: TokenResponse);
    getValidToken(): Promise<string>;
    setTokens(tokens: TokenResponse): void;
    getTokens(): TokenResponse | null;
    clearTokens(): void;
}
//# sourceMappingURL=token-manager.d.ts.map