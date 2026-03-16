import { OidcConfigService } from '../oidc-config.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockConfigService(
  values: Record<string, string | undefined> = {},
) {
  return {
    get: jest.fn((key: string) => values[key]),
  };
}

const FULL_OIDC_CONFIG = {
  OIDC_ENABLED: 'true',
  OIDC_ISSUER_URL: 'https://auth.example.com',
  OIDC_CLIENT_ID: 'my-client-id',
  OIDC_CLIENT_SECRET: 'my-client-secret',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OidcConfigService', () => {
  // -------------------------------------------------------------------------
  // isOidcEnabled
  // -------------------------------------------------------------------------
  describe('isOidcEnabled', () => {
    it('returns false when OIDC_ENABLED is not set', () => {
      const configService = createMockConfigService({});
      const service = new OidcConfigService(configService as any);

      expect(service.isOidcEnabled()).toBe(false);
    });

    it('returns false when OIDC_ENABLED is not "true"', () => {
      const configService = createMockConfigService({
        OIDC_ENABLED: 'false',
      });
      const service = new OidcConfigService(configService as any);

      expect(service.isOidcEnabled()).toBe(false);
    });

    it('returns false when OIDC_ENABLED is "true" but issuerUrl is missing', () => {
      const configService = createMockConfigService({
        OIDC_ENABLED: 'true',
        OIDC_CLIENT_ID: 'my-client-id',
        OIDC_CLIENT_SECRET: 'my-client-secret',
      });
      const service = new OidcConfigService(configService as any);

      expect(service.isOidcEnabled()).toBe(false);
    });

    it('returns false when OIDC_ENABLED is "true" but clientId is missing', () => {
      const configService = createMockConfigService({
        OIDC_ENABLED: 'true',
        OIDC_ISSUER_URL: 'https://auth.example.com',
        OIDC_CLIENT_SECRET: 'my-client-secret',
      });
      const service = new OidcConfigService(configService as any);

      expect(service.isOidcEnabled()).toBe(false);
    });

    it('returns false when OIDC_ENABLED is "true" but clientSecret is missing', () => {
      const configService = createMockConfigService({
        OIDC_ENABLED: 'true',
        OIDC_ISSUER_URL: 'https://auth.example.com',
        OIDC_CLIENT_ID: 'my-client-id',
      });
      const service = new OidcConfigService(configService as any);

      expect(service.isOidcEnabled()).toBe(false);
    });

    it('returns true when all OIDC config values are present', () => {
      const configService = createMockConfigService(FULL_OIDC_CONFIG);
      const service = new OidcConfigService(configService as any);

      expect(service.isOidcEnabled()).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // getOidcConfig
  // -------------------------------------------------------------------------
  describe('getOidcConfig', () => {
    it('returns null when OIDC is disabled', () => {
      const configService = createMockConfigService({});
      const service = new OidcConfigService(configService as any);

      expect(service.getOidcConfig()).toBeNull();
    });

    it('returns full config object when OIDC is enabled', () => {
      const configService = createMockConfigService(FULL_OIDC_CONFIG);
      const service = new OidcConfigService(configService as any);

      expect(service.getOidcConfig()).toEqual({
        enabled: true,
        issuerUrl: 'https://auth.example.com',
        clientId: 'my-client-id',
        clientSecret: 'my-client-secret',
      });
    });
  });

  // -------------------------------------------------------------------------
  // getIssuerUrl
  // -------------------------------------------------------------------------
  describe('getIssuerUrl', () => {
    it('returns null when OIDC is disabled', () => {
      const configService = createMockConfigService({});
      const service = new OidcConfigService(configService as any);

      expect(service.getIssuerUrl()).toBeNull();
    });

    it('returns the issuer URL when OIDC is enabled', () => {
      const configService = createMockConfigService(FULL_OIDC_CONFIG);
      const service = new OidcConfigService(configService as any);

      expect(service.getIssuerUrl()).toBe('https://auth.example.com');
    });
  });
});
