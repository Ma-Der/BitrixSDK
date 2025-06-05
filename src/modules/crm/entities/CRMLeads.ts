import { CRMEntityBase } from '../base/CRMEntityBase';
import { BitrixSDK } from '../../../client/BitrixClient';

// Placeholder interface
export interface Lead {
  ID?: string;
  TITLE?: string;
  NAME?: string;
  LAST_NAME?: string;
  STATUS_ID?: string;
  [key: string]: any;
}

export class CRMLeads extends CRMEntityBase<Lead> {
  constructor(sdk: BitrixSDK) {
    super(sdk, 'crm.lead');
  }
}
