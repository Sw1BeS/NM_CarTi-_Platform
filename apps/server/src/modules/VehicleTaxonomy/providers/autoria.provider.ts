import axios from 'axios';
import { normalizeTaxonomyLabel, vehicleTaxonomyId } from '../vehicleTaxonomy.ids.js';
import type {
  VehicleTaxonomySourceMake,
  VehicleTaxonomySourceModel,
  VehicleTaxonomySourcePlace,
  VehicleTaxonomySourceSpecOption
} from '../vehicleTaxonomy.types.js';

const AUTORIA_BASE_URL = 'https://developers.ria.com/auto';

type AutoriaDictionaryItem = {
  value?: string | number;
  id?: string | number;
  name?: string;
  text?: string;
  title?: string;
  parentId?: string | number;
};

const itemId = (item: AutoriaDictionaryItem) => item.value ?? item.id;
const itemLabel = (item: AutoriaDictionaryItem) => normalizeTaxonomyLabel(item.name || item.text || item.title);
const sourceMeta = (extra?: Record<string, unknown>) =>
  Object.fromEntries(Object.entries({ source: 'AUTO_RIA', ...(extra || {}) }).filter(([, value]) => value !== undefined));

const mapAutoriaSpecOptions = (
  group: string,
  items: AutoriaDictionaryItem[],
  extraMeta?: Record<string, unknown>
): VehicleTaxonomySourceSpecOption[] =>
  items.reduce<VehicleTaxonomySourceSpecOption[]>((acc, item) => {
    const label = itemLabel(item);
    const id = itemId(item);
    if (!label || id === undefined || id === null) return acc;
    acc.push({
      group,
      slug: vehicleTaxonomyId(label),
      label,
      externalIds: { autoria: id },
      sourceMeta: sourceMeta({ ...extraMeta, parentId: item.parentId })
    });
    return acc;
  }, []);

export const mapAutoriaMarks = (items: AutoriaDictionaryItem[]): VehicleTaxonomySourceMake[] =>
  items.reduce<VehicleTaxonomySourceMake[]>((acc, item) => {
    const label = itemLabel(item);
    const id = itemId(item);
    if (!label || id === undefined || id === null) return acc;
    acc.push({
      slug: vehicleTaxonomyId(label),
      label,
      externalIds: { autoria: id },
      sourceMeta: sourceMeta()
    });
    return acc;
  }, []);

export const mapAutoriaModels = (
  makeExternalId: string | number,
  items: AutoriaDictionaryItem[]
): VehicleTaxonomySourceModel[] =>
  items.reduce<VehicleTaxonomySourceModel[]>((acc, item) => {
    const label = itemLabel(item);
    const id = itemId(item);
    if (!label || id === undefined || id === null) return acc;
    acc.push({
      makeExternalId,
      slug: vehicleTaxonomyId(label),
      label,
      externalIds: { autoria: id },
      sourceMeta: sourceMeta()
    });
    return acc;
  }, []);

export const fetchAutoriaMarks = async (params: { apiKey: string; categoryId?: number }) => {
  const categoryId = params.categoryId || 1;
  const response = await axios.get<AutoriaDictionaryItem[]>(`${AUTORIA_BASE_URL}/categories/${categoryId}/marks`, {
    params: { api_key: params.apiKey }
  });
  return mapAutoriaMarks(response.data || []);
};

export const fetchAutoriaModels = async (params: {
  apiKey: string;
  categoryId?: number;
  makeExternalId: string | number;
}) => {
  const categoryId = params.categoryId || 1;
  const response = await axios.get<AutoriaDictionaryItem[]>(
    `${AUTORIA_BASE_URL}/categories/${categoryId}/marks/${params.makeExternalId}/models`,
    { params: { api_key: params.apiKey } }
  );
  return mapAutoriaModels(params.makeExternalId, response.data || []);
};

export const fetchAutoriaSpecOptions = async (params: { apiKey: string; categoryId?: number }) => {
  const categoryId = params.categoryId || 1;
  const request = async (path: string) => {
    const response = await axios.get<AutoriaDictionaryItem[]>(`${AUTORIA_BASE_URL}${path}`, {
      params: { api_key: params.apiKey }
    });
    return response.data || [];
  };
  const [bodyTypes, transmissions, drives, fuels] = await Promise.all([
    request(`/categories/${categoryId}/bodystyles`),
    request(`/categories/${categoryId}/gearboxes`),
    request(`/categories/${categoryId}/driverTypes`),
    request('/type')
  ]);
  return [
    ...mapAutoriaSpecOptions('bodyType', bodyTypes, { categoryId }),
    ...mapAutoriaSpecOptions('transmission', transmissions, { categoryId }),
    ...mapAutoriaSpecOptions('drive', drives, { categoryId }),
    ...mapAutoriaSpecOptions('fuel', fuels)
  ];
};

export const fetchAutoriaPlaces = async (params: { apiKey: string }) => {
  const statesResponse = await axios.get<AutoriaDictionaryItem[]>(`${AUTORIA_BASE_URL}/states`, {
    params: { api_key: params.apiKey }
  });
  const states = statesResponse.data || [];
  const cityGroups = await Promise.all(states.map(async (state) => {
    const stateId = itemId(state);
    const stateLabel = itemLabel(state);
    if (stateId === undefined || stateId === null) return [];
    const response = await axios.get<AutoriaDictionaryItem[]>(`${AUTORIA_BASE_URL}/states/${stateId}/cities`, {
      params: { api_key: params.apiKey }
    });
    return (response.data || []).reduce<VehicleTaxonomySourcePlace[]>((acc, city) => {
      const label = itemLabel(city);
      const cityId = itemId(city);
      if (!label || cityId === undefined || cityId === null) return acc;
      acc.push({
        countryCode: 'UA',
        type: 'city',
        slug: vehicleTaxonomyId(label),
        label,
        region: stateLabel || null,
        externalIds: { autoria: cityId, autoriaState: stateId },
        sourceMeta: sourceMeta({ state: stateLabel || null })
      });
      return acc;
    }, []);
  }));
  return cityGroups.flat();
};
