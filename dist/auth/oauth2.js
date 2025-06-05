import { createServer } from 'http';
import { parse } from 'url';
import { exec } from 'child_process';
import crypto from 'crypto';
export class BitrixOAuth2 {
    constructor(config) {
        this.callbackPort = 3000;
        this.config = {
            ...config,
            redirectUri: config.redirectUri || `http://localhost:${this.callbackPort}/callback`
        };
    }
    /**
     * Generuje URL autoryzacji
     */
    getAuthorizationUrl(state) {
        const params = new URLSearchParams({
            response_type: 'code',
            client_id: this.config.clientId,
            redirect_uri: this.config.redirectUri,
            scope: 'crm,task,user,im,log',
            state: state || this.generateState()
        });
        return `https://${this.config.domain}/oauth/authorize/?${params.toString()}`;
    }
    /**
     * Autoryzacja dla aplikacji CLI/Desktop
     * Otwiera przeglądarkę i czeka na callback
     */
    async authorizeDesktop() {
        return new Promise((resolve, reject) => {
            const state = this.generateState();
            const authUrl = this.getAuthorizationUrl(state);
            // Uruchom lokalny serwer na callback
            const server = createServer(async (req, res) => {
                const url = parse(req.url, true);
                if (url.pathname === '/callback') {
                    const { code, state: returnedState, error } = url.query;
                    // Obsłuż błędy
                    if (error) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end(`<h1>Authorization Error</h1><p>${error}</p>`);
                        server.close();
                        reject(new Error(`Authorization error: ${error}`));
                        return;
                    }
                    // Sprawdź state (CSRF protection)
                    if (returnedState !== state) {
                        res.writeHead(400, { 'Content-Type': 'text/html' });
                        res.end('<h1>Invalid State</h1><p>CSRF protection failed</p>');
                        server.close();
                        reject(new Error('Invalid state parameter'));
                        return;
                    }
                    try {
                        // Wymień code na token
                        const tokens = await this.exchangeCodeForToken(code);
                        res.writeHead(200, { 'Content-Type': 'text/html' });
                        res.end(`
              <h1>Authorization Successful!</h1>
              <p>You can close this window now.</p>
              <script>window.close();</script>
            `);
                        server.close();
                        resolve(tokens);
                    }
                    catch (error) {
                        res.writeHead(500, { 'Content-Type': 'text/html' });
                        res.end(`<h1>Token Exchange Failed</h1><p>${error}</p>`);
                        server.close();
                        reject(error);
                    }
                }
            });
            server.listen(this.callbackPort, () => {
                console.log(`Authorization server started on port ${this.callbackPort}`);
                console.log('Opening browser...');
                // Otwórz przeglądarkę
                this.openBrowser(authUrl);
            });
            server.on('error', (error) => {
                reject(new Error(`Server error: ${error.message}`));
            });
        });
    }
    /**
     * Wymiana authorization code na access token
     */
    async exchangeCodeForToken(code) {
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            redirect_uri: this.config.redirectUri,
            code: code
        });
        const response = await fetch(`https://${this.config.domain}/oauth/token/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString()
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token exchange failed: ${error}`);
        }
        const tokens = await response.json();
        return tokens;
    }
    /**
     * Odświeżenie access token
     */
    async refreshToken(refreshToken) {
        const params = new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            refresh_token: refreshToken
        });
        const response = await fetch(`https://${this.config.domain}/oauth/token/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString()
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Token refresh failed: ${error}`);
        }
        return await response.json();
    }
    /**
     * Callback handler dla aplikacji webowych
     */
    async handleWebCallback(code, state) {
        return this.exchangeCodeForToken(code);
    }
    generateState() {
        return crypto.randomBytes(16).toString('hex');
    }
    openBrowser(url) {
        const start = process.platform === 'darwin' ? 'open' :
            process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${start} "${url}"`);
    }
}
