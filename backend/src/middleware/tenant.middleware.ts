import { Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/database.service';
import { BadRequestError } from './error.middleware';

export interface TenantRequest extends Request {
  tenantId?: number;
  tenantSlug?: string;
}

const tenantHandler = async (
  req: TenantRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Get tenant from header or subdomain
    const tenantHeader = req.headers['x-tenant-id'] as string;
    const tenantSlug = req.headers['x-tenant-slug'] as string;
    const host = req.headers.host || '';
    
    let tenantId: number | undefined;
    let resolvedSlug: string | undefined;

    if (tenantHeader) {
      tenantId = parseInt(tenantHeader, 10);
      if (isNaN(tenantId)) {
        throw BadRequestError('Invalid tenant ID');
      }
    } else if (tenantSlug) {
      // Look up tenant by slug
      const tenants = await DatabaseService.query<{ id: number; slug: string }>(
        'SELECT id, slug FROM tenants WHERE slug = @slug',
        { slug: tenantSlug }
      );
      
      if (tenants.length > 0) {
        tenantId = tenants[0].id;
        resolvedSlug = tenants[0].slug;
      }
    } else {
      // Try to extract from subdomain (e.g., tenant1.eformation.com)
      const parts = host.split('.');
      if (parts.length > 2) {
        const subdomain = parts[0];
        if (subdomain !== 'www' && subdomain !== 'api') {
          const tenants = await DatabaseService.query<{ id: number; slug: string }>(
            'SELECT id, slug FROM tenants WHERE slug = @slug',
            { slug: subdomain }
          );
          
          if (tenants.length > 0) {
            tenantId = tenants[0].id;
            resolvedSlug = tenants[0].slug;
          }
        }
      }
    }

    // Default to tenant ID 1 for development
    if (!tenantId && process.env.NODE_ENV === 'development') {
      const defaultTenant = await DatabaseService.query<{ id: number; slug: string }>(
        'SELECT TOP 1 id, slug FROM tenants ORDER BY id'
      );
      if (defaultTenant.length > 0) {
        tenantId = defaultTenant[0].id;
        resolvedSlug = defaultTenant[0].slug;
      }
    }

    req.tenantId = tenantId;
    req.tenantSlug = resolvedSlug;
    
    next();
  } catch (error) {
    next(error);
  }
};

export const tenantMiddleware = (req: any, res: Response, next: NextFunction) => {
  return tenantHandler(req as TenantRequest, res, next);
};
