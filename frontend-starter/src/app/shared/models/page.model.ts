/**
 * Shared paginated response of the tracks and games APIs (see API_CONTRACT.md).
 */
export interface Page<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  pages: number;
  /** 1-based position of the first item of this page in the whole list. */
  pagingCounter: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
  prevPage: number | null;
  nextPage: number | null;
}
