import rawCatalog from '../catalog/api-credential-catalog-300-plus.json';
import { parseCredentialCatalogField } from './catalog-field';
import type { CredentialCatalogService } from '../contracts/types';

type RawCatalogService = {
  service_name?: string;
  service_icon?: string | null;
  service_id?: string;
  credentials?: Record<string, string> | null;
};

const services: CredentialCatalogService[] = ((rawCatalog as { services?: RawCatalogService[] }).services || [])
  .map((service) => {
    const serviceId = String(service.service_id || '').trim();
    const serviceName = String(service.service_name || '').trim();
    if (!serviceId || !serviceName) return null;

    const credentialMap = service.credentials && typeof service.credentials === 'object' ? service.credentials : {};
    const fields = Object.entries(credentialMap)
      .map(([key, token]) => parseCredentialCatalogField(key, String(token || '').trim()))
      .filter((field) => field.key && field.token);

    return {
      serviceId,
      serviceName,
      serviceIcon: service.service_icon ? String(service.service_icon) : null,
      fields,
    } satisfies CredentialCatalogService;
  })
  .filter((service): service is CredentialCatalogService => Boolean(service))
  .sort((left, right) => left.serviceName.localeCompare(right.serviceName));

const servicesById = new Map(services.map((service) => [service.serviceId, service]));

export function listCredentialCatalog(): CredentialCatalogService[] {
  return services;
}

export function getCredentialCatalogService(serviceId: string): CredentialCatalogService | null {
  return servicesById.get(String(serviceId || '').trim()) || null;
}

export function getCredentialCatalogPayload() {
  return listCredentialCatalog();
}
