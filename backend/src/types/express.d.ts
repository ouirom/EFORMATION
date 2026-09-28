declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        tenantId: number;
        email: string;
        role: string;
        enterpriseId?: number;
        subsidiaryId?: number;
        directionId?: number;
        serviceId?: number;
      };
    }
  }
}

export {};

