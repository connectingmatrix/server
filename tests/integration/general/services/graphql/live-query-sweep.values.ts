import type { SchemaArg, SchemaIndex, TypeRef } from './live-query-sweep.graphql';
import type { SweepFixture } from './live-query-sweep.fixture';

const text = (value: unknown) => String(value || '').trim();
const isRequired = (type: TypeRef) => type.kind === 'NON_NULL';
const innerType = (type: TypeRef) => ((type.kind === 'NON_NULL' || type.kind === 'LIST') && type.ofType ? type.ofType : type);
const scalar = (name: string, typeName: string, fixture: SweepFixture) => {
  const key = name.toLowerCase();
  if (key.includes('organization')) return fixture.organizationId || fixture.channelId;
  if (key.includes('channel')) return fixture.channelId;
  if (key.includes('category')) return fixture.categoryId;
  if (key.includes('subject')) return fixture.subjectId;
  if (key.includes('post')) return fixture.postId;
  if (key.includes('chat')) return fixture.chatId;
  if (key.includes('user')) return fixture.userId;
  if (key.includes('email')) return fixture.email;
  if (key.includes('slug')) return `live-sweep-${fixture.channelId.slice(0, 8)}`;
  if (typeName === 'Boolean') return false;
  if (typeName === 'Int') return 1;
  if (typeName === 'Float') return 1;
  if (typeName === 'UUID') return fixture.postId;
  return `live-sweep-${name}`;
};

function valueForType(type: TypeRef, name: string, index: SchemaIndex, fixture: SweepFixture, unresolved: string[], path: string): unknown {
  if (type.kind === 'NON_NULL') return valueForType(type.ofType as TypeRef, name, index, fixture, unresolved, path);
  if (type.kind === 'LIST') return [valueForType(type.ofType as TypeRef, name, index, fixture, unresolved, path)];
  const namedType = text(type.name);
  if (type.kind === 'SCALAR') return scalar(name, namedType, fixture);
  if (type.kind === 'ENUM') {
    const enumType = index.typesByName.get(namedType);
    const value = enumType?.enumValues?.[0]?.name;
    if (!value) unresolved.push(path);
    return value || null;
  }
  if (type.kind !== 'INPUT_OBJECT') return null;
  const inputType = index.typesByName.get(namedType);
  if (!inputType?.inputFields?.length) return {};
  const payload: Record<string, unknown> = {};
  for (const field of inputType.inputFields) {
    const fieldPath = `${path}.${field.name}`;
    if (!isRequired(field.type)) continue;
    payload[field.name] = valueForType(field.type, field.name, index, fixture, unresolved, fieldPath);
  }
  return payload;
}

export function valuesForArgs(args: SchemaArg[] | null | undefined, index: SchemaIndex, fixture: SweepFixture) {
  const unresolved: string[] = [];
  const values: Record<string, unknown> = {};
  for (const arg of args || []) {
    if (!isRequired(arg.type)) continue;
    values[arg.name] = valueForType(arg.type, arg.name, index, fixture, unresolved, arg.name);
    if (isRequired(arg.type) && (values[arg.name] === null || values[arg.name] === undefined)) unresolved.push(arg.name);
  }
  return { unresolved, values };
}
