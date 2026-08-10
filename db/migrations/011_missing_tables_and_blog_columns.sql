-- Creates tables that backend route/service code has referenced for a while but that
-- never existed anywhere (confirmed via live-DB introspection -- see the "schema drift"
-- section of HANDOFF.md), plus columns blog_posts is missing. All the routes/services
-- using these were already fully written and otherwise correct; they were just 500ing
-- on "Invalid object name" / "Invalid column name" against a real database.
--
-- Guarded, safe to re-run: sqlcmd -S localhost -d db_eformation -E -i db/migrations/011_missing_tables_and_blog_columns.sql

-- backend/src/routes/ai.routes.ts (POST /ai/generate/course-outline logs usage, GET /ai/usage reads it)
IF OBJECT_ID('dbo.ai_usage_logs', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.ai_usage_logs (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    feature NVARCHAR(50) NOT NULL,
    prompt_tokens INT NOT NULL DEFAULT 0,
    completion_tokens INT NOT NULL DEFAULT 0,
    model NVARCHAR(50) NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_ai_usage_logs_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_ai_usage_logs_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;
GO

-- backend/src/routes/report.routes.ts (GET/POST /reports/scheduled, DELETE /reports/scheduled/:id)
IF OBJECT_ID('dbo.scheduled_reports', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.scheduled_reports (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    report_type NVARCHAR(50) NOT NULL,
    frequency NVARCHAR(20) NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
    format NVARCHAR(20) NOT NULL CHECK (format IN ('csv','excel','pdf')),
    recipients NVARCHAR(MAX) NOT NULL CHECK (ISJSON(recipients) = 1),
    filters NVARCHAR(MAX) NULL CHECK (filters IS NULL OR ISJSON(filters) = 1),
    created_by BIGINT NOT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_scheduled_reports_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_scheduled_reports_user FOREIGN KEY (created_by) REFERENCES dbo.users(id)
  );
END;
GO

-- backend/src/routes/blog.routes.ts -- categories/tags/tagging/comments were never created;
-- the generic categories/tags tables that do exist are used by assignment.routes.ts instead.
IF OBJECT_ID('dbo.blog_categories', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.blog_categories (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name NVARCHAR(255) NOT NULL,
    slug NVARCHAR(255) NOT NULL,
    CONSTRAINT fk_blog_categories_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT uq_blog_categories_tenant_slug UNIQUE (tenant_id, slug)
  );
END;
GO

IF OBJECT_ID('dbo.blog_tags', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.blog_tags (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name NVARCHAR(255) NOT NULL,
    slug NVARCHAR(255) NOT NULL,
    CONSTRAINT fk_blog_tags_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT uq_blog_tags_tenant_slug UNIQUE (tenant_id, slug)
  );
END;
GO

IF OBJECT_ID('dbo.blog_post_tags', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.blog_post_tags (
    post_id BIGINT NOT NULL,
    tag_id BIGINT NOT NULL,
    CONSTRAINT pk_blog_post_tags PRIMARY KEY (post_id, tag_id),
    CONSTRAINT fk_blog_post_tags_post FOREIGN KEY (post_id) REFERENCES dbo.blog_posts(id),
    CONSTRAINT fk_blog_post_tags_tag FOREIGN KEY (tag_id) REFERENCES dbo.blog_tags(id)
  );
END;
GO

IF OBJECT_ID('dbo.blog_comments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.blog_comments (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    body NVARCHAR(MAX) NOT NULL,
    parent_id BIGINT NULL,
    deleted_at DATETIME2(0) NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_blog_comments_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_blog_comments_post FOREIGN KEY (post_id) REFERENCES dbo.blog_posts(id),
    CONSTRAINT fk_blog_comments_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT fk_blog_comments_parent FOREIGN KEY (parent_id) REFERENCES dbo.blog_comments(id)
  );
END;
GO

IF COL_LENGTH('dbo.blog_posts', 'category_id') IS NULL
BEGIN
  ALTER TABLE dbo.blog_posts ADD category_id BIGINT NULL;
  ALTER TABLE dbo.blog_posts ADD CONSTRAINT fk_blog_posts_category FOREIGN KEY (category_id) REFERENCES dbo.blog_categories(id);
END;
GO

IF COL_LENGTH('dbo.blog_posts', 'slug') IS NULL
BEGIN
  ALTER TABLE dbo.blog_posts ADD slug NVARCHAR(255) NULL;
END;
GO

IF COL_LENGTH('dbo.blog_posts', 'featured_image_id') IS NULL
BEGIN
  ALTER TABLE dbo.blog_posts ADD featured_image_id BIGINT NULL;
  ALTER TABLE dbo.blog_posts ADD CONSTRAINT fk_blog_posts_featured_image FOREIGN KEY (featured_image_id) REFERENCES dbo.file_assets(id);
END;
GO

IF COL_LENGTH('dbo.blog_posts', 'view_count') IS NULL
BEGIN
  ALTER TABLE dbo.blog_posts ADD view_count INT NOT NULL DEFAULT 0;
END;
GO

IF COL_LENGTH('dbo.blog_posts', 'updated_at') IS NULL
BEGIN
  ALTER TABLE dbo.blog_posts ADD updated_at DATETIME2(0) NULL;
END;
GO

-- backend/src/routes/notification.routes.ts + services/notification.service.ts (web push)
IF OBJECT_ID('dbo.push_subscriptions', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.push_subscriptions (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    endpoint NVARCHAR(1000) NOT NULL,
    p256dh NVARCHAR(255) NOT NULL,
    auth NVARCHAR(255) NOT NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(0) NULL,
    CONSTRAINT fk_push_subscriptions_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;
GO

-- backend/src/services/notification.service.ts (mobile push via FCM token)
IF OBJECT_ID('dbo.user_devices', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_devices (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    fcm_token NVARCHAR(500) NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_user_devices_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;
GO

-- backend/src/routes/ai.routes.ts (AI tutor reads interests/learning_goals for context;
-- nothing currently writes to this table -- left empty is a valid, harmless state)
IF OBJECT_ID('dbo.user_profiles', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.user_profiles (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    interests NVARCHAR(MAX) NULL,
    learning_goals NVARCHAR(MAX) NULL,
    CONSTRAINT fk_user_profiles_user FOREIGN KEY (user_id) REFERENCES dbo.users(id),
    CONSTRAINT uq_user_profiles_user UNIQUE (user_id)
  );
END;
GO

-- backend/src/routes/search.routes.ts (POST /search/log, GET /search/recent)
IF OBJECT_ID('dbo.search_history', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.search_history (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    query NVARCHAR(500) NOT NULL,
    result_count INT NOT NULL DEFAULT 0,
    searched_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_search_history_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_search_history_user FOREIGN KEY (user_id) REFERENCES dbo.users(id)
  );
END;
GO

-- backend/src/routes/webhook.routes.ts -- a differently-shaped, unrelated table
-- (webhook_subscriptions: one row per single event) already exists but nothing reads
-- or writes it; this is the table the actual route code needs (one row per endpoint,
-- multiple events, delivery history). Left webhook_subscriptions in place rather than
-- guessing it's safe to drop.
IF OBJECT_ID('dbo.webhooks', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.webhooks (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    name NVARCHAR(255) NOT NULL,
    url NVARCHAR(1000) NOT NULL,
    events NVARCHAR(MAX) NOT NULL CHECK (ISJSON(events) = 1),
    secret NVARCHAR(255) NOT NULL,
    headers NVARCHAR(MAX) NULL CHECK (headers IS NULL OR ISJSON(headers) = 1),
    created_by BIGINT NOT NULL,
    is_active BIT NOT NULL DEFAULT 1,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2(0) NULL,
    last_triggered_at DATETIME2(0) NULL,
    CONSTRAINT fk_webhooks_tenant FOREIGN KEY (tenant_id) REFERENCES dbo.tenants(id),
    CONSTRAINT fk_webhooks_user FOREIGN KEY (created_by) REFERENCES dbo.users(id)
  );
END;
GO

IF OBJECT_ID('dbo.webhook_deliveries', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.webhook_deliveries (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    webhook_id BIGINT NOT NULL,
    event NVARCHAR(100) NOT NULL,
    payload NVARCHAR(MAX) NOT NULL,
    response_status INT NULL,
    response_body NVARCHAR(1000) NULL,
    response_time_ms INT NULL,
    success BIT NOT NULL,
    error_message NVARCHAR(1000) NULL,
    created_at DATETIME2(0) NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT fk_webhook_deliveries_webhook FOREIGN KEY (webhook_id) REFERENCES dbo.webhooks(id)
  );
END;
GO
