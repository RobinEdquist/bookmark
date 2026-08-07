/**
 * Authentication Verification E2E Tests
 *
 * These tests verify that all protected endpoints return the appropriate
 * HTTP status code (401 or 403) when accessed without authentication.
 *
 * IMPORTANT: These tests require the backend server to be running.
 * Run with: TEST_BASE_URL=http://localhost:3000 pnpm test:e2e -- auth.e2e-spec.ts
 */

import {
  allProtectedEndpoints,
  opdsEndpoints,
  publicEndpoints,
  EndpointDefinition,
  ControllerEndpoints,
} from './endpoint-definitions';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api';
const OPENAPI_HTTP_METHODS: ReadonlySet<string> = new Set([
  'get',
  'post',
  'put',
  'patch',
  'delete',
  'options',
  'head',
  'trace',
]);

interface OpenApiOperation {
  security?: Record<string, unknown>[];
}

interface OpenApiDocument {
  paths: Record<string, Record<string, unknown>>;
}

function endpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function normalizeOpenApiPath(path: string): string {
  const withoutGlobalPrefix = path.replace(/^\/api(?=\/|$)/, '') || '/';
  return withoutGlobalPrefix.replace(/\{([^}]+)\}/g, ':$1');
}

function isBasicAuthOnly(operation: OpenApiOperation): boolean {
  const securitySchemeNames = (operation.security ?? []).flatMap(
    (requirement) => Object.keys(requirement),
  );

  return (
    securitySchemeNames.length > 0 &&
    securitySchemeNames.every((name) => name === 'basic')
  );
}

function getOpenApiEndpointKeys(document: OpenApiDocument): {
  protectedEndpointKeys: string[];
  basicAuthEndpointKeys: string[];
} {
  const publicEndpointKeys = new Set(
    publicEndpoints.map((endpoint) =>
      endpointKey(endpoint.method, endpoint.path),
    ),
  );
  const protectedEndpointKeys: string[] = [];
  const basicAuthEndpointKeys: string[] = [];

  for (const [openApiPath, pathItem] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!OPENAPI_HTTP_METHODS.has(method)) {
        continue;
      }

      const key = endpointKey(method, normalizeOpenApiPath(openApiPath));
      if (publicEndpointKeys.has(key)) {
        continue;
      }

      if (isBasicAuthOnly(operation as OpenApiOperation)) {
        basicAuthEndpointKeys.push(key);
      } else {
        protectedEndpointKeys.push(key);
      }
    }
  }

  return {
    protectedEndpointKeys: protectedEndpointKeys.sort(),
    basicAuthEndpointKeys: basicAuthEndpointKeys.sort(),
  };
}

/**
 * Check if the backend server is running before tests
 */
beforeAll(async () => {
  try {
    const response = await fetch(`${BASE_URL}/health`);
    if (!response.ok) {
      throw new Error(`Health check returned ${response.status}`);
    }
  } catch {
    console.error(
      '\n\x1b[31m' +
        '='.repeat(60) +
        '\n' +
        'ERROR: Backend server is not running!\n' +
        '='.repeat(60) +
        '\x1b[0m\n' +
        `\nPlease start the backend server before running these tests:\n` +
        `  cd apps/backend && pnpm dev\n` +
        `\nOr specify a different URL:\n` +
        `  TEST_BASE_URL=http://localhost:3000 pnpm test:e2e -- auth.e2e-spec.ts\n`,
    );
    throw new Error(`Backend server not running at ${BASE_URL}`);
  }
}, 10000);

/**
 * Helper function to make HTTP requests
 */
