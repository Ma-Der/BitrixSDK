export interface RateLimitConfig {
    // Request intensity limits (based on tariff plan)
    maxRequestsPerSecond: number;  // Y value - counter decrease rate
    burstLimit: number;            // X value - limit before blocking
    
    // Resource consumption limits
    maxOperatingTimePerWindow: number;  // 480 seconds default
    operatingTimeWindow: number;        // 10 minutes (600 seconds) default
    
    // Retry configuration
    enableRetry: boolean;
    maxRetries: number;
    retryBackoffStrategy: 'linear' | 'exponential';
    retryBaseDelay: number;  // milliseconds
    
    // Queue configuration
    enableQueueing: boolean;
    maxQueueSize: number;
    queueTimeout: number;  // milliseconds
  }
  
  export interface RateLimitState {
    requestCounter: number;
    lastRequestTime: number;
    operatingTimeUsed: number;
    operatingTimeWindow: number;
    operatingResetAt: number | null;
    blockedMethods: Set<string>;
    isBlocked: boolean;
  }
  
  export interface QueuedRequest {
    id: string;
    method: string;
    params: any;
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    priority: number;
    timestamp: number;
    retryCount: number;
  }
  
  export class BitrixRateLimiter {
    private config: RateLimitConfig;
    private state: RateLimitState;
    private requestQueue: QueuedRequest[] = [];
    private processingQueue = false;
    private counterDecreaseInterval: NodeJS.Timeout | null = null;
    
    constructor(config: Partial<RateLimitConfig> = {}) {
      // Default configuration based on Bitrix24 documentation
      this.config = {
        maxRequestsPerSecond: 2,      // Default for non-Enterprise
        burstLimit: 50,               // Default for non-Enterprise  
        maxOperatingTimePerWindow: 480, // 480 seconds per 10 minutes
        operatingTimeWindow: 600,     // 10 minutes in seconds
        enableRetry: true,
        maxRetries: 3,
        retryBackoffStrategy: 'exponential',
        retryBaseDelay: 1000,        // 1 second
        enableQueueing: true,
        maxQueueSize: 1000,
        queueTimeout: 300000,        // 5 minutes
        ...config
      };
  
      this.state = {
        requestCounter: 0,
        lastRequestTime: Date.now(),
        operatingTimeUsed: 0,
        operatingTimeWindow: Date.now(),
        operatingResetAt: null,
        blockedMethods: new Set(),
        isBlocked: false
      };
  
      this.startCounterDecrease();
    }
  
    /**
     * Ustaw konfigurację dla Enterprise plan
     */
    setEnterprisePlan(): void {
      this.config.maxRequestsPerSecond = 5;
      this.config.burstLimit = 250;
      console.log('📈 Rate limiter configured for Enterprise plan (5 req/sec, burst: 250)');
    }
  
    /**
     * Ustaw konfigurację dla standardowych planów
     */
    setStandardPlan(): void {
      this.config.maxRequestsPerSecond = 2;
      this.config.burstLimit = 50;
      console.log('📊 Rate limiter configured for Standard plan (2 req/sec, burst: 50)');
    }
  
    /**
     * Sprawdź czy można wykonać request
     */
    canMakeRequest(method: string): boolean {
      // Sprawdź czy metoda jest zablokowana
      if (this.state.blockedMethods.has(method)) {
        const now = Date.now() / 1000;
        if (this.state.operatingResetAt && now < this.state.operatingResetAt) {
          return false;
        } else {
          // Reset blokady po czasie
          this.state.blockedMethods.delete(method);
          this.state.operatingResetAt = null;
        }
      }
  
      // Sprawdź czy counter nie przekroczył limitu
      if (this.state.requestCounter >= this.config.burstLimit) {
        this.state.isBlocked = true;
        return false;
      }
  
      this.state.isBlocked = false;
      return true;
    }
  
    /**
     * Wykonaj request z rate limiting
     */
    async executeRequest<T>(
      method: string, 
      requestFn: () => Promise<T>,
      priority: number = 0
    ): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const queuedRequest: QueuedRequest = {
          id: this.generateRequestId(),
          method,
          params: requestFn,
          resolve,
          reject,
          priority,
          timestamp: Date.now(),
          retryCount: 0
        };
  
        if (this.config.enableQueueing) {
          this.addToQueue(queuedRequest);
          this.processQueue();
        } else {
          this.executeQueuedRequest(queuedRequest);
        }
      });
    }
  
    /**
     * Dodaj request do kolejki z priorytetem
     */
    private addToQueue(request: QueuedRequest): void {
      if (this.requestQueue.length >= this.config.maxQueueSize) {
        request.reject(new Error('Rate limiter queue is full. Try again later.'));
        return;
      }
  
      // Dodaj do kolejki i posortuj według priorytetu
      this.requestQueue.push(request);
      this.requestQueue.sort((a, b) => b.priority - a.priority || a.timestamp - b.timestamp);
  
      // Sprawdź timeout dla starych requestów
      this.cleanupExpiredRequests();
    }
  
    /**
     * Przetwarzaj kolejkę requestów
     */
    private async processQueue(): Promise<void> {
      if (this.processingQueue || this.requestQueue.length === 0) {
        return;
      }
  
      this.processingQueue = true;
  
      while (this.requestQueue.length > 0) {
        const request = this.requestQueue[0];
  
        // Sprawdź czy request nie wygasł
        if (Date.now() - request.timestamp > this.config.queueTimeout) {
          this.requestQueue.shift();
          request.reject(new Error('Request timeout in queue'));
          continue;
        }
  
        // Sprawdź czy można wykonać request
        if (!this.canMakeRequest(request.method)) {
          // Czekaj na możliwość wykonania
          await this.waitForAvailability(request.method);
          continue;
        }
  
        // Usuń z kolejki i wykonaj
        this.requestQueue.shift();
        await this.executeQueuedRequest(request);
      }
  
      this.processingQueue = false;
    }
  
    /**
     * Wykonaj pojedynczy request
     */
    private async executeQueuedRequest(request: QueuedRequest): Promise<void> {
      try {
        // Zwiększ counter
        this.incrementCounter();
  
        // Wykonaj request
        const result = await (request.params as () => Promise<any>)();
  
        // Przetwórz response time info
        this.processResponseTimeInfo(request.method, result);
  
        request.resolve(result);
      } catch (error) {
        await this.handleRequestError(request, error as Error);
      }
    }
  
    /**
     * Obsłuż błąd requestu z retry logic
     */
    private async handleRequestError(request: QueuedRequest, error: Error): Promise<void> {
      // Sprawdź czy to błąd rate limiting
      if (error.message.includes('QUERY_LIMIT_EXCEEDED') || error.message.includes('503')) {
        console.warn(`⚠️  Rate limit exceeded for ${request.method}`);
        this.state.isBlocked = true;
  
        if (this.config.enableRetry && request.retryCount < this.config.maxRetries) {
          const delay = this.calculateRetryDelay(request.retryCount);
          console.log(`🔄 Retrying ${request.method} in ${delay}ms (attempt ${request.retryCount + 1}/${this.config.maxRetries})`);
          
          setTimeout(() => {
            request.retryCount++;
            this.addToQueue(request);
            this.processQueue();
          }, delay);
          return;
        }
      }
  
      // Sprawdź czy to błąd resource consumption
      if (error.message.includes('operating_reset_at')) {
        this.handleResourceLimitExceeded(request.method, error);
      }
  
      request.reject(error);
    }
  
    /**
     * Przetwórz informacje o czasie wykonania z response
     */
    private processResponseTimeInfo(method: string, result: any): void {
      if (result?.time?.operating) {
        const operatingTime = result.time.operating;
        const now = Date.now() / 1000;
  
        // Reset okna czasowego jeśli minęło 10 minut
        if (now - this.state.operatingTimeWindow > this.config.operatingTimeWindow) {
          this.state.operatingTimeUsed = 0;
          this.state.operatingTimeWindow = now;
        }
  
        // Dodaj czas wykonania
        this.state.operatingTimeUsed += operatingTime;
  
        // Sprawdź czy zbliżamy się do limitu
        if (this.state.operatingTimeUsed > this.config.maxOperatingTimePerWindow * 0.8) {
          console.warn(`⚠️  Operating time usage: ${this.state.operatingTimeUsed.toFixed(2)}s / ${this.config.maxOperatingTimePerWindow}s`);
        }
  
        // Sprawdź operating_reset_at
        if (result.time.operating_reset_at) {
          this.state.operatingResetAt = result.time.operating_reset_at;
        }
      }
    }
  
    /**
     * Obsłuż przekroczenie limitu resource consumption
     */
    private handleResourceLimitExceeded(method: string, error: Error): void {
      console.error(`❌ Resource limit exceeded for method: ${method}`);
      this.state.blockedMethods.add(method);
      
      // Wyciągnij operating_reset_at z błędu jeśli dostępne
      const resetMatch = error.message.match(/operating_reset_at['":\s]*(\d+)/);
      if (resetMatch) {
        this.state.operatingResetAt = parseInt(resetMatch[1]);
        const resetTime = new Date(this.state.operatingResetAt * 1000);
        console.log(`🔒 Method ${method} blocked until: ${resetTime.toLocaleString()}`);
      }
    }
  
    /**
     * Czekaj na dostępność requestu
     */
    private async waitForAvailability(method: string): Promise<void> {
      const baseDelay = Math.ceil(1000 / this.config.maxRequestsPerSecond);
      
      if (this.state.blockedMethods.has(method) && this.state.operatingResetAt) {
        const now = Date.now() / 1000;
        const waitTime = Math.max(0, (this.state.operatingResetAt - now) * 1000);
        if (waitTime > 0) {
          console.log(`⏳ Waiting ${Math.ceil(waitTime / 1000)}s for method ${method} to become available`);
          await this.sleep(waitTime);
          return;
        }
      }
  
      if (this.state.isBlocked) {
        console.log(`⏳ Waiting ${baseDelay}ms due to rate limiting`);
        await this.sleep(baseDelay);
      }
    }
  
    /**
     * Zwiększ counter requestów
     */
    private incrementCounter(): void {
      this.state.requestCounter++;
      this.state.lastRequestTime = Date.now();
    }
  
    /**
     * Zmniejszaj counter co sekundę
     */
    private startCounterDecrease(): void {
      this.counterDecreaseInterval = setInterval(() => {
        if (this.state.requestCounter > 0) {
          this.state.requestCounter = Math.max(0, this.state.requestCounter - this.config.maxRequestsPerSecond);
        }
        
        if (this.state.requestCounter === 0) {
          this.state.isBlocked = false;
        }
      }, 1000);
    }
  
    /**
     * Oblicz delay dla retry
     */
    private calculateRetryDelay(retryCount: number): number {
      if (this.config.retryBackoffStrategy === 'exponential') {
        return this.config.retryBaseDelay * Math.pow(2, retryCount);
      } else {
        return this.config.retryBaseDelay * (retryCount + 1);
      }
    }
  
    /**
     * Wyczyść wygasłe requesty z kolejki
     */
    private cleanupExpiredRequests(): void {
      const now = Date.now();
      const expiredRequests = this.requestQueue.filter(req => 
        now - req.timestamp > this.config.queueTimeout
      );
  
      expiredRequests.forEach(req => {
        req.reject(new Error('Request expired in queue'));
      });
  
      this.requestQueue = this.requestQueue.filter(req => 
        now - req.timestamp <= this.config.queueTimeout
      );
    }
  
    /**
     * Generuj unikalny ID dla requestu
     */
    private generateRequestId(): string {
      return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
  
    /**
     * Sleep utility
     */
    private sleep(ms: number): Promise<void> {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
  
    /**
     * Pobierz status rate limitera
     */
    getStatus(): {
      requestCounter: number;
      isBlocked: boolean;
      queueLength: number;
      operatingTimeUsed: number;
      operatingTimeLimit: number;
      blockedMethods: string[];
      config: RateLimitConfig;
    } {
      return {
        requestCounter: this.state.requestCounter,
        isBlocked: this.state.isBlocked,
        queueLength: this.requestQueue.length,
        operatingTimeUsed: this.state.operatingTimeUsed,
        operatingTimeLimit: this.config.maxOperatingTimePerWindow,
        blockedMethods: Array.from(this.state.blockedMethods),
        config: this.config
      };
    }
  
    /**
     * Wyczyść rate limiter
     */
    destroy(): void {
      if (this.counterDecreaseInterval) {
        clearInterval(this.counterDecreaseInterval);
      }
      
      // Reject wszystkie pending requesty
      this.requestQueue.forEach(req => {
        req.reject(new Error('Rate limiter destroyed'));
      });
      this.requestQueue = [];
    }
  }