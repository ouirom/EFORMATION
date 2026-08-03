export declare const config: {
    nodeEnv: string;
    port: number;
    host: string;
    database: {
        server: string;
        database: string;
        user: string;
        password: string;
        options: {
            encrypt: boolean;
            trustServerCertificate: boolean;
            enableArithAbort: boolean;
        };
        pool: {
            max: number;
            min: number;
            idleTimeoutMillis: number;
        };
    };
    jwt: {
        secret: string;
        expiresIn: string;
        refreshSecret: string;
        refreshExpiresIn: string;
    };
    redis: {
        host: string;
        port: number;
        password: string;
    };
    frontendUrl: string;
    uploadDir: string;
    maxFileSize: number;
    smtp: {
        host: string;
        port: number;
        user: string;
        password: string;
        from: string;
        fromName: string;
    };
    twilio: {
        accountSid: string;
        authToken: string;
        phoneNumber: string;
        whatsappNumber: string;
    };
    firebase: {
        projectId: string;
        clientEmail: string;
        privateKey: string;
    };
    webPush: {
        publicKey: string;
        privateKey: string;
        subject: string;
    };
    openai: {
        apiKey: string;
        model: string;
        embeddingModel: string;
    };
    azureAd: {
        tenantId: string;
        clientId: string;
        clientSecret: string;
    };
    google: {
        clientId: string;
        clientSecret: string;
    };
    zoom: {
        clientId: string;
        clientSecret: string;
        accountId: string;
    };
    stripe: {
        secretKey: string;
        webhookSecret: string;
    };
    bcryptRounds: number;
    rateLimitWindow: number;
    rateLimitMax: number;
    corsOrigins: string[];
    defaultTenantId: number;
    logLevel: string;
    certificateVerifyUrl: string;
};
//# sourceMappingURL=index.d.ts.map