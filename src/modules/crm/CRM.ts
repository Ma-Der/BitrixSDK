import { BitrixSDK } from '../../client/BitrixClient';
import { CRMContacts } from './entities/CRMContacts';
import { CRMDeals } from './entities/CRMDeals';
import { CRMLeads } from './entities/CRMLeads';
import { CRMCompanies } from './entities/CRMCompanies';

/**
 * Główna klasa CRM do zarządzania wszystkimi modułami
 */
export class CRM {
  public readonly contacts: CRMContacts;
  public readonly deals: CRMDeals;
  public readonly leads: CRMLeads;
  public readonly companies: CRMCompanies;

  constructor(private sdk: BitrixSDK) {
    this.contacts = new CRMContacts(sdk);
    this.deals = new CRMDeals(sdk);
    this.leads = new CRMLeads(sdk);
    this.companies = new CRMCompanies(sdk);
  }

  /**
   * Batch operations dla CRM - obsługuje wszystkie typy encji
   */
  async batch(calls: Array<{ 
    entity: 'contact' | 'deal' | 'lead' | 'company';
    method: string; 
    params?: Record<string, any> 
  }>) {
    const cmd = calls.reduce((acc, call, index) => {
      const fullMethod = `crm.${call.entity}.${call.method}`;
      acc[`cmd_${index}`] = `${fullMethod}?${new URLSearchParams(call.params || {}).toString()}`;
      return acc;
    }, {} as Record<string, string>);

    return this.sdk.apiCall('batch', { cmd });
  }

  /**
   * Uniwersalne batch operacje z lepszą obsługą typów
   */
  async batchOperations<T = any>(operations: Array<{
    method: string;
    params?: Record<string, any>;
    priority?: number;
  }>): Promise<Record<string, T>> {
    const cmd = operations.reduce((acc, op, index) => {
      const queryParams = new URLSearchParams(op.params || {});
      acc[`cmd_${index}`] = `${op.method}?${queryParams.toString()}`;
      return acc;
    }, {} as Record<string, string>);

    const response = await this.sdk.apiCall('batch', { cmd });
    return response.result || {};
  }

  /**
   * Zaawansowane batch operacje z kontrolą priorytetów
   */
  async batchWithPriority(
    highPriorityOps: Array<{ method: string; params?: Record<string, any> }>,
    normalPriorityOps: Array<{ method: string; params?: Record<string, any> }> = [],
    lowPriorityOps: Array<{ method: string; params?: Record<string, any> }> = []
  ) {
    const results = {
      high: {} as Record<string, any>,
      normal: {} as Record<string, any>,
      low: {} as Record<string, any>
    };

    // Wykonaj operacje wysokiego priorytetu
    if (highPriorityOps.length > 0) {
      results.high = await this.batchOperations(
        highPriorityOps.map(op => ({ ...op, priority: 100 }))
      );
    }

    // Wykonaj operacje normalnego priorytetu
    if (normalPriorityOps.length > 0) {
      results.normal = await this.batchOperations(
        normalPriorityOps.map(op => ({ ...op, priority: 0 }))
      );
    }

    // Wykonaj operacje niskiego priorytetu
    if (lowPriorityOps.length > 0) {
      results.low = await this.batchOperations(
        lowPriorityOps.map(op => ({ ...op, priority: -100 }))
      );
    }

    return results;
  }

  /**
   * Cross-entity search - wyszukiwanie w różnych typach obiektów CRM
   */
  async globalSearch(query: string, entities: Array<'contact' | 'deal' | 'lead' | 'company'> = ['contact', 'deal', 'lead', 'company']) {
    const searches = entities.map(entity => {
      let searchField = 'TITLE'; // domyślne pole
      
      switch (entity) {
        case 'contact':
          searchField = 'NAME';
          break;
        case 'deal':
          searchField = 'TITLE';
          break;
        case 'lead':
          searchField = 'TITLE';
          break;
        case 'company':
          searchField = 'TITLE';
          break;
      }

      return {
        entity,
        method: `${entity}.list`,
        params: {
          filter: { [`%${searchField}`]: query },
          select: ['ID', searchField, 'DATE_CREATE'],
          limit: 10
        }
      };
    });

    const results = await this.batchOperations(searches);
    
    // Formatuj wyniki
    const formatted: Record<string, any[]> = {};
    entities.forEach((entity, index) => {
      const result = results[`cmd_${index}`];
      formatted[entity] = result?.result || [];
    });

    return formatted;
  }

