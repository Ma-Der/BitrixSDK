  import { BitrixSDK } from '../../client/BitrixClient';
  import { CRMContacts } from './entities/CRMContacts';
  import { CRMDeals } from './entities/CRMDeals';
  import { CRMLeads } from './entities/CRMLeads';
  import { CRMCompanies } from './entities/CRMCompanies';
  
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
     * Batch operations dla CRM
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
  }
  
  export * from './types';
  export * from './base/CRMEntityBase';
  export * from './entities/CRMContacts';
  export * from './entities/CRMDeals';
  export * from './entities/CRMLeads';
  export * from './entities/CRMCompanies';