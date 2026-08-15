import type { ChildProcess } from 'child_process';

async function stopProcess(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null) return;

  await new Promise<void>((resolve) => {
    const forceKillTimer = setTimeout(() => {
      if (process.exitCode === null && process.signalCode === null) {
        process.kill('SIGKILL');
      }
    }, 10_000);

    process.once('exit', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    process.kill('SIGTERM');
  });
}

export default async function globalTeardown() {
  console.log('\n🧹 Cleaning up...');

  // Stop backend server
  if (global.__BACKEND_PROCESS__) {
    console.log('  Stopping backend server...');
    await stopProcess(global.__BACKEND_PROCESS__);
  }

  // Stop PostgreSQL container
  if (global.__POSTGRES_CONTAINER__) {
    console.log('  Stopping PostgreSQL container...');
    await global.__POSTGRES_CONTAINER__.stop();
  }

  console.log('✅ Cleanup complete\n');
}
