#!/usr/bin/env zx

import 'zx/globals';

class Server {
  constructor() {
    this.childPromise = null;
  }

  async isDown() {
    try {
      await fetch('http://localhost:3000', { method: 'HEAD' });
      return false;
    } catch (e) {
      if (e.code === 'ECONNREFUSED') {
        return true;
      }

      throw e;
    }
  }

  async isUp() {
    return !(await this.isDown());
  }

  async start() {
    if (await this.isUp()) {
      return;
    }

    this.childPromise = $`docusaurus serve --no-open`;

    await new Promise((resolve, reject) => {
      const handle = setTimeout(() => {
        reject(new Error('Server timed out'));
      }, 20000).unref();

      this.childPromise.stdout.on('data', (data) => {
        if (`${data}`.startsWith('[SUCCESS] Serving')) {
          clearTimeout(handle);
          resolve();
        }
      });
    });

    if (await this.isDown()) {
      throw new Error('Server is not available after start')
    }
  }

  async stop() {
    if (!this.childPromise) {
      return;
    }

    if (typeof this.childPromise.exitCode === 'number') {
      return;
    }

    this.childPromise.catch((e) => {
      if (e.signal !== 'SIGTERM') {
        throw e;
      }
    });

    await this.childPromise.kill('SIGTERM');
  }
}

async function runPercySnapshot() {
  const { stdout } = await $`percy snapshot snapshots.yml`;
  const [, buildId] = stdout.match(/Finalized build #(\d+):/m) || [];
  return buildId || '';
}

const server = new Server();
try {
  await server.start();
  const buildId = await runPercySnapshot();
  try {
    await $`percy build:wait --fail-on-changes --build ${buildId}`;
  } catch (e) {
    console.error('@noomorph says: This is a known issue. I contacted already their support team.');
  }
} finally {
  await server.stop();
}

