import { User, SSOProvider } from '../types';
interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
interface RegisterDTO {
    tenantId: number;
    email: string;
    password: string;
    displayName: string;
    username?: string;
    role?: string;
    enterpriseId?: number;
    directionId?: number;
    serviceId?: number;
}
interface LoginDTO {
    email: string;
    password: string;
    tenantId?: number;
}
export declare class AuthService {
    /**
     * Register a new user
     */
    static register(data: RegisterDTO): Promise<{
        user: Partial<User>;
        tokens: TokenPair;
    }>;
    /**
     * Login with email and password
     */
    static login(data: LoginDTO): Promise<{
        user: Partial<User>;
        tokens: TokenPair;
    }>;
    /**
     * Refresh access token
     */
    static refreshToken(refreshToken: string): Promise<TokenPair>;
    /**
     * Handle SSO login/registration
     */
    static handleSSOLogin(provider: SSOProvider, externalId: string, profile: {
        email: string;
        displayName: string;
        tenantId?: number;
    }): Promise<{
        user: Partial<User>;
        tokens: TokenPair;
        isNewUser: boolean;
    }>;
    /**
     * Change password
     */
    static changePassword(userId: number, currentPassword: string, newPassword: string): Promise<void>;
    /**
     * Request password reset
     */
    static requestPasswordReset(email: string, tenantId?: number): Promise<string>;
    /**
     * Reset password with token
     */
    static resetPassword(token: string, newPassword: string): Promise<void>;
    /**
     * Logout (invalidate token - requires Redis/blacklist in production)
     */
    static logout(userId: number, tenantId: number): Promise<void>;
    /**
     * Generate access and refresh tokens
     */
    private static generateTokenPair;
    private static parseExpiresIn;
    private static logAudit;
}
export {};
//# sourceMappingURL=auth.service.d.ts.map