  /**
   * Statystyki CRM - podsumowanie wszystkich modułów
   */
  async getGlobalStats(dateRange?: { start: string; end: string }) {
    const filter = dateRange ? {
      '>=DATE_CREATE': dateRange.start,
      '<=DATE_CREATE': dateRange.end
    } : {};

    const operations = [
      { method: 'crm.deal.list', params: { filter, select: ['ID', 'STAGE_SEMANTIC_ID', 'OPPORTUNITY', 'CURRENCY_ID'] }},
      { method: 'crm.contact.list', params: { filter, select: ['ID', 'DATE_CREATE'] }},
      { method: 'crm.company.list', params: { filter, select: ['ID', 'DATE_CREATE'] }},
      { method: 'crm.lead.list', params: { filter, select: ['ID', 'STATUS_SEMANTIC_ID', 'DATE_CREATE'] }}
    ];

    const results = await this.batchOperations(operations);

    const deals = results.cmd_0?.result || [];
    const contacts = results.cmd_1?.result || [];
    const companies = results.cmd_2?.result || [];
    const leads = results.cmd_3?.result || [];

    return {
      deals: {
        total: deals.length,
        won: deals.filter((d: any) => d.STAGE_SEMANTIC_ID === 'S').length,
        lost: deals.filter((d: any) => d.STAGE_SEMANTIC_ID === 'F').length,
        inProgress: deals.filter((d: any) => d.STAGE_SEMANTIC_ID === 'P').length,
        totalAmount: deals.reduce((sum: number, d: any) => {
          return sum + (parseFloat(d.OPPORTUNITY || '0'));
        }, 0)
      },
      contacts: {
        total: contacts.length
      },
      companies: {
        total: companies.length
      },
      leads: {
        total: leads.length,
        converted: leads.filter((l: any) => l.STATUS_SEMANTIC_ID === 'CONVERTED').length,
        processing: leads.filter((l: any) => l.STATUS_SEMANTIC_ID === 'PROCESSING').length
      },
      summary: {
        totalEntities: deals.length + contacts.length + companies.length + leads.length
      }
    };
  }

  /**
   * Import danych - batch tworzenie encji
   */
  async bulkImport(data: {
    contacts?: Array<any>;
    companies?: Array<any>;
    deals?: Array<any>;
    leads?: Array<any>;
  }) {
    const operations: Array<{ method: string; params: any }> = [];

    // Dodaj operacje tworzenia dla każdego typu
    if (data.contacts) {
      data.contacts.forEach(contact => {
        operations.push({
          method: 'crm.contact.add',
          params: { fields: contact }
        });
      });
    }

    if (data.companies) {
      data.companies.forEach(company => {
        operations.push({
          method: 'crm.company.add',
          params: { fields: company }
        });
      });
    }

    if (data.deals) {
      data.deals.forEach(deal => {
        operations.push({
          method: 'crm.deal.add',
          params: { fields: deal }
        });
      });
    }

    if (data.leads) {
      data.leads.forEach(lead => {
        operations.push({
          method: 'crm.lead.add',
          params: { fields: lead }
        });
      });
    }

    // Wykonaj batch import
    const results = await this.batchOperations(operations);
    
    // Policz sukcesy i błędy
    const stats = {
      total: operations.length,
      success: 0,
      errors: 0,
      results: results
    };

    Object.values(results).forEach(result => {
      if (result && !result.error) {
        stats.success++;
      } else {
        stats.errors++;
      }
    });

    return stats;
  }

  /**
   * Synchronizacja między encjami - np. aktualizacja kontaktów w dealach
   */
  async syncEntities(syncOperations: Array<{
    type: 'contact-to-deal' | 'company-to-deal' | 'lead-to-deal';
    sourceId: number;
    targetId: number;
    syncFields?: string[];
  }>) {
    const operations: Array<{ method: string; params: any }> = [];

    for (const sync of syncOperations) {
      if (sync.type === 'contact-to-deal') {
        // Dodaj kontakt do deala
        operations.push({
          method: 'crm.deal.contact.add',
          params: {
            id: sync.targetId,
            fields: { CONTACT_ID: sync.sourceId }
          }
        });
      }
      // Dodaj inne typy synchronizacji w przyszłości
    }

    return this.batchOperations(operations);
  }

