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
