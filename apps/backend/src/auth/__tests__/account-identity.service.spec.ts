import { PgDialect } from 'drizzle-orm/pg-core';
import {
  AccountIdentityService,
  loadAccountIdentityCollapseSql,
} from '../account-identity.service';

const dialect = new PgDialect();

function sqlText(query: unknown): string {
  return dialect.sqlToQuery(query as never).sql;
}

describe('AccountIdentityService', () => {
  it('collapses duplicate sign-ins instead of asking an operator to edit the database', async () => {
    const execute = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    const service = new AccountIdentityService({ execute } as never);

    await expect(service.onModuleInit()).resolves.toBeUndefined();

    expect(execute).toHaveBeenCalledTimes(1);
    const statement = sqlText(execute.mock.calls[0][0]);
    expect(statement).toContain('DELETE FROM account');
    expect(statement).toContain('ORDER BY created_at ASC, id ASC');
    expect(statement).toContain('DELETE FROM "user"');
    expect(statement.toLowerCase()).not.toContain('resolve them');
    expect(statement.toLowerCase()).not.toContain('by hand');
    expect(statement).not.toContain('local:credential');
    expect(statement).not.toMatch(/SET issuer/i);
  });
});

describe('loadAccountIdentityCollapseSql', () => {
  it('reads the collapse statement from migration 0037', () => {
    const statement = loadAccountIdentityCollapseSql();

    expect(statement.startsWith('DO $collapse$')).toBe(true);
    expect(statement.endsWith('$collapse$;')).toBe(true);
  });
});
