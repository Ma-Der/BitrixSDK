import { BitrixSDK } from '../src/client/BitrixClient';
import * as dotenv from 'dotenv';

dotenv.config();

async function rateLimitingExample() {
  // Sprawdź zmienne środowiskowe
  if (!process.env.BITRIX_CLIENT_ID || !process.env.BITRIX_CLIENT_SECRET || !process.env.BITRIX_DOMAIN) {
    console.error('❌ Missing required environment variables:');
    console.error('   - BITRIX_CLIENT_ID');
    console.error('   - BITRIX_CLIENT_SECRET'); 
    console.error('   - BITRIX_DOMAIN');
    console.error('\n💡 Create .env file with these variables');
    process.exit(1);
  }

  // SDK z włączonym rate limiting
  const sdk = new BitrixSDK({
    clientId: process.env.BITRIX_CLIENT_ID,
    clientSecret: process.env.BITRIX_CLIENT_SECRET,
    domain: process.env.BITRIX_DOMAIN,
    auth: {
      port: 3000,
      timeout: 300000,
      autoOpenBrowser: true,
      redirectUri: 'http://localhost:3000/callback'
    }
  }, {
    autoAuth: true,
    rateLimiting: {
      enabled: true,
      enterprisePlan: false, // Ustaw true jeśli masz Enterprise plan
      config: {
        enableQueueing: true,
        maxQueueSize: 1000,
        enableRetry: true,
        maxRetries: 3,
        retryBackoffStrategy: 'exponential'
      }
    },
    events: {
      onAuthRequired: () => console.log('🔐 Authorization required'),
      onAuthSuccess: (tokens) => console.log('✅ Authorization successful!'),
      onTokenRefreshed: (tokens) => console.log('🔄 Token refreshed automatically'),
      onApiCallStart: (method) => console.log(`📡 API Call: ${method}`),
      onApiCallSuccess: (method, result) => {
        // Pokaż info o rate limiting z response
        if (result.time?.operating) {
          console.log(`⏱️  ${method} operating time: ${result.time.operating.toFixed(3)}s`);
        }
      },
      onApiCallError: (method, error) => console.error(`❌ API Error in ${method}:`, error.message)
    }
  });

  try {
    console.log('🚀 Starting Bitrix24 Rate Limiting Demo...\n');
    
    // Test 1: Sprawdź początkowy status
    console.log('📊 Initial status:');
    const initialStatus = sdk.getAuthStatus();
    console.log('Auth:', initialStatus.isAuthenticated);
    console.log('Rate limiting enabled:', initialStatus.rateLimiting.enabled);
    
    if (initialStatus.rateLimiting.enabled) {
      const rlStatus = sdk.getRateLimitStatus();
      console.log('Request counter:', rlStatus.requestCounter || 0);
      console.log('Queue length:', rlStatus.queueLength || 0);
      console.log('Config max req/sec:', rlStatus.config?.maxRequestsPerSecond || 'N/A');
    }

    // Test 2: Pojedyncze API calls
    console.log('\n👤 Testing single API calls...');
    const user = await sdk.getCurrentUser();
    console.log('✅ User:', user.result?.NAME, user.result?.LAST_NAME);
    
    const appInfo = await sdk.getAppInfo();
    console.log('✅ App license:', appInfo.result?.LICENSE);

    // Test 3: High priority call
    console.log('\n⚡ Testing high priority call...');
    const urgentUser = await sdk.apiCallHighPriority('user.current');
    console.log('✅ Urgent user call completed');

    // Test 4: Multiple calls (test rate limiting)
    console.log('\n🔄 Testing multiple rapid calls (rate limiting demo)...');
    
    const rapidCalls: Promise<any>[] = [];
    for (let i = 0; i < 10; i++) {
      rapidCalls.push(
        sdk.apiCallLowPriority('crm.contact.list', { start: i * 10, limit: 10 })
      );
    }

    console.log('📡 Making 10 rapid calls...');
    const startTime = Date.now();
    const rapidResults = await Promise.all(rapidCalls);
    const endTime = Date.now();
    
    console.log(`✅ Completed 10 calls in ${endTime - startTime}ms`);
    console.log(`📊 Total contacts from rapid calls: ${rapidResults.reduce((sum, r) => sum + (r.result?.length || 0), 0)}`);

    // Test 5: Batch operations
    console.log('\n📦 Testing batch operations...');
    
    const batchCalls = [
      { method: 'user.current' },
      { method: 'app.info' },
      { method: 'crm.contact.list', params: { limit: 5 } },
      { method: 'crm.company.list', params: { limit: 5 } },
      { method: 'crm.deal.list', params: { limit: 5 } }
    ];

    const batchResult = await sdk.batch(batchCalls);
    console.log('✅ Batch completed, results count:', Object.keys(batchResult.result).length);

    // Test 6: Large batch (chunking demo)
    console.log('\n📦 Testing large batch (chunking demo)...');
    
    const largeBatchCalls: Array<{ method: string; params?: Record<string, any> }> = [];
    for (let i = 0; i < 150; i++) { // Więcej niż 50 - zostanie podzielone na chunki
      largeBatchCalls.push({
        method: 'crm.contact.list',
        params: { start: i, limit: 1 }
      });
    }

    console.log(`📡 Making large batch with ${largeBatchCalls.length} calls...`);
    const largeBatchStart = Date.now();
    const largeBatchResult = await sdk.batch(largeBatchCalls, 50); // Medium priority
    const largeBatchEnd = Date.now();
    
    console.log(`✅ Large batch completed in ${largeBatchEnd - largeBatchStart}ms`);
    console.log(`📊 Processed ${Object.keys(largeBatchResult.result).length} batch commands`);

    // Test 7: Rate limiting status
    console.log('\n📊 Final rate limiting status:');
    const finalRlStatus = sdk.getRateLimitStatus();
    
    if (finalRlStatus.enabled) {
      console.log('Request counter:', finalRlStatus.requestCounter || 0);
      console.log('Is blocked:', finalRlStatus.isBlocked || false);
      console.log('Queue length:', finalRlStatus.queueLength || 0);
      console.log('Operating time used:', (finalRlStatus.operatingTimeUsed || 0).toFixed(2) + 's');
      console.log('Operating time limit:', (finalRlStatus.operatingTimeLimit || 480) + 's');
      
      if (finalRlStatus.blockedMethods && finalRlStatus.blockedMethods.length > 0) {
        console.log('Blocked methods:', finalRlStatus.blockedMethods);
      }
    }

    // Test 8: Enterprise plan demo (jeśli ustawione)
    if (process.env.BITRIX_ENTERPRISE_PLAN === 'true') {
      console.log('\n🏢 Testing Enterprise plan settings...');
      sdk.setEnterprisePlan();
      
      const enterpriseStatus = sdk.getRateLimitStatus();
      if (enterpriseStatus.config) {
        console.log('Enterprise config max req/sec:', enterpriseStatus.config.maxRequestsPerSecond);
        console.log('Enterprise config burst limit:', enterpriseStatus.config.burstLimit);
      }
    }

    // Test 9: Rate limiting reconfiguration
    console.log('\n⚙️  Testing rate limiting reconfiguration...');
    sdk.setRateLimiting(true, {
      maxRequestsPerSecond: 1, // Bardzo konserwatywne ustawienie
      enableRetry: false       // Wyłącz retry dla testu
    });

    try {
      const slowCall = await sdk.apiCall('user.current');
      console.log('✅ Slow rate limit call completed');
    } catch (error) {
      console.log('Expected rate limit behavior:', error instanceof Error ? error.message : error);
    }

    // Przywróć normalną konfigurację
    sdk.setRateLimiting(true, {
      maxRequestsPerSecond: 2,
      enableRetry: true
    });

    console.log('\n🎉 Rate limiting demo completed successfully!');
    console.log('💡 Rate limiting helps manage API usage efficiently and prevents errors');
    
  } catch (error) {
    console.error('\n❌ Error occurred:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('QUERY_LIMIT_EXCEEDED')) {
        console.error('💡 Rate limit exceeded - this is expected in heavy testing');
        console.error('   The rate limiter should handle retries automatically');
      } else if (error.message.includes('operating_reset_at')) {
        console.error('💡 Resource consumption limit exceeded');
        console.error('   Some methods may be temporarily blocked');
      } else {
        console.error('💡 Technical details:', error.message);
      }
    }
    
    // Pokazuj status rate limitera nawet przy błędzie
    const errorStatus = sdk.getRateLimitStatus();
    if (errorStatus.enabled) {
      console.log('\n📊 Rate limiter status at error:');
      console.log('Request counter:', errorStatus.requestCounter || 0);
      console.log('Is blocked:', errorStatus.isBlocked || false);
      console.log('Queue length:', errorStatus.queueLength || 0);
      console.log('Blocked methods:', errorStatus.blockedMethods || []);
    }
    
    process.exit(1);
  }
}

// Cleanup przy zamykaniu
process.on('SIGINT', () => {
  console.log('\n👋 Cleaning up and closing application...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Application terminated...');
  process.exit(0);
});

// Uruchom przykład
if (require.main === module) {
  rateLimitingExample().catch((error) => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { rateLimitingExample };