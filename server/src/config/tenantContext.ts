import { AsyncLocalStorage } from 'async_hooks';
import type { PoolClient } from 'pg';

interface TenantStore {
  gymId: string;
  /**
   * The single Postgres connection checked out for the lifetime of the
   * current HTTP request (see middleware/tenant.ts). Every query() /
   * getClient() call during this request must reuse THIS client — never a
   * fresh one from the pool — otherwise `SET ... app.gym_id` and the actual
   * data query can land on two different physical connections, silently
   * defeating Row Level Security. See config/database.ts for how this is
   * consumed.
   */
  client?: PoolClient;
}

const tenantStorage = new AsyncLocalStorage<TenantStore>();

export function runWithTenant<T>(gymId: string, fn: () => T): T {
  return tenantStorage.run({ gymId }, fn);
}

export function setTenantGymId(gymId: string): void {
  const store = tenantStorage.getStore();
  if (store) {
    store.gymId = gymId;
  }
}

export function getTenantGymId(): string | null {
  const store = tenantStorage.getStore();
  return store?.gymId || null;
}

export function setTenantClient(client: PoolClient): void {
  const store = tenantStorage.getStore();
  if (store) {
    store.client = client;
  }
}

export function getTenantClient(): PoolClient | undefined {
  return tenantStorage.getStore()?.client;
}

export { tenantStorage };
