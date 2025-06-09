// Uproszczone typy które działają lepiej z TypeScript

import { BitrixSDK } from '../../../client/BitrixClient';
import { BitrixResponse, ListParams } from '../types';

export abstract class CRMEntityBase<T = any> {
  protected sdk: BitrixSDK;
  protected apiPrefix: string;

  constructor(sdk: BitrixSDK, apiPrefix: string) {
    this.sdk = sdk;
    this.apiPrefix = apiPrefix;
  }

  /**
   * Pobierz listę encji lub wszystkie encje jeśli id="all"
   */
  async list(params?: ListParams): Promise<BitrixResponse<T[]>>;
  async list(id: "all", params?: Omit<ListParams, 'start' | 'limit'>): Promise<T[]>;
  async list(
    paramsOrId?: ListParams | "all", 
    additionalParams?: Omit<ListParams, 'start' | 'limit'>
  ): Promise<BitrixResponse<T[]> | T[]> {
    if (paramsOrId === "all") {
      return this.getAllPages(additionalParams || {});
    }
    
    return this.sdk.apiCall(`${this.apiPrefix}.list`, paramsOrId || {});
  }

  /**
   * Pobierz encję po ID lub wszystkie encje jeśli id="all"
   */
  async get(id: number): Promise<BitrixResponse<T>>;
  async get(id: "all", params?: Omit<ListParams, 'start' | 'limit'>): Promise<T[]>;
  async get(
    id: number | "all", 
    params?: Omit<ListParams, 'start' | 'limit'>
  ): Promise<BitrixResponse<T> | T[]> {
    if (id === "all") {
      return this.getAllPages(params || {});
    }
    
    return this.sdk.apiCall(`${this.apiPrefix}.get`, { id });
  }

  /**
   * Dodaj nową encję
   */
  async add(fields: Partial<T>): Promise<BitrixResponse<{ id: number }>> {
    const response = await this.sdk.apiCall(`${this.apiPrefix}.add`, { fields });
    
    // Normalizacja odpowiedzi - jeśli API zwraca samo number, konwertujemy do { id: number }
    if (typeof response.result === 'number') {
      return {
        ...response,
        result: { id: response.result }
      };
    }
    
    return response;
  }

  /**
   * Zaktualizuj encję
   */
  async update(id: number, fields: Partial<T>): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall(`${this.apiPrefix}.update`, { id, fields });
  }

  /**
   * Usuń encję
   */
  async delete(id: number): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall(`${this.apiPrefix}.delete`, { id });
  }

  /**
   * Pobierz wszystkie strony wyników
   */
  protected async getAllPages(params: Omit<ListParams, 'start' | 'limit'> = {}): Promise<T[]> {
    const results: T[] = [];
    let start = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const response: BitrixResponse<T[]> = await this.sdk.apiCall(`${this.apiPrefix}.list`, {
        ...params,
        start,
        limit
      });

      if (response.result && response.result.length > 0) {
        results.push(...response.result);
        start += limit;
        
        hasMore = response.total ? (start < response.total) : (response.result.length === limit);
      } else {
        hasMore = false;
      }
    }

    return results;
  }

  /**
   * Pobierz pola encji
   */
  async fields(): Promise<BitrixResponse<Record<string, any>>> {
    return this.sdk.apiCall(`${this.apiPrefix}.fields`);
  }
}

// === BAZOWE INTERFEJSY ===

/**
 * Bazowy interfejs dla wszystkich encji CRM
 */
export interface CRMEntity {
  ID?: string;
  DATE_CREATE?: string;
  DATE_MODIFY?: string;
  CREATED_BY_ID?: string;
  MODIFY_BY_ID?: string;
  [key: string]: any;
}

/**
 * Typ dla parametrów tworzenia encji - wyklucza pola tylko do odczytu
 */
export type CreateEntityData<T extends CRMEntity> = Omit<T, 
  'ID' | 'DATE_CREATE' | 'DATE_MODIFY' | 'CREATED_BY_ID' | 'MODIFY_BY_ID'
>;

/**
 * Typ dla parametrów aktualizacji encji
 */
export type UpdateEntityData<T extends CRMEntity> = Partial<Omit<T, 
  'ID' | 'DATE_CREATE' | 'CREATED_BY_ID'
>>;

// === UPROSZCZONE TYPY FILTRÓW ===

/**
 * Podstawowe parametry filtrowania
 */
export interface FilterParams {
  [key: string]: any;
}

/**
 * Parametry list z uproszczonym filtrowaniem
 * Używaj string literals dla operatorów: ">=FIELD", "<FIELD", etc.
 */
export interface SimpleListParams extends Omit<ListParams, 'filter'> {
  filter?: FilterParams;
}

// === HELPER FUNCTIONS DLA FILTRÓW ===

/**
 * Helper functions do tworzenia filtrów z operatorami
 */
export const FilterOperators = {
  /**
   * Greater than or equal: >=FIELD
   */
  gte: (field: string, value: any) => ({ [`>=${field}`]: value }),
  
  /**
   * Greater than: >FIELD
   */
  gt: (field: string, value: any) => ({ [`>${field}`]: value }),
  
  /**
   * Less than or equal: <=FIELD
   */
  lte: (field: string, value: any) => ({ [`<=${field}`]: value }),
  
  /**
   * Less than: <FIELD
   */
  lt: (field: string, value: any) => ({ [`<${field}`]: value }),
  
  /**
   * IN operator: @FIELD
   */
  in: (field: string, values: any[]) => ({ [`@${field}`]: values }),
  
  /**
   * NOT IN operator: !@FIELD
   */
  notIn: (field: string, values: any[]) => ({ [`!@${field}`]: values }),
  
  /**
   * LIKE operator: %FIELD
   */
  like: (field: string, value: string) => ({ [`%${field}`]: value }),
  
  /**
   * LIKE with custom %: =%FIELD
   */
  likeCustom: (field: string, value: string) => ({ [`=%${field}`]: value }),
  
  /**
   * NOT EQUAL: !=FIELD
   */
  notEqual: (field: string, value: any) => ({ [`!=${field}`]: value }),
  
  /**
   * Combine multiple filter objects
   */
  combine: (...filters: FilterParams[]) => Object.assign({}, ...filters)
};

// === PRZYKŁADY UŻYCIA ===

/**
 * PRZYKŁADY UŻYCIA NOWYCH TYPÓW:
 */

/*
// 1. Proste filtrowanie
const simpleFilter = {
  STAGE_ID: "NEW",
  CURRENCY_ID: "USD"
};

// 2. Z operatorami - używając helper functions
const complexFilter = FilterOperators.combine(
  FilterOperators.gte("OPPORTUNITY", 5000),
  FilterOperators.lte("OPPORTUNITY", 50000),
  FilterOperators.in("ASSIGNED_BY_ID", [1, 2, 3]),
  FilterOperators.like("TITLE", "important"),
  { CURRENCY_ID: "USD" }
);

// 3. Bezpośrednio string literals (dla doświadczonych)
const directFilter = {
  ">=OPPORTUNITY": 5000,
  "<=OPPORTUNITY": 50000,
  "@ASSIGNED_BY_ID": [1, 2, 3],
  "%TITLE": "important",
  CURRENCY_ID: "USD"
};

// Wszystkie powyższe sposoby działają identycznie
const deals1 = await sdk.crm.deals.list({ filter: simpleFilter });
const deals2 = await sdk.crm.deals.list({ filter: complexFilter });
const deals3 = await sdk.crm.deals.list({ filter: directFilter });
*/
