import { CRMEntityBase } from '../base/CRMEntityBase';
import { BitrixSDK } from '../../../client/BitrixClient';
import { BitrixResponse } from '../types';
import { 
  Deal, 
  CreateDealData, 
  UpdateDealData, 
  DealListParams,
  ProductRow,
  CreateProductRowData,
  DealContact,
  RecurringDealSettings,
  DealUserField,
  CreateUserFieldData,
  CardConfiguration,
  CardSection,
  DealFieldsResponse,
  DealMethodParams
} from '../types';

// Sub-modules for better organization
export class DealUserFields {
  constructor(private sdk: BitrixSDK) {}

  async add(fields: CreateUserFieldData): Promise<BitrixResponse<{ id: number }>> {
    return this.sdk.apiCall('crm.deal.userfield.add', { fields });
  }

  async update(id: number, fields: Partial<DealUserField>): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.userfield.update', { id, fields });
  }

  async get(id: number): Promise<BitrixResponse<DealUserField>> {
    return this.sdk.apiCall('crm.deal.userfield.get', { id });
  }

  async list(params?: {
    order?: Record<string, 'ASC' | 'DESC'>;
    filter?: Record<string, any>;
  }): Promise<BitrixResponse<DealUserField[]>> {
    return this.sdk.apiCall('crm.deal.userfield.list', params || {});
  }

  async delete(id: number): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.userfield.delete', { id });
  }
}

export class DealCardConfig {
  constructor(private sdk: BitrixSDK) {}

  async get(config: {
    scope: 'P' | 'C';
    userId?: number;
    extras?: { dealCategoryId?: number };
  }): Promise<BitrixResponse<CardSection[]>> {
    return this.sdk.apiCall('crm.deal.details.configuration.get', config);
  }

  async set(config: {
    scope: 'P' | 'C';
    userId?: number;
    extras?: { dealCategoryId?: number };
    data: CardSection[];
  }): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.details.configuration.set', config);
  }

  async reset(config: {
    scope: 'P' | 'C';
    userId?: number;
    extras?: { dealCategoryId?: number };
  }): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.details.configuration.reset', config);
  }

  async forceCommonScopeForAll(extras?: { 
    dealCategoryId?: number 
  }): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.details.configuration.forceCommonScopeForAll', { extras });
  }
}

export class DealRecurring {
  constructor(private sdk: BitrixSDK) {}

  async add(fields: Omit<RecurringDealSettings, 'ID'>): Promise<BitrixResponse<{ id: number }>> {
    return this.sdk.apiCall('crm.deal.recurring.add', { fields });
  }

  async update(id: number, fields: Partial<RecurringDealSettings>): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.recurring.update', { id, fields });
  }

  async get(id: number): Promise<BitrixResponse<RecurringDealSettings>> {
    return this.sdk.apiCall('crm.deal.recurring.get', { id });
  }

  async list(params?: {
    order?: Record<string, 'ASC' | 'DESC'>;
    filter?: Record<string, any>;
    select?: string[];
    start?: number;
    limit?: number;
  }): Promise<BitrixResponse<RecurringDealSettings[]>> {
    return this.sdk.apiCall('crm.deal.recurring.list', params || {});
  }

  async delete(id: number): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.recurring.delete', { id });
  }

  async expose(id: number): Promise<BitrixResponse<{ id: number }>> {
    return this.sdk.apiCall('crm.deal.recurring.expose', { id });
  }

  async fields(): Promise<BitrixResponse<Record<string, any>>> {
    return this.sdk.apiCall('crm.deal.recurring.fields');
  }
}

export class CRMDeals extends CRMEntityBase<Deal> {
  public readonly userFields: DealUserFields;
  public readonly cardConfig: DealCardConfig;
  public readonly recurring: DealRecurring;

  constructor(sdk: BitrixSDK) {
    super(sdk, 'crm.deal');
    this.userFields = new DealUserFields(sdk);
    this.cardConfig = new DealCardConfig(sdk);
    this.recurring = new DealRecurring(sdk);
  }

