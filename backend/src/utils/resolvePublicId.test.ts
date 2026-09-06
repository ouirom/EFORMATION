import { resolveEntityId } from './resolvePublicId';
import { DatabaseService } from '../services/database.service';

jest.mock('../services/database.service');

const mockedQuery = DatabaseService.query as jest.Mock;

describe('resolveEntityId', () => {
  afterEach(() => {
    mockedQuery.mockReset();
  });

  it('resolves a UUID public_id to its numeric id', async () => {
    mockedQuery.mockResolvedValue([{ id: 42 }]);

    const result = await resolveEntityId('courses', '3fa85f64-5717-4562-b3fc-2c963f66afa6', 10);

    expect(result).toBe(42);
    expect(mockedQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM courses WHERE public_id'),
      { raw: '3fa85f64-5717-4562-b3fc-2c963f66afa6', tenantId: 10 }
    );
  });

  it('accepts a legacy plain numeric id without querying the database', async () => {
    const result = await resolveEntityId('lessons', '17', 10);

    expect(result).toBe(17);
    expect(mockedQuery).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the UUID does not match any row for this tenant', async () => {
    mockedQuery.mockResolvedValue([]);

    await expect(resolveEntityId('courses', '3fa85f64-5717-4562-b3fc-2c963f66afa6', 10))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws NotFoundError for a non-numeric, non-UUID string', async () => {
    await expect(resolveEntityId('lessons', 'not-a-valid-id', 10))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(mockedQuery).not.toHaveBeenCalled();
  });
});
