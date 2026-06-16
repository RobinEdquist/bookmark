import { Logger } from '@nestjs/common';

/**
 * Silence NestJS logger output during unit tests.
 *
 * Many service tests deliberately exercise error paths with mocked HTTP
 * clients — e.g. simulated 429/500 responses or `ECONNREFUSED` rejections.
 * These are expected and asserted on via return values, not log calls, but
 * the services still log them, flooding the test output with scary-looking
 * ERROR/DEBUG lines (AudnexusService, MamClientService, etc.). No real
 * network requests are made; `fetch` is mocked in those suites.
 *
 * Passing an empty log-level array sets the levels on the shared console
 * logger, suppressing all instance logging. This is not undone by
 * `jest.restoreAllMocks()`, so it stays in effect for the whole run.
 */
Logger.overrideLogger([]);
