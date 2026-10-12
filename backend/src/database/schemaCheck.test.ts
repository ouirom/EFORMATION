import { findMissingMigrations } from './schemaCheck';
import { DatabaseService } from '../services/database.service';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

describe('findMissingMigrations', () => {
  it('reports a migration whose column is missing', async () => {
    mockedQuery.mockResolvedValue([{ n: 0 }]);
    expect(await findMissingMigrations()).toEqual(['034_tenant_course_categories', '035_tenant_security_settings', '036_tenant_sso_settings', '037_tenant_learning_settings', '038_subsidiaries', '040_external_users', '041_tenant_external_theme', '042_user_sessions', '043_two_factor', '044_login_alerts', '045_single_session', '046_tenant_sidebar_color']);
  });

  it('reports nothing once the column exists (pg returns counts as strings without the int8 parser)', async () => {
    mockedQuery.mockResolvedValue([{ n: '1' }]);
    expect(await findMissingMigrations()).toEqual([]);
  });
});
