import type { CredentialCatalogField, CredentialCatalogFieldOption, CredentialCatalogFieldKind } from '../contracts/types';

function formatLabel(value: string): string {
  return value
    .split('_')
    .filter(Boolean)
    .map((token) => token.slice(0, 1).toUpperCase() + token.slice(1))
    .join(' ');
}

function parseEnumOptions(token: string): CredentialCatalogFieldOption[] {
  const match = token.match(/^enum\[(.*)\](?:_optional)?$/i);
  if (!match) return [];
  return match[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((value) => ({
      label: formatLabel(value),
      value,
    }));
}

function parseInputKind(token: string): CredentialCatalogFieldKind {
  const normalized = token.toLowerCase();

  if (normalized.startsWith('enum[')) return 'select';
  if (normalized.startsWith('secret_string')) return 'secret';
  if (normalized.startsWith('url')) return 'url';
  if (normalized.startsWith('boolean')) return 'boolean';
  if (normalized.startsWith('number')) return 'number';
  if (normalized.startsWith('json_string') || normalized.startsWith('json_object')) return 'json';
  if (normalized.startsWith('pem_string') || normalized.startsWith('yaml_string')) return 'textarea';
  if (normalized.startsWith('string_or_string_array')) return 'string_array';
  return 'text';
}

export function parseCredentialCatalogField(key: string, token: string): CredentialCatalogField {
  const inputKind = parseInputKind(token);
  const options = inputKind === 'select' ? parseEnumOptions(token) : [];

  return {
    key,
    label: formatLabel(key),
    token,
    inputKind,
    required: !token.toLowerCase().endsWith('_optional'),
    multiline: inputKind === 'textarea' || inputKind === 'json' || inputKind === 'string_array',
    options,
  };
}
