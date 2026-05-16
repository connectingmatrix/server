import { accessSync, constants, mkdirSync } from 'node:fs';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { EnvLoader } from '@giga/shared/lib/env';
import { SHARED_SPACE_ROOT } from '@giga/general/services/shared-space/constants';

export async function assertExternalReadiness() {
  const neo = await TreeGraphEntity.getNeo();
  await neo.run('RETURN 1 AS ok');
  const sharedRoot = SHARED_SPACE_ROOT();
  mkdirSync(sharedRoot, { recursive: true });
  accessSync(sharedRoot, constants.R_OK);
  accessSync(sharedRoot, constants.W_OK);
  const { Kafka } = await import('kafkajs');
  const brokers = String(EnvLoader.get('WORKFLOW_QUEUE_BROKERS') || '')
    .split(',')
    .filter(Boolean);
  if (!brokers.length) throw new Error('WORKFLOW_QUEUE_BROKERS is required.');
  const username = String(EnvLoader.get('WORKFLOW_QUEUE_USERNAME') || '');
  const password = String(EnvLoader.get('WORKFLOW_QUEUE_PASSWORD') || '');
  const kafka = new Kafka({
    brokers,
    clientId: `graphql-e2e-${Date.now()}`,
    sasl: username ? { mechanism: 'scram-sha-256' as const, username, password } : undefined,
    ssl: EnvLoader.get('WORKFLOW_QUEUE_SSL') === 'true',
  });
  const admin = kafka.admin();
  await admin.connect();
  await admin.disconnect();
}