  // Override base methods with proper typing
  async list(params?: DealListParams): Promise<BitrixResponse<Deal[]>>;
  async list(id: "all", params?: Omit<DealListParams, 'start' | 'limit'>): Promise<Deal[]>;
  async list(
    paramsOrId?: DealListParams | "all", 
    additionalParams?: Omit<DealListParams, 'start' | 'limit'>
  ): Promise<BitrixResponse<Deal[]> | Deal[]> {
    if (paramsOrId === "all") {
      return this.getAllPages(additionalParams || {});
    }
    
    return this.sdk.apiCall('crm.deal.list', paramsOrId || {});
  }

  async get(id: number): Promise<BitrixResponse<Deal>>;
  async get(id: "all", params?: Omit<DealListParams, 'start' | 'limit'>): Promise<Deal[]>;
  async get(
    id: number | "all", 
    params?: Omit<DealListParams, 'start' | 'limit'>
  ): Promise<BitrixResponse<Deal> | Deal[]> {
    if (id === "all") {
      return this.getAllPages(params || {});
    }
    
    return this.sdk.apiCall('crm.deal.get', { id });
  }

  // Override base methods with proper typing and deal-specific logic
  async add(
    fields: CreateDealData, 
    params?: DealMethodParams
  ): Promise<BitrixResponse<{ id: number }>> {
    // Validate data before sending
    this.validateDealData(fields);
    
    const response = await this.sdk.apiCall('crm.deal.add', { fields, params });
    
    // Bitrix zwraca po prostu number jako ID, ale bazowa klasa oczekuje { id: number }
    // Normalizujemy odpowiedź
    if (typeof response.result === 'number') {
      return {
        ...response,
        result: { id: response.result }
      };
    }
    
    return response;
  }

  async update(
    id: number, 
    fields: UpdateDealData, 
    params?: DealMethodParams
  ): Promise<BitrixResponse<boolean>> {
    // Validate data before sending
    this.validateDealData(fields);
    
    return this.sdk.apiCall('crm.deal.update', { id, fields, params });
  }

  async fields(): Promise<BitrixResponse<DealFieldsResponse>> {
    return this.sdk.apiCall('crm.deal.fields');
  }

  // === PRODUCT METHODS ===

