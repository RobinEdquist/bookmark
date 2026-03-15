/**
 * Playwright global teardown — stops all servers and containers.
 */

export default async function globalTeardown() {
  console.log('\n🧹 Playwright Teardown');

  if (global.__PW_FRONTEND_PROCESS__) {
    console.log('  Stopping frontend server...');
    global.__PW_FRONTEND_PROCESS__.kill();
  }

  if (global.__PW_BACKEND_PROCESS__) {
    console.log('  Stopping backend server...');
    global.__PW_BACKEND_PROCESS__.kill();
  }

  if (global.__PW_POSTGRES_CONTAINER__) {
    console.log('  Stopping PostgreSQL container...');
    await global.__PW_POSTGRES_CONTAINER__.stop();
  }

  console.log('  ✅ Teardown complete\n');
}
