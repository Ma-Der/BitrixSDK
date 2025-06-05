import { CRMEntityBase } from '../base/CRMEntityBase';
import { BitrixSDK } from '../../../client/BitrixClient';

// Placeholder interface
export interface Company {
  ID?: string;
  TITLE?: string;
  COMPANY_TYPE?: string;
  INDUSTRY?: string;
  [key: string]: any;
}

export class CRMCompanies extends CRMEntityBase<Company> {
  constructor(sdk: BitrixSDK) {
    super(sdk, 'crm.company');
  }
}
