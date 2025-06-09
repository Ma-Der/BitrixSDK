// Types for Bitrix CRM Deals based on documentation
import {
  CRMEntity,
  CreateEntityData,
  UpdateEntityData,
  SimpleListParams,
} from '../base/CRMEntityBase';

export interface Deal extends CRMEntity {
  // Basic fields
  TITLE?: string;
  TYPE_ID?: string; // crm_status - deal type
  CATEGORY_ID?: string; // crm_category - sales funnel ID
  STAGE_ID?: string; // crm_status - deal stage
  STAGE_SEMANTIC_ID?: 'P' | 'S' | 'F'; // P-in progress, S-successful, F-unsuccessful

  // Flags
  IS_NEW?: 'Y' | 'N';
  IS_RECURRING?: 'Y' | 'N';
  IS_RETURN_CUSTOMER?: 'Y' | 'N';
  IS_REPEATED_APPROACH?: 'Y' | 'N';
  IS_MANUAL_OPPORTUNITY?: 'Y' | 'N';

  // Financial
  PROBABILITY?: number; // %
  CURRENCY_ID?: string; // crm_currency
  OPPORTUNITY?: string; // Amount
  TAX_VALUE?: string; // Tax amount

  // Relations
  COMPANY_ID?: string; // crm_company
  CONTACT_ID?: string; // Deprecated
  CONTACT_IDS?: string[]; // Array of contact IDs
  QUOTE_ID?: string; // crm_quote
  LEAD_ID?: string; // crm_lead

  // Dates
  BEGINDATE?: string; // date
  CLOSEDATE?: string; // date
  MOVED_TIME?: string; // datetime

  // Access
  OPENED?: 'Y' | 'N'; // Available to everyone
  CLOSED?: 'Y' | 'N'; // Is closed

  // Content
  COMMENTS?: string;
  ADDITIONAL_INFO?: string;

  // Users
  ASSIGNED_BY_ID?: string; // user - responsible person
  MOVED_BY_ID?: string; // user - who moved to current stage (read-only)

  // Source
  SOURCE_ID?: string; // crm_status - source type
  SOURCE_DESCRIPTION?: string;

  // Location
  LOCATION_ID?: string; // location - system field

  // External
  ORIGINATOR_ID?: string; // External source ID
  ORIGIN_ID?: string; // ID in external source

  // UTM
  UTM_SOURCE?: string; // Advertising system
  UTM_MEDIUM?: string; // Traffic type (CPC, CPM)
  UTM_CAMPAIGN?: string; // Campaign ID
  UTM_CONTENT?: string; // Campaign content
  UTM_TERM?: string; // Search terms

  // Activity
  LAST_ACTIVITY_TIME?: string; // datetime
  LAST_ACTIVITY_BY?: string; // user

  // Trace for Sales Intelligence
  TRACE?: string;

  // Custom fields (UF_CRM_*)
  [key: `UF_CRM_${string}`]: any;

  // Parent relationship fields (PARENT_ID_*)
  [key: `PARENT_ID_${string}`]: string;
}

// Use the helper types from base class
export type CreateDealData = CreateEntityData<Deal>;
export type UpdateDealData = UpdateEntityData<Deal>;
export type DealListParams = SimpleListParams;

// Product Row Types
export interface ProductRow {
  ID?: string;
  OWNER_ID?: string; // Deal ID
  OWNER_TYPE?: string; // 'D' for deals
  PRODUCT_ID?: number; // 0 if not from catalog
  PRODUCT_NAME?: string;
  ORIGINAL_PRODUCT_NAME?: string;
  PRODUCT_DESCRIPTION?: string;

  // Pricing
  PRICE?: number; // Final cost per unit
  PRICE_EXCLUSIVE?: number; // Cost with discounts, without taxes
  PRICE_NETTO?: number; // Cost without discounts and taxes
  PRICE_BRUTTO?: number; // Cost without discounts, with taxes
  PRICE_ACCOUNT?: string; // Cost in report currency

  // Quantity
  QUANTITY?: number;

  // Discount
  DISCOUNT_TYPE_ID?: 1 | 2; // 1-absolute, 2-percentage
  DISCOUNT_RATE?: number; // Percentage discount
  DISCOUNT_SUM?: number; // Absolute discount

  // Tax
  TAX_RATE?: number; // Tax rate in %
  TAX_INCLUDED?: 'Y' | 'N';

  // Measure
  MEASURE_CODE?: number;
  MEASURE_NAME?: string; // pcs, kg, m, l, etc.

  // Other
  SORT?: number;
  XML_ID?: string;
  TYPE?: 1 | 2 | 3 | 4 | 5 | 6 | 7; // Product type
  STORE_ID?: number;
  CUSTOMIZED?: 'Y' | 'N'; // Deprecated

  // Reserve
  RESERVE_ID?: number;
  DATE_RESERVE_END?: string;
  RESERVE_QUANTITY?: number;
}