async function makeRequest(endpoint: EndpointDefinition): Promise<Response> {
  const testPath = endpoint.path.replace(/:(\w+)/g, 'test-uuid');
  const url = `${BASE_URL}${testPath}`;

  const options: RequestInit = {
    method: endpoint.method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (endpoint.body && ['POST', 'PATCH', 'PUT'].includes(endpoint.method)) {
    options.body = JSON.stringify(endpoint.body);
  }

  return fetch(url, options);
}

describe('Authentication Verification (e2e)', () => {
  /**
   * Keep the opt-in request registry synchronized with the app's route table.
   * CombinedAuthGuard protects every route by default, so an OpenAPI operation
   * is protected unless it is explicitly registered as public or uses only
   * OPDS Basic authentication. Both protected registries are checked here.
   */
  describe('Endpoint Registry Coverage', () => {
    it('registers every protected OpenAPI operation exactly once', async () => {
      const response = await fetch(`${BASE_URL}/docs-json`);
      expect(response.ok).toBe(true);

      const document = (await response.json()) as OpenApiDocument;
      const {
        protectedEndpointKeys: documentedProtectedEndpointKeys,
        basicAuthEndpointKeys: documentedBasicAuthEndpointKeys,
      } = getOpenApiEndpointKeys(document);
      const registeredEndpointKeys = allProtectedEndpoints.flatMap(
        ({ endpoints }) =>
          endpoints.map((endpoint) =>
            endpointKey(endpoint.method, endpoint.path),
          ),
      );
      const registeredBasicAuthEndpointKeys = opdsEndpoints.flatMap(
        ({ endpoints }) =>
          endpoints.map((endpoint) =>
            endpointKey(endpoint.method, endpoint.path),
          ),
      );
      const allRegisteredEndpointKeys = [
        ...registeredEndpointKeys,
        ...registeredBasicAuthEndpointKeys,
        ...publicEndpoints.map((endpoint) =>
          endpointKey(endpoint.method, endpoint.path),
        ),
      ];
      const registeredEndpointKeySet = new Set(registeredEndpointKeys);
      const registeredBasicAuthEndpointKeySet = new Set(
        registeredBasicAuthEndpointKeys,
      );
      const documentedProtectedEndpointKeySet = new Set(
        documentedProtectedEndpointKeys,
      );
      const documentedBasicAuthEndpointKeySet = new Set(
        documentedBasicAuthEndpointKeys,
      );
      const duplicateRegistrations = allRegisteredEndpointKeys
        .filter(
          (key, index) => allRegisteredEndpointKeys.indexOf(key) !== index,
        )
        .filter((key, index, keys) => keys.indexOf(key) === index)
        .sort();
      const unregisteredProtectedEndpoints =
        documentedProtectedEndpointKeys.filter(
          (key) => !registeredEndpointKeySet.has(key),
        );
      const unregisteredBasicAuthEndpoints =
        documentedBasicAuthEndpointKeys.filter(
          (key) => !registeredBasicAuthEndpointKeySet.has(key),
        );
      const registeredButUndocumentedProtectedEndpoints = [
        ...registeredEndpointKeySet,
      ]
        .filter((key) => !documentedProtectedEndpointKeySet.has(key))
        .sort();
      const registeredButUndocumentedBasicAuthEndpoints = [
        ...registeredBasicAuthEndpointKeySet,
      ]
        .filter((key) => !documentedBasicAuthEndpointKeySet.has(key))
        .sort();

      expect({
        duplicateRegistrations,
        unregisteredProtectedEndpoints,
        unregisteredBasicAuthEndpoints,
        registeredButUndocumentedProtectedEndpoints,
        registeredButUndocumentedBasicAuthEndpoints,
      }).toEqual({
        duplicateRegistrations: [],
        unregisteredProtectedEndpoints: [],
        unregisteredBasicAuthEndpoints: [],
        registeredButUndocumentedProtectedEndpoints: [],
        registeredButUndocumentedBasicAuthEndpoints: [],
      });
    });
  });

  /**
   * Test all protected endpoints
   */
  describe('Protected Endpoints', () => {
    describe.each(allProtectedEndpoints)(
      '$controller Controller',
      ({ endpoints }: ControllerEndpoints) => {
        it.each(endpoints)(
          `$method $path should return $expectedStatus without auth`,
          async (endpoint: EndpointDefinition) => {
            const response = await makeRequest(endpoint);
            expect(response.status).toBe(endpoint.expectedStatus);
          },
        );
      },
    );
  });

  /**
   * Test OPDS endpoints (may return 404 if OPDS is disabled)
   * Note: OPDS uses Basic Auth, but global auth middleware runs first
   * so unauthenticated requests get 401 from global auth (not OpdsAuthGuard)
   */
  describe('OPDS Endpoints (Basic Auth)', () => {
    describe.each(opdsEndpoints)(
      '$controller Controller',
      ({ endpoints }: ControllerEndpoints) => {
        it.each(endpoints)(
          `$method $path should return 401 or 404 without auth`,
          async (endpoint: EndpointDefinition) => {
            const response = await makeRequest(endpoint);
            // OPDS may be disabled (404) or require auth (401)
            expect([401, 404]).toContain(response.status);
          },
        );
      },
    );
  });

  /**
   * Test public endpoints are accessible without auth
   */
  describe('Public Endpoints', () => {
    it.each(publicEndpoints)(
      '$method $path should NOT return 401 or 403',
      async (endpoint: EndpointDefinition) => {
        const response = await makeRequest(endpoint);
        expect(response.status).not.toBe(401);
        expect(response.status).not.toBe(403);
      },
    );
  });
});
