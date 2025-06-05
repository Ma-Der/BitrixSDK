import { createServer } from 'http';
import { parse } from 'url';
import type { ExecException } from 'child_process';

export interface BitrixConfig {
  clientId: string;
  clientSecret: string;
  domain: string;
  auth?: {
    port?: number;
    timeout?: number;
    autoOpenBrowser?: boolean;
    redirectUri?: string; // Nowe pole dla custom redirect URI
  };
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
  domain: string;
  server_endpoint: string;
}

export class BitrixOAuth2 {
  private config: BitrixConfig;

  constructor(config: BitrixConfig) {
    this.config = {
      ...config,
      auth: {
        port: 3000,
        timeout: 300000, // 5 minut
        autoOpenBrowser: true,
        redirectUri: undefined, // Będzie ustawione automatycznie jeśli nie podane
        ...config.auth
      }
    };

    // Ustaw domyślne redirectUri jeśli nie podane
    if (!this.config.auth!.redirectUri) {
      this.config.auth!.redirectUri = `http://localhost:${this.config.auth!.port}/callback`;
    }
  }

  /**
   * Główna metoda autoryzacji - uruchamia lokalny serwer i otwiera przeglądarkę
   */
  async authorize(): Promise<TokenResponse> {
    return new Promise((resolve, reject) => {
      const port = this.config.auth!.port!;
      const timeout = this.config.auth!.timeout!;
      const redirectUri = `http://localhost:${port}/callback`;
      const authUrl = this.buildAuthUrl(redirectUri);

      let timeoutHandle: NodeJS.Timeout;

      // Lokalny serwer OAuth callback
      const server = createServer(async (req, res) => {
        const url = parse(req.url!, true);
        const { code, error } = url.query;

        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        // Obsłuż błędy autoryzacji
        if (error) {
          const errorMsg = `Authorization error: ${error}`;
          console.error(`❌ ${errorMsg}`);
          
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.buildErrorPage(error as string));
          
          server.close();
          reject(new Error(errorMsg));
          return;
        }

        if (!code) {
          const errorMsg = 'Authorization code not received';
          console.error(`❌ ${errorMsg}`);
          
          res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.buildErrorPage('Missing authorization code'));
          
          server.close();
          reject(new Error(errorMsg));
          return;
        }

        try {
          console.log('🔄 Exchanging authorization code for tokens...');
          const tokens = await this.exchangeCodeForToken(code as string, redirectUri);

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.buildSuccessPage());

          server.close();
          console.log('✅ Authorization successful!');
          resolve(tokens);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Token exchange failed';
          console.error(`❌ Token exchange failed: ${errorMsg}`);
          
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(this.buildErrorPage(errorMsg));
          
          server.close();
          reject(error);
        }
      });

      // Timeout handling
      timeoutHandle = setTimeout(() => {
        server.close();
        console.error(`❌ Authorization timeout after ${timeout / 1000} seconds`);
        console.error('💡 Make sure you complete the authorization in your browser');
        reject(new Error(`Authorization timeout after ${timeout}ms`));
      }, timeout);

      // Start server
      server.listen(port, () => {
        console.log(`🔐 Authorization server started on port ${port}`);
        console.log(`📋 Redirect URI: ${redirectUri}`);
        
        if (this.config.auth!.autoOpenBrowser) {
          console.log('🌐 Opening browser for authorization...');
          this.openBrowser(authUrl);
        } else {
          console.log('📋 Please open this URL in your browser:');
          console.log(`   ${authUrl}`);
        }
        
        console.log('⏳ Waiting for authorization callback...');
      });

      server.on('error', (error: any) => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }
        
