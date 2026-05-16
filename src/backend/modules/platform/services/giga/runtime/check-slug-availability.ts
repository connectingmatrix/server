import { invariant } from '@giga/shared/lib/helper';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import {
  CheckSlugAvailabilityInput,
  CheckSlugAvailabilityPayload,
  GRAPH_LABELS,
  GRAPH_SYSTEM_IDS,
  GraphEntityTypeToken,
  RESOURCE_TYPES,
  ResourceType,
  SLUG_SCOPES,
} from '@giga/shared/types/contracts/graph.types';

function toResourceType(label: GraphEntityTypeToken): ResourceType {
  if (label === GRAPH_LABELS.channel) return RESOURCE_TYPES.channel;
  if (label === GRAPH_LABELS.category) return RESOURCE_TYPES.category;
  return RESOURCE_TYPES.subject;
}

export async function checkSlugAvailability(input: CheckSlugAvailabilityInput): Promise<CheckSlugAvailabilityPayload> {
  const slug = input.slug.trim();
  invariant(Boolean(slug), 'slug is required.');

  if (input.scope === SLUG_SCOPES.user) {
    invariant(Boolean(input.createdBy), 'createdBy is required for USER slug scope.');
  }
  if (input.scope === SLUG_SCOPES.organization) {
    invariant(Boolean(input.organizationId), 'organizationId is required for ORGANIZATION slug scope.');
  }

  const neo = await TreeGraphEntity.getNeo();
  const rows = await neo.run<{
    id: string;
    labels: string[];
    slug: string;
    createdBy?: string | null;
    organizationId?: string | null;
    isGlobal?: boolean | null;
  }>(
    `
      CALL {
        MATCH (node:${GRAPH_LABELS.channel} {slug: $slug})
        WHERE (
            ($scope = $userScope AND node.createdBy = $createdBy AND coalesce(node.organizationId, '') = '')
            OR ($scope = $organizationScope AND node.organizationId = $organizationId)
            OR ($scope = $globalScope AND (coalesce(node.isGlobal, false) = true OR node.createdBy = $globalOwnerId))
          )
          AND ($excludeId IS NULL OR node.id <> $excludeId)
        RETURN node
        UNION ALL
        MATCH (node:${GRAPH_LABELS.category} {slug: $slug})
        WHERE (
            ($scope = $userScope AND node.createdBy = $createdBy AND coalesce(node.organizationId, '') = '')
            OR ($scope = $organizationScope AND node.organizationId = $organizationId)
            OR ($scope = $globalScope AND (coalesce(node.isGlobal, false) = true OR node.createdBy = $globalOwnerId))
          )
          AND ($excludeId IS NULL OR node.id <> $excludeId)
        RETURN node
        UNION ALL
        MATCH (node:${GRAPH_LABELS.subjectRef} {slug: $slug})
        WHERE (
            ($scope = $userScope AND node.createdBy = $createdBy AND coalesce(node.organizationId, '') = '')
            OR ($scope = $organizationScope AND node.organizationId = $organizationId)
            OR ($scope = $globalScope AND (coalesce(node.isGlobal, false) = true OR node.createdBy = $globalOwnerId))
          )
          AND ($excludeId IS NULL OR node.id <> $excludeId)
        RETURN node
      }
      RETURN
        node.id AS id,
        labels(node) AS labels,
        node.slug AS slug,
        node.createdBy AS createdBy,
        node.organizationId AS organizationId,
        coalesce(node.isGlobal, false) AS isGlobal
      LIMIT 1
    `,
    {
      slug,
      scope: input.scope,
      userScope: SLUG_SCOPES.user,
      organizationScope: SLUG_SCOPES.organization,
      globalScope: SLUG_SCOPES.global,
      createdBy: input.createdBy ?? null,
      organizationId: input.organizationId ?? null,
      globalOwnerId: GRAPH_SYSTEM_IDS.userGlobal,
      excludeId: input.excludeId ?? null,
    },
  );

  const hit = rows[0];
  if (!hit) {
    return {
      exists: false,
      slug,
      scope: input.scope,
      conflict: null,
    };
  }

  const label = hit.labels.find((value) => value === GRAPH_LABELS.channel || value === GRAPH_LABELS.category || value === GRAPH_LABELS.subjectRef) as
    | GraphEntityTypeToken
    | undefined;
  invariant(Boolean(label), `Unknown graph label for slug conflict id=${hit.id}`);

  return {
    exists: true,
    slug,
    scope: input.scope,
    conflict: {
      id: hit.id,
      slug: hit.slug,
      resourceType: toResourceType(label),
      label,
      createdBy: hit.createdBy ?? null,
      organizationId: hit.organizationId ?? null,
      isGlobal: hit.isGlobal ?? false,
    },
  };
}
