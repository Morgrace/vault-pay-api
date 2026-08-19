export interface IPaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  limit: number;
}

export interface IPaginationOptions {
  page?: number;
  limit?: number;
}

export enum ECurrency {
  NGN = 'NGN',
  USD = 'USD',
}
