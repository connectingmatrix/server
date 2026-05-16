import type { GraphqlOperationContract } from '@giga/shared/types/contracts/integration-contract.types';

export const GRAPHQL_CONTRACTS: GraphqlOperationContract[] = [];

export const NO_GRAPHQL_SURFACE_REASON = 'No direct GraphQL resolver ownership in this package; GraphQL is composed by integration layers.';
