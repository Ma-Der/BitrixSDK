import { CRMEntityBase } from '../base/CRMEntityBase';
import { BitrixSDK } from '../../../client/BitrixClient';

// Placeholder interface - będziemy rozwijać na bazie dokumentacji
export interface Contact {
  ID?: string;
  NAME?: string;
  LAST_NAME?: string;
  EMAIL?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  PHONE?: Array<{ VALUE: string; VALUE_TYPE: string }>;
  [key: string]: any;
}

export class CRMContacts extends CRMEntityBase<Contact> {
  constructor(sdk: BitrixSDK) {
    super(sdk, 'crm.contact');
  }

  // Tutaj będziemy dodawać specyficzne metody dla kontaktów
  // na bazie dokumentacji API
}
