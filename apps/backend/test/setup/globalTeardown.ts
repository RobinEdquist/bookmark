export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up...');

  // Stop backend server
  if (global.__BACKEND_PROCESS__) {
    console.log('  Stopping backend server...');
    global.__BACKEND_PROCESS__.kill();
  }

  // Stop PostgreSQL container
  if (global.__POSTGRES_CONTAINER__) {
    console.log('  Stopping PostgreSQL container...');
    await global.__POSTGRES_CONTAINER__.stop();
  }

  console.log('✅ Cleanup complete\n');
}
