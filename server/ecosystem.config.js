module.exports = {
  apps: [
    {
      name: 'gymcore-backend',
      script: './src/app.ts',
      interpreter: 'ts-node-dev',
      interpreterArgs: '--respawn --transpile-only',
      watch: ['src'],
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
        WS_PORT: 4001,
      },
      max_memory_restart: '1G',
      instances: 1,
      exec_mode: 'fork',
      wait_ready: false,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
