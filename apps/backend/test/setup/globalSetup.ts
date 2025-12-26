import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { spawnSync, spawn, ChildProcess } from 'child_process';
import { resolve } from 'path';

declare global {
  // eslint-disable-next-line no-var
  var __POSTGRES_CONTAINER__: StartedPostgreSqlContainer;
  // eslint-disable-next-line no-var
  var __BACKEND_PROCESS__: ChildProcess;
}

export default async function globalSetup() {
  console.log('\n🐘 Starting PostgreSQL container...');

  const container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('bookmark_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start();

  const connectionUri = container.getConnectionUri();
  console.log(`✅ PostgreSQL started at ${connectionUri}`);

  // Store container reference for teardown
  global.__POSTGRES_CONTAINER__ = container;

  // Set environment variables
  process.env.DATABASE_URL = connectionUri;
  process.env.NODE_ENV = 'test';
  process.env.BETTER_AUTH_SECRET = 'test-secret-for-ci-only';
  process.env.BETTER_AUTH_URL = 'http://localhost:3000';

  const backendDir = resolve(__dirname, '../..');

  // Run migrations
  console.log('\n📦 Running database migrations...');
  const migrateResult = spawnSync('npx', ['drizzle-kit', 'migrate'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: connectionUri },
    stdio: 'inherit',
  });

  if (migrateResult.status !== 0) {
    console.error('❌ Migration failed');
    await container.stop();
    throw new Error('Migration failed');
  }
  console.log('✅ Migrations completed');

  // Build the backend if not already built
  console.log('\n🔨 Ensuring backend is built...');
  const buildResult = spawnSync('pnpm', ['build'], {
    cwd: backendDir,
    env: process.env,
    stdio: 'inherit',
  });

  if (buildResult.status !== 0) {
    console.error('❌ Build failed');
    await container.stop();
    throw new Error('Build failed');
  }
  console.log('✅ Backend built');

  // Start the backend server
  console.log('\n🚀 Starting backend server...');
  const backendProcess = spawn('node', ['dist/main.js'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: connectionUri },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  global.__BACKEND_PROCESS__ = backendProcess;

  // Collect server output for debugging
  let serverOutput = '';
  let serverError = '';

  backendProcess.stdout?.on('data', (data) => {
    const text = data.toString();
    serverOutput += text;
    console.log('[backend]', text.trim());
  });

  backendProcess.stderr?.on('data', (data) => {
    const text = data.toString();
    serverError += text;
    console.error('[backend:error]', text.trim());
  });

  backendProcess.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[backend] Process exited with code ${code}`);
    }
  });

  // Wait for server to be ready
  const maxAttempts = 30;
  let attempts = 0;

  while (attempts < maxAttempts) {
    // Check if process has crashed
    if (backendProcess.exitCode !== null) {
      console.error('\n❌ Backend server crashed during startup');
      console.error('stdout:', serverOutput);
      console.error('stderr:', serverError);
      await container.stop();
      throw new Error(`Backend server crashed with exit code ${backendProcess.exitCode}`);
    }

    try {
      const response = await fetch('http://localhost:3000/api/health');
      if (response.ok) {
        console.log('✅ Backend server is ready\n');
        return;
      }
    } catch {
      // Server not ready yet
    }
    attempts++;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // If we get here, server failed to start - log collected output
  console.error('\n❌ Backend server failed to start within 30 seconds');
  console.error('Server stdout:', serverOutput || '(empty)');
  console.error('Server stderr:', serverError || '(empty)');
  backendProcess.kill();
  await container.stop();
  throw new Error('Backend server failed to start within 30 seconds');
}
