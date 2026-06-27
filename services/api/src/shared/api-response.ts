export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
}

export interface PageResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function ok<T>(data: T): ApiResponse<T> {
  return {
    code: 0,
    message: "ok",
    data,
  };
}

export function page<T>(items: T[], pageNumber = 1, pageSize = 20): PageResult<T> {
  return {
    items,
    page: pageNumber,
    pageSize,
    total: items.length,
  };
}

export interface PaginationQuery {
  page?: string;
  pageSize?: string;
}

export function paged<T>(items: T[], query: PaginationQuery = {}): PageResult<T> {
  const pageNumber = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);
  const start = (pageNumber - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    page: pageNumber,
    pageSize,
    total: items.length,
  };
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
