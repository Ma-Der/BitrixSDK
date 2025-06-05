import { CRMEntityBase } from '../base/CRMEntityBase';
import { BitrixSDK } from '../../../client/BitrixClient';

export interface Deal {
  ID?: string;
  TITLE?: string;
  STAGE_ID?: string;
  OPPORTUNITY?: string;
  CURRENCY_ID?: string;
  [key: string]: any;
}

export class CRMDeals extends CRMEntityBase<Deal> {
  constructor(sdk: BitrixSDK) {
    super(sdk, 'crm.deal');
  }
}
