import express, { Request, Response } from 'express';
import { BitrixSDK, TokenResponse } from '../src/client/BitrixClient';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Proste in-memory storage (tylko do testów! W produkcji użyj bazy danych)
const tokenStorage = new Map<string, TokenResponse>();

// Globalne SDK dla web callback flow
const sdk = new BitrixSDK({
  clientId: process.env.BITRIX_CLIENT_ID!,
  clientSecret: process.env.BITRIX_CLIENT_SECRET!,
  domain: process.env.BITRIX_DOMAIN!
}, {
  autoAuth: false, // W web nie robimy auto-auth
  events: {
    onAuthSuccess: (tokens) => console.log('✅ User authorized successfully'),
    onTokenRefreshed: (tokens) => console.log('🔄 Token refreshed for user'),
    onApiCallError: (method, error) => console.error(`❌ API Error in ${method}:`, error.message)
  }
});

// === Web Routes ===

/**
 * Rozpocznij autoryzację - przekieruj do Bitrix24
 */
app.get('/auth', (req: Request, res: Response) => {
  try {
    // Custom redirectUri dla web aplikacji
    const redirectUri = `${req.protocol}://${req.get('host')}/api/bitrix/oauth/auth`;
    const authUrl = sdk.getAuthUrl(redirectUri);
    
    console.log('🔗 Redirecting to authorization URL:', authUrl);
    res.redirect(authUrl);
  } catch (error) {
    console.error('❌ Auth redirect error:', error);
    res.status(500).json({ error: 'Failed to generate auth URL' });
  }
});

/**
 * OAuth callback handler
 */
app.get('/auth/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, error } = req.query as { code?: string; error?: string };
    
    if (error) {
      console.error('❌ Authorization error:', error);
      res.status(400).send(`
        <h1>❌ Authorization Error</h1>
        <p>Error: ${error}</p>
        <a href="/auth">Try Again</a>
      `);
      return;
    }
    
    if (!code) {
      console.error('❌ No authorization code received');
      res.status(400).send(`
        <h1>❌ Missing Authorization Code</h1>
        <p>No authorization code was provided by Bitrix24</p>
        <a href="/auth">Try Again</a>
      `);
      return;
    }
    
    // Handle callback with custom redirectUri
    const redirectUri = `${req.protocol}://${req.get('host')}/auth/callback`;
    const tokens = await sdk.handleCallback(code, redirectUri);
    
    // Zapisz tokeny (w prawdziwej aplikacji użyj sesji/bazy danych)
    const userId = `user_${Date.now()}`; // Proste ID do testów
    tokenStorage.set(userId, tokens);
    
    console.log(`✅ User ${userId} authorized successfully`);
    
    // Sukces page z user ID do dalszego użycia
    res.send(`
      <h1>✅ Authorization Successful!</h1>
      <p>You have been successfully authenticated with Bitrix24.</p>
      <p><strong>Your User ID:</strong> <code>${userId}</code></p>
      <p>Use this ID in the <code>X-User-ID</code> header for API requests.</p>
      <hr>
      <h3>Quick Tests:</h3>
      <ul>
        <li><a href="/api/user?userId=${userId}">Get Current User</a></li>
        <li><a href="/api/contacts?userId=${userId}">Get CRM Contacts</a></li>
        <li><a href="/api/status?userId=${userId}">Check Status</a></li>
      </ul>
      <p><a href="/api/logout?userId=${userId}">Logout</a></p>
    `);
  } catch (error) {
    console.error('❌ Callback processing error:', error);
    res.status(500).send(`
      <h1>❌ Authorization Failed</h1>
      <p>Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      <a href="/auth">Try Again</a>
    `);
  }
});

// === Middleware ===

/**
 * Middleware do sprawdzania autoryzacji
 */
function requireAuth(req: Request, res: Response, next: express.NextFunction): void {
  const userId = req.headers['x-user-id'] as string || req.query.userId as string;
  
  if (!userId) {
    res.status(401).json({ 
      error: 'Missing user ID. Provide X-User-ID header or userId query param.',
      authUrl: '/auth'
    });
    return;
  }
  
  if (!tokenStorage.has(userId)) {
    res.status(401).json({ 
      error: 'User not authorized or session expired.',
      authUrl: '/auth'
    });
    return;
  }
  
  // Dodaj dane do request
  (req as any).tokens = tokenStorage.get(userId);
  (req as any).userId = userId;
  next();
}

/**
 * Stwórz SDK z tokenami użytkownika
 */
function createUserSDK(tokens: TokenResponse): BitrixSDK {
  return new BitrixSDK({
    clientId: process.env.BITRIX_CLIENT_ID!,
    clientSecret: process.env.BITRIX_CLIENT_SECRET!,
    domain: process.env.BITRIX_DOMAIN!
  }, { 
    tokens,
    autoAuth: false // W web nie robimy auto-auth
  });
}

// === API Routes ===

/**
 * Pobierz aktualnego użytkownika
 */
