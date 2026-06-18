import axios from 'axios';
import { normalizeTaxonomyLabel, vehicleTaxonomyId } from '../vehicleTaxonomy.ids.js';
import type { VehicleTaxonomySourceMake, VehicleTaxonomySourceModel } from '../vehicleTaxonomy.types.js';

const AUTORIA_BASE_URL = 'https://developers.ria.com/auto';

type AutoriaDictionaryItem = {
  value?: string | number;
  id?: string | number;
  name?: string;
  text?: string;
  title?: string;
};

const itemId = (item: AutoriaDictionaryItem) => item.value ?? item.id;
const itemLabel = (item: AutoriaDictionaryItem) => normalizeTaxonomyLabel(item.name || item.text || item.title);

export const mapAutoriaMarks = (items: AutoriaDictionaryItem[]): VehicleTaxonomySourceMake[] =>
  items.reduce<VehicleTaxonomySourceMake[]>((acc, item) => {
    const label = itemLabel(item);
    const id = itemId(item);
    if (!label || id === undefined || id === null) return acc;
    acc.push({
      slug: vehicleTaxonomyId(label),
      label,
      externalIds: { autoria: id },
      sourceMeta: { source: 'AUTO_RIA' }
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
      sourceMeta: { source: 'AUTO_RIA' }
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