  /**
   * Set product rows for a deal
   */
  async setProducts(
    dealId: number, 
    products: CreateProductRowData[]
  ): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.productrows.set', {
      id: dealId,
      rows: products
    });
  }

  /**
   * Get product rows for a deal
   */
  async getProducts(dealId: number): Promise<BitrixResponse<ProductRow[]>> {
    return this.sdk.apiCall('crm.deal.productrows.get', { id: dealId });
  }

  /**
   * Add single product to existing products
   */
  async addProduct(
    dealId: number, 
    product: CreateProductRowData
  ): Promise<BitrixResponse<boolean>> {
    // Get existing products first
    const existing = await this.getProducts(dealId);
    const existingProducts = existing.result || [];
    
    // Add new product
    const allProducts = [...existingProducts, product];
    
    return this.setProducts(dealId, allProducts);
  }

  /**
   * Remove all products from deal
   */
  async clearProducts(dealId: number): Promise<BitrixResponse<boolean>> {
    return this.setProducts(dealId, []);
  }

  // === CONTACT METHODS ===

  /**
   * Add contact to deal
   */
  async addContact(
    dealId: number, 
    contactData: { CONTACT_ID: number; SORT?: number; IS_PRIMARY?: 'Y' | 'N' }
  ): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.contact.add', {
      id: dealId,
      fields: contactData
    });
  }

  /**
   * Set multiple contacts for deal
   */
  async setContacts(
    dealId: number, 
    contacts: DealContact[]
  ): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.contact.items.set', {
      id: dealId,
      items: contacts
    });
  }

  /**
   * Get contacts associated with deal
   */
  async getContacts(dealId: number): Promise<BitrixResponse<DealContact[]>> {
    return this.sdk.apiCall('crm.deal.contact.items.get', { id: dealId });
  }

  /**
   * Remove contact from deal
   */
  async removeContact(
    dealId: number, 
    contactId: number
  ): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.contact.delete', {
      id: dealId,
      fields: { CONTACT_ID: contactId }
    });
  }

  /**
   * Remove all contacts from deal
   */
  async clearContacts(dealId: number): Promise<BitrixResponse<boolean>> {
    return this.sdk.apiCall('crm.deal.contact.items.delete', { id: dealId });
  }

  /**
   * Get fields description for deal-contact relationship
   */
  async getContactFields(): Promise<BitrixResponse<Record<string, any>>> {
    return this.sdk.apiCall('crm.deal.contact.fields');
  }

  // === HELPER METHODS ===

  /**
   * Get deals by stage
   */
  async getByStage(
    stageId: string, 
    params?: DealListParams
  ): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        STAGE_ID: stageId
      }
    });
  }

  /**
   * Get deals by category (funnel)
   */
  async getByCategory(
    categoryId: string, 
    params?: DealListParams
  ): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        CATEGORY_ID: categoryId
      }
    });
  }

  /**
   * Get won deals
   */
  async getWonDeals(params?: DealListParams): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        STAGE_SEMANTIC_ID: 'S'
      }
    });
  }

  /**
   * Get lost deals
   */
  async getLostDeals(params?: DealListParams): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        STAGE_SEMANTIC_ID: 'F'
      }
    });
  }

  /**
   * Get deals in progress
   */
  async getInProgressDeals(params?: DealListParams): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        STAGE_SEMANTIC_ID: 'P'
      }
    });
  }

  /**
   * Get deals by assigned user
   */
  async getByAssignedUser(
    userId: string, 
    params?: DealListParams
  ): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        ASSIGNED_BY_ID: userId
      }
    });
  }

  /**
   * Get new deals (first stage)
   */
  async getNewDeals(params?: DealListParams): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        IS_NEW: 'Y'
      }
    });
  }

  /**
   * Get deals by company
   */
  async getByCompany(
    companyId: string, 
    params?: DealListParams
  ): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        COMPANY_ID: companyId
      }
    });
  }

  /**
   * Get deals by contact
   */
  async getByContact(
    contactId: string,
    params?: DealListParams
  ): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        CONTACT_ID: contactId
      }
    });
  }

  /**
   * Get deals within amount range
   */
  async getByAmountRange(
    minAmount: number,
    maxAmount: number,
    currency?: string,
    params?: DealListParams
  ): Promise<Deal[]> {
    const filter: any = {
      ...params?.filter,
      '>=OPPORTUNITY': minAmount,
      '<=OPPORTUNITY': maxAmount
    };

    if (currency) {
      filter.CURRENCY_ID = currency;
    }

    return this.list("all", {
      ...params,
      filter
    });
  }

  /**
   * Get deals created in date range
   */
  async getByDateRange(
    startDate: string,
    endDate: string,
    params?: DealListParams
  ): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        '>=DATE_CREATE': startDate,
        '<=DATE_CREATE': endDate
      }
    });
  }

  /**
   * Search deals by title
   */
  async searchByTitle(
    title: string, 
    params?: DealListParams
  ): Promise<Deal[]> {
    return this.list("all", {
      ...params,
      filter: {
        ...params?.filter,
        '%TITLE': title
      }
    });
  }

  /**
   * Move deal to different stage
   */
  async moveToStage(
    dealId: number, 
    stageId: string,
    additionalFields?: UpdateDealData
  ): Promise<BitrixResponse<boolean>> {
    return this.update(dealId, {
      STAGE_ID: stageId,
      ...additionalFields
    });
  }

  /**
   * Close deal as won
   */
  async markAsWon(
    dealId: number, 
    additionalFields?: UpdateDealData
  ): Promise<BitrixResponse<boolean>> {
    return this.update(dealId, {
      STAGE_ID: 'WON', // Standard won stage
      CLOSED: 'Y',
      ...additionalFields
    });
  }

  /**
   * Close deal as lost
   */
  async markAsLost(
    dealId: number, 
    reason?: string,
    additionalFields?: UpdateDealData
  ): Promise<BitrixResponse<boolean>> {
    const fields: UpdateDealData = {
      STAGE_ID: 'LOSE', // Standard lost stage
      CLOSED: 'Y',
      ...additionalFields
    };

    if (reason) {
      fields.COMMENTS = reason;
    }

    return this.update(dealId, fields);
  }

  /**
   * Reopen closed deal
   */
  async reopen(
    dealId: number, 
    newStageId?: string,
    additionalFields?: UpdateDealData
  ): Promise<BitrixResponse<boolean>> {
    return this.update(dealId, {
      CLOSED: 'N',
      STAGE_ID: newStageId || 'NEW',
      ...additionalFields
    });
  }

  /**
   * Update deal amount and currency
   */
  async updateAmount(
    dealId: number,
    amount: number,
    currency?: string,
    isManual: boolean = true
  ): Promise<BitrixResponse<boolean>> {
    const fields: UpdateDealData = {
      OPPORTUNITY: amount.toString(),
      IS_MANUAL_OPPORTUNITY: isManual ? 'Y' : 'N'
    };

    if (currency) {
      fields.CURRENCY_ID = currency;
    }

    return this.update(dealId, fields);
  }

  /**
   * Assign deal to user
   */
  async assignTo(
    dealId: number, 
    userId: number,
    additionalFields?: UpdateDealData
  ): Promise<BitrixResponse<boolean>> {
    return this.update(dealId, {
      ASSIGNED_BY_ID: userId.toString(),
      ...additionalFields
    });
  }

  /**
   * Set deal dates
   */
  async setDates(
    dealId: number,
    beginDate?: string,
    closeDate?: string,
    additionalFields?: UpdateDealData
  ): Promise<BitrixResponse<boolean>> {
    const fields: UpdateDealData = { ...additionalFields };

    if (beginDate) {
      fields.BEGINDATE = beginDate;
    }

    if (closeDate) {
      fields.CLOSEDATE = closeDate;
    }

    return this.update(dealId, fields);
  }

  /**
   * Make deal recurring
   */
  async makeRecurring(dealId: number): Promise<BitrixResponse<boolean>> {
    return this.update(dealId, { IS_RECURRING: 'Y' });
  }

  /**
   * Convert deal from recurring template
   */
  async convertFromRecurring(dealId: number): Promise<BitrixResponse<boolean>> {
    return this.update(dealId, { IS_RECURRING: 'N' });
  }

  // === BATCH OPERATIONS ===

  /**
   * Batch create multiple deals
   */
  async createMultiple(
    deals: CreateDealData[],
    params?: DealMethodParams
  ): Promise<BitrixResponse<Record<string, any>>> {
    const cmd = deals.reduce((acc, deal, index) => {
      const queryParams = new URLSearchParams({
        fields: JSON.stringify(deal),
        ...(params && { params: JSON.stringify(params) })
      });
      acc[`cmd_${index}`] = `crm.deal.add?${queryParams.toString()}`;
      return acc;
    }, {} as Record<string, string>);

    return this.sdk.apiCall('batch', { cmd });
  }

  /**
   * Batch update multiple deals
   */
  async updateMultiple(
    updates: Array<{ id: number; fields: UpdateDealData }>,
    params?: DealMethodParams
  ): Promise<BitrixResponse<Record<string, any>>> {
    const cmd = updates.reduce((acc, update, index) => {
      const queryParams = new URLSearchParams({
        id: update.id.toString(),
        fields: JSON.stringify(update.fields),
        ...(params && { params: JSON.stringify(params) })
      });
      acc[`cmd_${index}`] = `crm.deal.update?${queryParams.toString()}`;
      return acc;
    }, {} as Record<string, string>);

    return this.sdk.apiCall('batch', { cmd });
  }

  /**
   * Batch get multiple deals
   */
  async getMultiple(dealIds: number[]): Promise<BitrixResponse<Record<string, any>>> {
    const cmd = dealIds.reduce((acc, id, index) => {
      acc[`cmd_${index}`] = `crm.deal.get?id=${id}`;
      return acc;
    }, {} as Record<string, string>);

    return this.sdk.apiCall('batch', { cmd });
  }

  /**
   * Batch delete multiple deals
   */
  async deleteMultiple(dealIds: number[]): Promise<BitrixResponse<Record<string, any>>> {
    const cmd = dealIds.reduce((acc, id, index) => {
      acc[`cmd_${index}`] = `crm.deal.delete?id=${id}`;
      return acc;
    }, {} as Record<string, string>);

    return this.sdk.apiCall('batch', { cmd });
  }

  /**
   * Batch move deals to stage
   */
  async moveMultipleToStage(
    dealIds: number[],
    stageId: string,
    additionalFields?: UpdateDealData
  ): Promise<BitrixResponse<Record<string, any>>> {
    const updates = dealIds.map(id => ({
      id,
      fields: {
        STAGE_ID: stageId,
        ...additionalFields
      }
    }));

    return this.updateMultiple(updates);
  }

  /**
   * Batch assign deals to user
   */
  async assignMultipleTo(
    dealIds: number[],
    userId: number,
    additionalFields?: UpdateDealData
  ): Promise<BitrixResponse<Record<string, any>>> {
    const updates = dealIds.map(id => ({
      id,
      fields: {
        ASSIGNED_BY_ID: userId.toString(),
        ...additionalFields
      }
    }));

    return this.updateMultiple(updates);
  }

  // === STATISTICS METHODS ===

  /**
   * Get deals count by stage
   */
  async getCountByStage(categoryId?: number): Promise<Record<string, number>> {
    const filter: any = {};
    if (categoryId !== undefined) {
      filter.CATEGORY_ID = categoryId;
    }

    const deals = await this.list("all", { 
      filter,
      select: ['ID', 'STAGE_ID']
    });

    return deals.reduce((acc, deal) => {
      const stage = deal.STAGE_ID || 'UNKNOWN';
      acc[stage] = (acc[stage] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get total amount by currency
   */
  async getTotalAmountByCurrency(
    filter?: DealListParams['filter']
  ): Promise<Record<string, number>> {
    const deals = await this.list("all", {
      filter,
      select: ['ID', 'OPPORTUNITY', 'CURRENCY_ID', 'STAGE_SEMANTIC_ID']
    });

    // Only count deals in progress or won (not lost)
    const validDeals = deals.filter(deal => 
      deal.STAGE_SEMANTIC_ID === 'P' || deal.STAGE_SEMANTIC_ID === 'S'
    );

    return validDeals.reduce((acc, deal) => {
      const currency = deal.CURRENCY_ID || 'UNKNOWN';
      const amount = parseFloat(deal.OPPORTUNITY || '0');
      acc[currency] = (acc[currency] || 0) + amount;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Get conversion rate from stage to stage
   */
  async getConversionRate(
    fromStage: string,
    toStage: string,
    dateRange?: { start: string; end: string }
  ): Promise<{ total: number; converted: number; rate: number }> {
    const filter: any = {};
    
    if (dateRange) {
      filter['>=DATE_CREATE'] = dateRange.start;
      filter['<=DATE_CREATE'] = dateRange.end;
    }

    // Get all deals that were in the source stage
    const allDeals = await this.list("all", {
      filter,
      select: ['ID', 'STAGE_ID']
    });

    // This is a simplified version - in practice you'd need stage history
    const totalInFromStage = allDeals.filter(deal => deal.STAGE_ID === fromStage).length;
    const convertedToToStage = allDeals.filter(deal => deal.STAGE_ID === toStage).length;

    const rate = totalInFromStage > 0 ? (convertedToToStage / totalInFromStage) * 100 : 0;

    return {
      total: totalInFromStage,
      converted: convertedToToStage,
      rate: Math.round(rate * 100) / 100
    };
  }

  // === UTILITY METHODS ===

  /**
   * Validate deal data before sending to API
   */
  validateDealData(data: CreateDealData | UpdateDealData): boolean {
    // Add validation logic based on your business rules
    if (data.OPPORTUNITY && isNaN(parseFloat(data.OPPORTUNITY))) {
      throw new Error('OPPORTUNITY must be a valid number');
    }

    if (data.PROBABILITY && (data.PROBABILITY < 0 || data.PROBABILITY > 100)) {
      throw new Error('PROBABILITY must be between 0 and 100');
    }

    if (data.IS_MANUAL_OPPORTUNITY && !['Y', 'N'].includes(data.IS_MANUAL_OPPORTUNITY)) {
      throw new Error('IS_MANUAL_OPPORTUNITY must be Y or N');
    }

    // Validate stage semantic ID if provided
    if (data.STAGE_SEMANTIC_ID && !['P', 'S', 'F'].includes(data.STAGE_SEMANTIC_ID)) {
      throw new Error('STAGE_SEMANTIC_ID must be P, S, or F');
    }

    // Validate boolean-like fields
    const booleanFields = [
      'IS_NEW', 'IS_RECURRING', 'IS_RETURN_CUSTOMER', 'IS_REPEATED_APPROACH',
      'OPENED', 'CLOSED', 'IS_MANUAL_OPPORTUNITY'
    ] as const;

    booleanFields.forEach(field => {
      if (data[field] && !['Y', 'N'].includes(data[field])) {
        throw new Error(`${field} must be Y or N`);
      }
    });

    // Validate UTM_MEDIUM if provided
    if (data.UTM_MEDIUM && !['CPC', 'CPM'].includes(data.UTM_MEDIUM)) {
      console.warn('UTM_MEDIUM should typically be CPC or CPM');
    }

    return true;
  }

  /**
   * Format deal data for display
   */
  formatDeal(deal: Deal): {
    id: string;
    title: string;
    stage: string;
    amount: string;
    currency: string;
    probability: string;
    assignedTo: string;
    createdAt: string;
    modifiedAt: string;
  } {
    return {
      id: deal.ID || '',
      title: deal.TITLE || 'Untitled Deal',
      stage: deal.STAGE_ID || 'UNKNOWN',
      amount: deal.OPPORTUNITY || '0',
      currency: deal.CURRENCY_ID || '',
      probability: deal.PROBABILITY ? `${deal.PROBABILITY}%` : '0%',
      assignedTo: deal.ASSIGNED_BY_ID || '',
      createdAt: deal.DATE_CREATE || '',
      modifiedAt: deal.DATE_MODIFY || ''
    };
  }

  /**
   * Get deal summary statistics
   */
  async getSummary(filter?: DealListParams['filter']): Promise<{
    total: number;
    inProgress: number;
    won: number;
    lost: number;
    totalAmount: Record<string, number>;
    averageAmount: Record<string, number>;
    topStages: Array<{ stage: string; count: number }>;
  }> {
    const deals = await this.list("all", {
      filter,
      select: ['ID', 'STAGE_ID', 'STAGE_SEMANTIC_ID', 'OPPORTUNITY', 'CURRENCY_ID']
    });

    const total = deals.length;
    const inProgress = deals.filter(d => d.STAGE_SEMANTIC_ID === 'P').length;
    const won = deals.filter(d => d.STAGE_SEMANTIC_ID === 'S').length;
    const lost = deals.filter(d => d.STAGE_SEMANTIC_ID === 'F').length;

    const totalAmount = await this.getTotalAmountByCurrency(filter);
    
    const averageAmount: Record<string, number> = {};
    Object.entries(totalAmount).forEach(([currency, amount]) => {
      const currencyDeals = deals.filter(d => d.CURRENCY_ID === currency).length;
      averageAmount[currency] = currencyDeals > 0 ? amount / currencyDeals : 0;
    });

    const stageCount = await this.getCountByStage();
    const topStages = Object.entries(stageCount)
      .map(([stage, count]) => ({ stage, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      total,
      inProgress,
      won,
      lost,
      totalAmount,
      averageAmount,
      topStages
    };
  }

  // === PROTECTED METHODS (override from base) ===

  protected async getAllPages(params: Omit<DealListParams, 'start' | 'limit'> = {}): Promise<Deal[]> {
    const results: Deal[] = [];
    let start = 0;
    const limit = 50;
    let hasMore = true;

    while (hasMore) {
      const response: BitrixResponse<Deal[]> = await this.sdk.apiCall('crm.deal.list', {
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
}