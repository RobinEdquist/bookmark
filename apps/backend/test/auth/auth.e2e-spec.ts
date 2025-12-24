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
