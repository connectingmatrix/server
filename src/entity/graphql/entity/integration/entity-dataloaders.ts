import * as Entities from '@connectingmatrix/orm/repositories/entities';

type EntityClass = {
  find?: (where?: Record<string, unknown>) => { many?: () => Promise<unknown[]> };
  load?: (id?: string) => Record<string, unknown> & { fetch?: () => Promise<unknown> };
  single?: (id: string | Record<string, unknown>) => Promise<unknown>;
};
type Loader<T> = { load: (key: string) => Promise<T | null>; loadMany: (keys: string[]) => Promise<Array<T | null>> };
const entities = Entities as unknown as Record<string, EntityClass>;
const text = (value: unknown): string => String(value ?? '').trim();
const entity = (name: string): EntityClass => entities[`${name}Entity`] || entities[name] || {};

const createSimpleLoader = <T>(batch: (keys: string[]) => Promise<Array<T | null>>): Loader<T> => {
  const cache = new Map<string, Promise<T | null>>();
  return {
    load: (key) => {
      if (!cache.has(key))
        cache.set(
          key,
          batch([key]).then((rows) => rows[0] || null),
        );
      return cache.get(key) as Promise<T | null>;
    },
    loadMany: (keys) => Promise.all(keys.map((key) => createSimpleLoader(batch).load(key))),
  };
};

export const createEntityGraphQLLoaders = () => {
  const byEntity = new Map<string, Loader<unknown>>();
  const relation = new Map<string, Loader<unknown[]>>();
  const entityLoader = (entityName: string): Loader<unknown> => {
    if (!byEntity.has(entityName)) {
      byEntity.set(
        entityName,
        createSimpleLoader(async (ids) =>
          Promise.all(ids.map(async (id) => entity(entityName).single?.(id) || entity(entityName).load?.(id)?.fetch?.() || null)),
        ),
      );
    }
    return byEntity.get(entityName) as Loader<unknown>;
  };
  const relationLoader = (entityName: string, relationName: string): Loader<unknown[]> => {
    const key = `${entityName}.${relationName}`;
    if (!relation.has(key)) {
      relation.set(
        key,
        createSimpleLoader(async (ids) =>
          Promise.all(
            ids.map(async (id) => {
              const parent = entity(entityName).load?.(id) as Record<string, unknown> | undefined;
              const manager = parent?.[relationName] as
                | { find?: (where?: Record<string, unknown>) => { many?: () => Promise<unknown[]> }; list?: () => Promise<unknown[]> }
                | undefined;
              return manager?.find?.({}).many?.() || manager?.list?.() || [];
            }),
          ),
        ),
      );
    }
    return relation.get(key) as Loader<unknown[]>;
  };
  return { entity: entityLoader, relation: relationLoader };
};

export const graphQLId = (parent: unknown): string =>
  text((parent as Record<string, unknown>)?.id || (parent as Record<string, unknown>)?.uuid || parent);
