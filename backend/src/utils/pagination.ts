import { Request } from 'express';

export interface PaginationParams {
  page: number;
  limit: number;
  offset: number;
}

export function parsePagination(req: Request, options: { defaultLimit?: number; maxLimit?: number } = {}): PaginationParams {
  const { defaultLimit = 20, maxLimit = 100 } = options;
  const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit as string, 10) || defaultLimit, maxLimit);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

export function buildPaginationMeta(total: number, page: number, limit: number) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}
