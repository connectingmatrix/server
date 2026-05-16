import { Service, Container } from 'typedi';
import { GraphqlCustomResolverModule } from './resolvers';

void GraphqlCustomResolverModule;

@Service()
export class FactoryService {
  constructor(private graphqlCustomResolverModule: GraphqlCustomResolverModule) {}

  getService(target: unknown) {
    const serviceName = (target as any)?.constructor?.name;
    if (serviceName === this.graphqlCustomResolverModule.constructor.name) {
      return this.graphqlCustomResolverModule as Record<string, any>;
    }

    const targetConstructor = (target as any)?.constructor;
    if (typeof targetConstructor === 'function') {
      return Container.get(targetConstructor) as Record<string, any>;
    }

    throw new Error(`Unable to resolve service instance for target: ${String(serviceName)}`);
  }
}
