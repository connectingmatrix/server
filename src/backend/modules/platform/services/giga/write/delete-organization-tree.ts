import { SupabaseClient } from '@supabase/supabase-js';
import { AIPostsRepository } from '@connectingmatrix/orm/repositories/ai-posts.repository';
import { AISubjectsRepository } from '@connectingmatrix/orm/repositories/ai-subjects.repository';
import { TreeGraphEntity } from '@giga/tree/services/giga/tree/runtime/system';
import { deleteAiCategoryBranch, deleteAiChannelBranch } from '@giga/tree/services/giga/tree/write/deleteOwnedBranch';
import { removeSubjectFromGraph } from '@connectingmatrix/orm/repositories/entities/tree/Subject';
import { GRAPH_LABELS } from '@giga/shared/types/contracts/graph.types';
import { deleteOrganizationTreeNode } from '@giga/general/services/giga/runtime/organization-tree-node';

type OrganizationRoot = {
  rootId: string;
  labels: string[];
};

export async function deleteOrganizationTree(supabase: SupabaseClient, input: { organizationId: string; userPermissionsId: string }): Promise<void> {
  const roots = (await TreeGraphEntity.listOrganizationRootNodes(input.organizationId)) as OrganizationRoot[];

  const postsRepository = new AIPostsRepository(supabase as any);
  const subjectsRepository = new AISubjectsRepository(supabase as any);

  for (const root of roots) {
    if (root.labels.includes(GRAPH_LABELS.channel)) {
      await deleteAiChannelBranch(supabase, {
        channelId: root.rootId,
        userPermissionsId: input.userPermissionsId,
      });
      continue;
    }

    if (root.labels.includes(GRAPH_LABELS.category)) {
      await deleteAiCategoryBranch(supabase, {
        categoryId: root.rootId,
        userPermissionsId: input.userPermissionsId,
      });
      continue;
    }

    const posts = await postsRepository.getBySubjectIds([root.rootId]);
    await postsRepository.deleteByIds(posts.map((post) => post.id).filter(Boolean));
    await subjectsRepository.deleteByIds([root.rootId]);
    await removeSubjectFromGraph({
      subjectId: root.rootId,
      userPermissionsId: input.userPermissionsId,
    });
  }

  await deleteOrganizationTreeNode(input.organizationId);
}