export interface CreateProductRowData
  extends Omit<
    ProductRow,
    | 'ID'
    | 'OWNER_ID'
    | 'OWNER_TYPE'
    | 'ORIGINAL_PRODUCT_NAME'
    | 'PRICE_ACCOUNT'
    | 'CUSTOMIZED'
    | 'RESERVE_ID'
    | 'DATE_RESERVE_END'
    | 'RESERVE_QUANTITY'
  > {}

// Contact relationship types
export interface DealContact {
  CONTACT_ID: number;
  SORT?: number;
  IS_PRIMARY?: 'Y' | 'N';
  ROLE_ID?: number; // Reserved
}

// Recurring Deal Types
export interface RecurringDealSettings {
  ID?: number;
  DEAL_ID?: number; // Template deal ID
  BASED_ID?: number; // Original deal ID (read-only)
  ACTIVE?: 'Y' | 'N';
  NEXT_EXECUTION?: string; // date (read-only)
  LAST_EXECUTION?: string; // date (read-only)
  COUNTER_REPEAT?: number; // Number of created deals (read-only)
  START_DATE?: string; // date
  CATEGORY_ID?: number; // Target category
  IS_LIMIT?: 'N' | 'D' | 'T'; // N-no limit, D-date limit, T-count limit
  LIMIT_REPEAT?: number; // Max deals count
  LIMIT_DATE?: string; // date
  PARAMS?: RecurringParams;
}

export interface RecurringParams {
  MODE?: 'single' | 'multiple';

  // Multiple mode
  MULTIPLE_TYPE?: 'day' | 'week' | 'month' | 'year';
  MULTIPLE_INTERVAL?: number;

  // Single mode
  SINGLE_BEFORE_START_DATE_TYPE?: 'day' | 'week' | 'month' | 'year';
  SINGLE_BEFORE_START_DATE_VALUE?: number;

  // Date offsets
  OFFSET_BEGINDATE_TYPE?: 'day' | 'week' | 'month' | 'year';
  OFFSET_BEGINDATE_VALUE?: number;
  OFFSET_CLOSEDATE_TYPE?: 'day' | 'week' | 'month' | 'year';
  OFFSET_CLOSEDATE_VALUE?: number;
}

// User Field Types
export interface DealUserField {
  ID?: number;
  ENTITY_ID?: string; // 'CRM_DEAL'
  FIELD_NAME?: string;
  USER_TYPE_ID?: string; // string, integer, double, datetime, boolean, etc.
  XML_ID?: string;
  SORT?: number;
  MULTIPLE?: 'Y' | 'N';
  MANDATORY?: 'Y' | 'N';
  SHOW_FILTER?: 'Y' | 'N';
  SHOW_IN_LIST?: 'Y' | 'N';
  EDIT_IN_LIST?: 'Y' | 'N';
  IS_SEARCHABLE?: 'Y' | 'N';
  EDIT_FORM_LABEL?: string;
  LIST_COLUMN_LABEL?: string;
  LIST_FILTER_LABEL?: string;
  ERROR_MESSAGE?: string;
  HELP_MESSAGE?: string;
  LIST?: UserFieldListItem[]; // For enumeration type
  SETTINGS?: Record<string, any>;
}

export interface UserFieldListItem {
  ID?: number;
  VALUE: string;
  DEF?: 'Y' | 'N'; // Is default
  SORT?: number;
  XML_ID?: string;
  DEL?: 'Y' | 'N'; // Delete flag for updates
}

export interface CreateUserFieldData extends Omit<DealUserField, 'ID' | 'ENTITY_ID'> {
  FIELD_NAME: string; // Required
}

// Card Configuration Types
export interface CardSection {
  name: string;
  title: string;
  type: 'section';
  elements: CardElement[];
}

export interface CardElement {
  name: string;
  title?: string;
}

export interface CardConfiguration {
  scope: 'P' | 'C'; // P-personal, C-common
  userId?: number; // Required for personal settings
  extras?: {
    dealCategoryId?: number;
  };
  data?: CardSection[];
}

// API Response helper types
export interface DealFieldsResponse {
  [fieldName: string]: {
    type: string;
    isRequired: boolean;
    isReadOnly: boolean;
    isImmutable: boolean;
    isMultiple: boolean;
    isDynamic: boolean;
    isDeprecated?: boolean;
    title: string;
    upperName?: string;
    statusType?: string; // For crm_status fields
    settings?: Record<string, any>;
  };
}

// Batch operation types
export interface DealBatchCall {
  entity: 'deal';
  method:
    | 'add'
    | 'update'
    | 'get'
    | 'list'
    | 'delete'
    | 'fields'
    | 'productrows.get'
    | 'productrows.set';
  params?: Record<string, any>;
}

// Additional params for methods
export interface DealMethodParams {
  REGISTER_SONET_EVENT?: 'Y' | 'N'; // Register in live feed
  REGISTER_HISTORY_EVENT?: 'Y' | 'N'; // Create history record
}
