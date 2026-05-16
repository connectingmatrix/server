import { Executor } from '@workflow/executor';
import '@connectingmatrix/workflows/services/workflow/runtime/setupWorkflowExecutor';
import type { Server } from 'http';

let isStopping = false;

export const registerShutdown = (server: Server) => {
  const shutdown = async (signal: NodeJS.Signals) => {
    if (isStopping) return;
    isStopping = true;
    server.close();
    try {
      await Executor.stop();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to stop workflow queue services.', error);
    }
    if (signal === 'SIGUSR2') {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(0);
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.once('SIGUSR2', () => {
    void shutdown('SIGUSR2');
  });
};