app.get('/api/user', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = (req as any).tokens as TokenResponse;
    const userSdk = createUserSDK(tokens);
    
    const user = await userSdk.getCurrentUser();
    res.json({
      success: true,
      data: user.result,
      meta: {
        userId: (req as any).userId,
        method: 'user.current'
      }
    });
  } catch (error) {
    console.error('❌ User API error:', error);
    res.status(500).json({ 
      error: 'Failed to get user info',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Pobierz kontakty CRM
 */
app.get('/api/contacts', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = (req as any).tokens as TokenResponse;
    const userSdk = createUserSDK(tokens);
    
    const limit = parseInt(req.query.limit as string) || 10;
    const start = parseInt(req.query.start as string) || 0;
    
    const contacts = await userSdk.getCrmContacts({ start, limit });
    
    res.json({
      success: true,
      data: contacts.result,
      meta: {
        total: contacts.total,
        start,
        limit,
        userId: (req as any).userId,
        method: 'crm.contact.list'
      }
    });
  } catch (error) {
    console.error('❌ Contacts API error:', error);
    res.status(500).json({ 
      error: 'Failed to get contacts',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Pobierz firmy CRM
 */
app.get('/api/companies', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = (req as any).tokens as TokenResponse;
    const userSdk = createUserSDK(tokens);
    
    const limit = parseInt(req.query.limit as string) || 10;
    const start = parseInt(req.query.start as string) || 0;
    
    const companies = await userSdk.getCrmCompanies({ start, limit });
    
    res.json({
      success: true,
      data: companies.result,
      meta: {
        total: companies.total,
        start,
        limit,
        userId: (req as any).userId,
        method: 'crm.company.list'
      }
    });
  } catch (error) {
    console.error('❌ Companies API error:', error);
    res.status(500).json({ 
      error: 'Failed to get companies',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Batch request example
 */
app.post('/api/batch', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const tokens = (req as any).tokens as TokenResponse;
    const userSdk = createUserSDK(tokens);
    
    const { calls } = req.body as { calls: Array<{ method: string; params?: any }> };
    
    if (!calls || !Array.isArray(calls)) {
      res.status(400).json({ error: 'Invalid batch request. Provide calls array.' });
      return;
    }
    
    const result = await userSdk.batch(calls);
    
    res.json({
      success: true,
      data: result.result,
      meta: {
        batchSize: calls.length,
        userId: (req as any).userId,
        method: 'batch'
      }
    });
  } catch (error) {
    console.error('❌ Batch API error:', error);
    res.status(500).json({ 
      error: 'Batch request failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Status endpoint
 */
app.get('/api/status', requireAuth, (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const tokens = (req as any).tokens as TokenResponse;
  
  const userSdk = createUserSDK(tokens);
  const status = userSdk.getAuthStatus();
  
  res.json({
    success: true,
    data: {
      userId,
      ...status,
      tokenExpirationTime: status.tokenExpirationTime?.toISOString()
    }
  });
});

/**
 * Logout endpoint
 */
app.get('/api/logout', (req: Request, res: Response) => {
  const userId = req.headers['x-user-id'] as string || req.query.userId as string;
  
  if (userId && tokenStorage.has(userId)) {
    tokenStorage.delete(userId);
    console.log(`👋 User ${userId} logged out`);
  }
  
  res.send(`
    <h1>👋 Logged Out</h1>
    <p>You have been successfully logged out.</p>
    <p><a href="/auth">Login Again</a></p>
  `);
});

// === Info Routes ===

/**
 * Main page with instructions
 */
app.get('/', (req: Request, res: Response) => {
  res.send(`
    <h1>🚀 Bitrix24 SDK Web Example</h1>
    <p>This is a demo web application showing how to use the Bitrix24 SDK in web applications.</p>
    
    <h2>🔐 Getting Started</h2>
    <ol>
      <li><a href="/auth">Start Authorization</a> - Begin OAuth flow</li>
      <li>Complete authorization in Bitrix24</li>
      <li>Use the returned User ID for API calls</li>
    </ol>
    
    <h2>📚 API Endpoints</h2>
    <ul>
      <li><code>GET /api/user</code> - Get current user info</li>
      <li><code>GET /api/contacts</code> - Get CRM contacts</li>
      <li><code>GET /api/companies</code> - Get CRM companies</li>
      <li><code>POST /api/batch</code> - Batch API requests</li>
      <li><code>GET /api/status</code> - Check auth status</li>
      <li><code>GET /api/logout</code> - Logout user</li>
    </ul>
    
    <h2>🛠 Usage</h2>
    <p>All API endpoints require <code>X-User-ID</code> header or <code>userId</code> query parameter.</p>
    
    <h2>💡 Environment Variables Required</h2>
    <ul>
      <li><code>BITRIX_CLIENT_ID</code></li>
      <li><code>BITRIX_CLIENT_SECRET</code></li>
      <li><code>BITRIX_DOMAIN</code></li>
    </ul>
    
    <hr>
    <p><small>Active sessions: ${tokenStorage.size}</small></p>
  `);
});

/**
 * Health check
 */
app.get('/health', (req: Request, res: Response) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    activeSessions: tokenStorage.size
  });
});

// Error handling
app.use((error: Error, req: Request, res: Response, next: express.NextFunction) => {
  console.error('❌ Express error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: error.message 
  });
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🌐 Bitrix24 SDK Web Example running on port ${PORT}`);
  console.log(`📋 Open http://localhost:${PORT} to get started`);
  console.log(`🔗 Auth URL: http://localhost:${PORT}/auth`);
  
  if (!process.env.BITRIX_CLIENT_ID || !process.env.BITRIX_CLIENT_SECRET || !process.env.BITRIX_DOMAIN) {
    console.warn('⚠️  Missing environment variables! Check your .env file.');
  }
});

export { app };