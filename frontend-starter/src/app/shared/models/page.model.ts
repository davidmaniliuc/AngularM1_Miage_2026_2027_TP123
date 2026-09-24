/**
 * Paginated response of GET /api/tracks (see API_CONTRACT.md).
 * The backend computes it with mongoose-aggregate-paginate-v2.
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
