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
    return this.sdk.apiCall(`${this.apiPrefix}.add`, { fields });
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
    const limit = 50; // Standardowy limit Bitrix
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
        
        // Sprawdź czy są jeszcze wyniki do pobrania
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