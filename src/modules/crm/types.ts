export * from "./types/dealTypes";

export interface BitrixResponse<T = any> {
    result: T;
    total?: number;
    next?: number;
    time?: {
      start: number;
      finish: number;
      duration: number;
      processing: number;
      date_start: string;
      date_finish: string;
    };
  }
  
  export interface ListParams {
    start?: number;
    limit?: number;
    order?: Record<string, 'ASC' | 'DESC'>;
    filter?: Record<string, any>;
    select?: string[];
  }