        if (error.code === 'EADDRINUSE') {
          console.error(`❌ Port ${port} is already in use`);
          console.error(`💡 Try configuring a different port in auth.port or stop the service using port ${port}`);
          reject(new Error(`Port ${port} is already in use. Try a different port.`));
        } else if (error.code === 'EACCES') {
          console.error(`❌ Permission denied to bind to port ${port}`);
          console.error(`💡 Try using a port number above 1024 or run with elevated privileges`);
          reject(new Error(`Permission denied for port ${port}. Try a different port.`));
        } else {
          console.error(`❌ Server error: ${error.message}`);
          console.error(`💡 Check your network configuration and try again`);
          reject(new Error(`Server error: ${error.message}`));
        }
      });
    });
  }

  /**
   * Generuje URL autoryzacji (dla custom flow)
   */
  getAuthUrl(redirectUri?: string): string {
    const uri = redirectUri || this.config.auth!.redirectUri!;
    return this.buildAuthUrl(uri);
  }

  /**
   * Obsługa callback z aplikacji webowych (dla custom flow)
   */
  async handleCallback(code: string, redirectUri?: string): Promise<TokenResponse> {
    const uri = redirectUri || this.config.auth!.redirectUri!;
    return this.exchangeCodeForToken(code, uri);
  }

  /**
   * Wymiana authorization code na access token
   */
  private async exchangeCodeForToken(code: string, redirectUri: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: redirectUri,
      code: code,
    });

    const response = await fetch(`https://${this.config.domain}/oauth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Token exchange failed';
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error_description || errorJson.error || errorMessage;
      } catch {
        errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
      }
      
      throw new Error(errorMessage);
    }

    const tokens: TokenResponse = await response.json();
    
    // Validate token response
    if (!tokens.access_token || !tokens.expires_in) {
      throw new Error('Invalid token response from server');
    }
    
    return tokens;
  }

  /**
   * Odświeżenie access token
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: refreshToken,
    });

    const response = await fetch(`https://${this.config.domain}/oauth/token/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = 'Token refresh failed';
      
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error_description || errorJson.error || errorMessage;
        
        // Specific handling for expired refresh tokens
        if (errorJson.error === 'invalid_grant') {
          throw new Error('Refresh token expired or invalid. Re-authentication required.');
        }
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message.includes('Re-authentication required')) {
          throw parseError;
        }
        errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`;
      }
      
      throw new Error(errorMessage);
    }

    const tokens: TokenResponse = await response.json();
    
    if (!tokens.access_token || !tokens.expires_in) {
      throw new Error('Invalid refresh token response from server');
    }
    
    return tokens;
  }

  /**
   * Pobierz aktualną konfigurację
   */
  getConfig(): BitrixConfig {
    return { ...this.config };
  }

  private buildAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
    });

    return `https://${this.config.domain}/oauth/authorize/?${params.toString()}`;
  }

  private openBrowser(url: string): void {
    // Próbuj użyć pakietu 'open' (asynchronicznie)
    this.tryOpenWithPackage(url).catch((error: unknown) => {
      // Fallback do systemowych komend
      this.openBrowserFallback(url);
    });
  }

  private async tryOpenWithPackage(url: string): Promise<void> {
    try {
      // Dynamiczny import pakietu 'open'
      const { default: open } = await import('open');
      await open(url);
      console.log('✅ Browser opened successfully');
    } catch (error) {
      if (error instanceof Error && error.message.includes('Cannot resolve module')) {
        console.log('📦 Package "open" not found, using system fallback...');
      } else {
        console.error('❌ Browser opening failed:', error instanceof Error ? error.message : 'Unknown error');
      }
      throw error; // Re-throw to trigger fallback
    }
  }

  private openBrowserFallback(url: string): void {
    try {
      console.log('🔄 Trying system browser commands...');
      const { exec } = require('child_process');
      const start =
        process.platform === 'darwin' ? 'open' : 
        process.platform === 'win32' ? 'start' : 
        'xdg-open';

      exec(`${start} "${url}"`, (error: ExecException | null) => {
        if (error) {
          console.error('❌ Could not open browser automatically');
          console.error(`💡 Please manually open this URL: ${url}`);
          console.error(`   System error: ${error.message}`);
          console.error(`   Platform: ${process.platform}`);
          console.error(`   Command attempted: ${start} "${url}"`);
        } else {
          console.log('✅ Browser opened via system command');
        }
      });
    } catch (fallbackError: unknown) {
      console.error('❌ All browser opening methods failed');
      console.error(`💡 Manual action required: Open ${url} in your browser`);
      console.error(`   Please install 'open' package: npm install open`);
      if (fallbackError instanceof Error) {
        console.error(`   Fallback error: ${fallbackError.message}`);
      }
    }
  }

  private buildSuccessPage(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Successful</title>
        <meta charset="utf-8">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 10px;
            backdrop-filter: blur(10px);
          }
          h1 { 
            color: #4ade80; 
            margin-bottom: 20px;
            font-size: 2.5rem;
          }
          p {
            font-size: 1.2rem;
            margin: 10px 0;
          }
          .icon {
            font-size: 4rem;
            margin-bottom: 20px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">✅</div>
          <h1>Authorization Successful!</h1>
          <p>You have been successfully authenticated with Bitrix24.</p>
          <p><strong>You can close this window now.</strong></p>
        </div>
        <script>
          setTimeout(() => {
            try {
              window.close();
            } catch(e) {
              // Window closing might be blocked
            }
          }, 3000);
        </script>
      </body>
      </html>
    `;
  }

  private buildErrorPage(error: string): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Authorization Error</title>
        <meta charset="utf-8">
        <style>
          body { 
            font-family: Arial, sans-serif; 
            text-align: center; 
            padding: 50px;
            background: linear-gradient(135deg, #ff6b6b 0%, #ee5a52 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: rgba(255,255,255,0.1);
            padding: 40px;
            border-radius: 10px;
            backdrop-filter: blur(10px);
          }
          h1 { 
            color: #fef2f2; 
            margin-bottom: 20px;
            font-size: 2.5rem;
          }
          p {
            font-size: 1.2rem;
            margin: 10px 0;
          }
          .icon {
            font-size: 4rem;
            margin-bottom: 20px;
          }
          .error {
            background: rgba(0,0,0,0.2);
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
            font-family: monospace;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">❌</div>
          <h1>Authorization Error</h1>
          <div class="error">${error}</div>
          <p>Please try again or check your configuration.</p>
          <p><strong>You can close this window now.</strong></p>
        </div>
      </body>
      </html>
    `;
  }
}