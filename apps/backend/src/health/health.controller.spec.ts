jest.mock('@thallesp/nestjs-better-auth', () => ({
  AllowAnonymous: () => () => undefined,
}));

import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns an ok health response with an ISO timestamp', () => {
    const controller = new HealthController();

    const result = controller.health();

    expect(result.status).toBe('ok');
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });
});