  /**
   * Workflow CRM - automatyzacja procesów
   */
  async executeWorkflow(workflowType: string, entityId: number, entityType: 'deal' | 'lead' | 'contact' | 'company', params?: Record<string, any>) {
    switch (workflowType) {
      case 'lead-to-deal':
        return this.convertLeadToDeal(entityId, params);
      
      case 'deal-won':
        return this.processDealWon(entityId, params);
      
      case 'deal-lost':
        return this.processDealLost(entityId, params);
      
      default:
        throw new Error(`Unknown workflow type: ${workflowType}`);
    }
  }

  /**
   * Konwersja lead -> deal
   */
  private async convertLeadToDeal(leadId: number, params?: Record<string, any>) {
    // Pobierz dane lead'a
    const leadResponse = await this.leads.get(leadId);
    const lead = leadResponse.result;

    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    // Utwórz deal na podstawie lead'a
    const dealData = {
      TITLE: lead.TITLE || `Deal from Lead ${leadId}`,
      STAGE_ID: 'NEW',
      OPPORTUNITY: lead.OPPORTUNITY || '0',
      CURRENCY_ID: lead.CURRENCY_ID || 'USD',
      COMPANY_ID: lead.COMPANY_ID,
      CONTACT_ID: lead.CONTACT_ID,
      SOURCE_ID: lead.SOURCE_ID,
      ASSIGNED_BY_ID: lead.ASSIGNED_BY_ID,
      COMMENTS: `Converted from Lead ID: ${leadId}`,
      ...params
    };

    const dealResult = await this.deals.add(dealData);
    
    // Zaktualizuj lead jako skonwertowany
    await this.leads.update(leadId, {
      STATUS_ID: 'CONVERTED',
      OPPORTUNITY: '0' // Lead został przekonwertowany
    });

    return {
      leadId,
      dealId: dealResult.result.id,
      success: true
    };
  }

  /**
   * Przetwarzanie wygranego deala
   */
  private async processDealWon(dealId: number, params?: Record<string, any>) {
    await this.deals.markAsWon(dealId, {
      COMMENTS: 'Deal automatically processed as won',
      ...params
    });

    return { dealId, status: 'won', processedAt: new Date().toISOString() };
  }

  /**
   * Przetwarzanie przegranego deala
   */
  private async processDealLost(dealId: number, params?: Record<string, any>) {
    const reason = params?.reason || 'Deal automatically processed as lost';
    
    await this.deals.markAsLost(dealId, reason, {
      ...params
    });

    return { dealId, status: 'lost', reason, processedAt: new Date().toISOString() };
  }

  /**
   * Health check wszystkich modułów CRM
   */
  async healthCheck() {
    try {
      const checks = await this.batchOperations([
        { method: 'crm.deal.fields', params: {} },
        { method: 'crm.contact.fields', params: {} },
        { method: 'crm.company.fields', params: {} },
        { method: 'crm.lead.fields', params: {} }
      ]);

      return {
        status: 'healthy',
        modules: {
          deals: !!checks.cmd_0?.result,
          contacts: !!checks.cmd_1?.result,
          companies: !!checks.cmd_2?.result,
          leads: !!checks.cmd_3?.result
        },
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Pobranie konfiguracji CRM
   */
  async getConfiguration() {
    const operations = [
      { method: 'crm.status.list', params: { filter: { ENTITY_ID: 'DEAL_STAGE' } }},
      { method: 'crm.status.list', params: { filter: { ENTITY_ID: 'SOURCE' } }},
      { method: 'crm.category.list', params: { entityTypeId: 2 }}, // Deal categories
      { method: 'crm.currency.list', params: {} }
    ];

    const results = await this.batchOperations(operations);

    return {
      dealStages: results.cmd_0?.result || [],
      sources: results.cmd_1?.result || [],
      dealCategories: results.cmd_2?.result || [],
      currencies: results.cmd_3?.result || []
    };
  }
}

// Export all types and classes for easy importing
export * from './types';
export * from './base/CRMEntityBase';
export * from './entities/CRMContacts';
export * from './entities/CRMDeals';
export * from './entities/CRMLeads';
export * from './entities/CRMCompanies';