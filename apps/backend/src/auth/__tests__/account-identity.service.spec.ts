import { PgDialect } from 'drizzle-orm/pg-core';
import { AccountIdentityService } from '../account-identity.service';

const dialect = new PgDialect();

function sqlText(query: unknown): string {
  return dialect.sqlToQuery(query as never).sql;
}

function createDb(rows: Array<Record<string, unknown>> = []) {
  const execute = jest.fn().mockResolvedValue({ rows, rowCount: rows.length });
  const service = new AccountIdentityService({ execute } as never);
  return { service, execute };
}

describe('AccountIdentityService', () => {
  it('does not rewrite issuer and accepts a database with unique account keys', async () => {
    const { service, execute } = createDb();

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(execute).toHaveBeenCalledTimes(1);
    const statement = sqlText(execute.mock.calls[0][0]);
    expect(statement).toContain('GROUP BY provider_id, account_id');
    expect(statement).toContain('HAVING count(*) > 1');
    expect(statement.toLowerCase()).not.toContain('update');
    expect(statement).not.toContain('local:credential');
  });

  it('fails startup when two rows share a provider id and account id', async () => {
    const { service } = createDb([
      { provider_id: 'oidc', account_id: 'subject-1', n: 2 },
    ]);

    await expect(service.onModuleInit()).rejects.toThrow(
      /oidc\/subject-1 \(2\)/,
    );
  });
});
