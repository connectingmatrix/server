export const INTROSPECTION_QUERY = `
query QuerySweepSchema {
  __schema {
    queryType { name }
    mutationType { name }
    types {
      kind
      name
      fields(includeDeprecated: true) { name args { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      inputFields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } }
      enumValues(includeDeprecated: true) { name }
    }
  }
}
`;

export type TypeRef = { kind: string; name?: string | null; ofType?: TypeRef | null };
export type SchemaArg = { name: string; type: TypeRef };
export type SchemaField = { name: string; args?: SchemaArg[] | null; type: TypeRef };
export type SchemaType = {
  kind: string;
  name: string;
  fields?: SchemaField[] | null;
  inputFields?: SchemaArg[] | null;
  enumValues?: Array<{ name: string }> | null;
};
export type SchemaIndex = { mutationFields: SchemaField[]; queryFields: SchemaField[]; typesByName: Map<string, SchemaType> };
const HEAVY_FIELD_NAMES = new Set([
  'workflow',
  'metadata',
  'published_workflow',
  'workflow_snapshot',
  'request_payload',
  'response_payload',
  'logs',
  'content',
  'cred_json',
]);

export function typeName(typeRef: TypeRef): string {
  let current: TypeRef = typeRef;
  while (current.ofType) current = current.ofType;
  return String(current.name || '');
}

export function typeText(typeRef: TypeRef): string {
  if (typeRef.kind === 'NON_NULL' && typeRef.ofType) return `${typeText(typeRef.ofType)}!`;
  if (typeRef.kind === 'LIST' && typeRef.ofType) return `[${typeText(typeRef.ofType)}]`;
  return String(typeRef.name || 'String');
}

function namedSelection(typeNameValue: string, index: SchemaIndex, depth: number): string {
  const schemaType = index.typesByName.get(typeNameValue);
  if (!schemaType) return '{ __typename }';
  if (schemaType.kind === 'UNION' || schemaType.kind === 'INTERFACE') return '{ __typename }';
  if (schemaType.kind !== 'OBJECT') return '';
  if (depth >= 2) return '{ __typename }';
  const candidates = (schemaType.fields || []).filter((field) => !field.name.startsWith('__') && !HEAVY_FIELD_NAMES.has(field.name));
  const fields = (candidates.length ? candidates : schemaType.fields || []).slice(0, 6);
  const parts = fields.map((field) => {
    const childName = typeName(field.type);
    const childType = index.typesByName.get(childName);
    if (!childType || childType.kind === 'SCALAR' || childType.kind === 'ENUM') return field.name;
    return `${field.name} ${namedSelection(childName, index, depth + 1)}`;
  });
  return parts.length ? `{ ${parts.join(' ')} }` : '{ __typename }';
}

export function fieldSelection(field: SchemaField, index: SchemaIndex): string {
  const rootTypeName = typeName(field.type);
  return namedSelection(rootTypeName, index, 0);
}

export function parseSchemaIndex(schema: {
  mutationType?: { name?: string | null } | null;
  queryType?: { name?: string | null } | null;
  types?: SchemaType[] | null;
}): SchemaIndex {
  const types = schema.types || [];
  const typesByName = new Map(types.filter((type) => type.name).map((type) => [type.name, type]));
  const mutationTypeName = String(schema.mutationType?.name || 'Mutation');
  const mutationType = typesByName.get(mutationTypeName);
  const queryTypeName = String(schema.queryType?.name || 'Query');
  const queryType = typesByName.get(queryTypeName);
  return {
    mutationFields: (mutationType?.fields || []).filter((field) => !field.name.startsWith('__')),
    queryFields: (queryType?.fields || []).filter((field) => !field.name.startsWith('__')),
    typesByName,
  };
}

export function buildQueryDocument(field: SchemaField, selection: string, values: Record<string, unknown> = {}): string {
  const args = (field.args || []).filter((arg) => Object.prototype.hasOwnProperty.call(values, arg.name));
  const variableDefs = args.map((arg) => `$${arg.name}: ${typeText(arg.type)}`).join(', ');
  const callArgs = args.map((arg) => `${arg.name}: $${arg.name}`).join(', ');
  const header = variableDefs ? `query LiveSweep_${field.name}(${variableDefs})` : `query LiveSweep_${field.name}`;
  const body = callArgs ? `${field.name}(${callArgs})` : field.name;
  return `${header} { ${body} ${selection} }`;
}

export function buildMutationDocument(field: SchemaField, selection: string, values: Record<string, unknown> = {}): string {
  const args = (field.args || []).filter((arg) => Object.prototype.hasOwnProperty.call(values, arg.name));
  const variableDefs = args.map((arg) => `$${arg.name}: ${typeText(arg.type)}`).join(', ');
  const callArgs = args.map((arg) => `${arg.name}: $${arg.name}`).join(', ');
  const header = variableDefs ? `mutation LiveSweep_${field.name}(${variableDefs})` : `mutation LiveSweep_${field.name}`;
  const body = callArgs ? `${field.name}(${callArgs})` : field.name;
  return `${header} { ${body} ${selection} }`;
}
