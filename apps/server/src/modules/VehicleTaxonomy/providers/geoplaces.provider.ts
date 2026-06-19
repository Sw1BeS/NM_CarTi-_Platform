import axios from 'axios';
import { readFile } from 'node:fs/promises';
import { normalizeTaxonomyLabel, vehicleTaxonomyId } from '../vehicleTaxonomy.ids.js';
import type { VehicleTaxonomySourcePlace } from '../vehicleTaxonomy.types.js';

const DEFAULT_KATOTTG_CSV_URL = 'https://api.directory.org.ua/api/katottg/download/csv';

type KatottgMapOptions = {
  includeSettlements?: boolean;
};

type KatottgPlaceType = 'city' | 'settlement';

type KatottgFetchOptions = KatottgMapOptions & {
  headers?: Record<string, string>;
  url?: string;
};

const readTextSource = async (source: string, headers?: Record<string, string>) => {
  if (/^https?:\/\//i.test(source)) {
    const response = await axios.get<string>(source, { responseType: 'text' as any, headers });
    return String(response.data || '');
  }
  const path = source.startsWith('file://') ? new URL(source) : source;
  return readFile(path, 'utf8');
};

const katottgAuthHeaders = () => {
  const authorization = process.env.KATOTTG_AUTHORIZATION ||
    (process.env.KATOTTG_API_TOKEN ? `Bearer ${process.env.KATOTTG_API_TOKEN}` : undefined);
  return authorization ? { Authorization: authorization } : undefined;
};

const parseNumber = (value: unknown) => {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
};

const splitLine = (line: string, delimiter: string) => line.split(delimiter).map((value) => value.trim().replace(/^"|"$/g, ''));

const detectDelimiter = (line: string) => {
  if (line.includes('\t')) return '\t';
  if (line.includes(';')) return ';';
  return ',';
};

const parseDelimited = (text: string) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const delimiter = detectDelimiter(lines[0]);
  const headers = splitLine(lines[0], delimiter);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line, delimiter);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index] || '';
      return acc;
    }, {});
  });
};

const pick = (row: Record<string, string>, keys: string[]) => {
  for (const key of keys) {
    const value = normalizeTaxonomyLabel(row[key]);
    if (value) return value;
  }
  return '';
};

const katottgType = (category: string): KatottgPlaceType | null => {
  const normalized = category.toUpperCase();
  if (['M', 'CITY', 'М', 'МІСТО'].includes(normalized)) return 'city';
  if (['P', 'VILLAGE', 'S', 'С', 'СЕЛО', 'TOWN', 'СМТ'].includes(normalized)) return 'settlement';
  return null;
};

const shouldIncludeKatottgType = (type: KatottgPlaceType | null, options: KatottgMapOptions): type is KatottgPlaceType =>
  type === 'city' || (type === 'settlement' && options.includeSettlements === true);

export const mapKatottgCsv = (text: string, options: KatottgMapOptions = {}): VehicleTaxonomySourcePlace[] =>
  parseDelimited(text).reduce<VehicleTaxonomySourcePlace[]>((acc, row) => {
    const label = pick(row, ['name', 'Назва', 'Назва об’єкта українською мовою', 'Назва обʼєкта українською мовою']);
    const category = pick(row, ['category', 'Категорія', 'Тип']);
    const type = katottgType(category);
    const code = pick(row, ['code', 'Код КАТОТТГ', 'katottg', 'Код']);
    if (!label || !shouldIncludeKatottgType(type, options)) return acc;
    acc.push({
      countryCode: 'UA',
      type,
      slug: vehicleTaxonomyId(label),
      label,
      region: pick(row, ['region', 'Область']) || null,
      externalIds: code ? { katottg: code } : undefined,
      sourceMeta: { source: 'KATOTTG', category }
    });
    return acc;
  }, []);

export const mapGeoNamesTsv = (text: string): VehicleTaxonomySourcePlace[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<VehicleTaxonomySourcePlace[]>((acc, line) => {
      const cells = line.split('\t');
      const geonameId = Number(cells[0]);
      const label = normalizeTaxonomyLabel(cells[1]);
      const latitude = parseNumber(cells[4]);
      const longitude = parseNumber(cells[5]);
      const featureClass = cells[6];
      const countryCode = normalizeTaxonomyLabel(cells[8] || cells[7]).toUpperCase();
      if (!label || featureClass !== 'P' || !countryCode) return acc;
      acc.push({
        countryCode,
        type: 'city',
        slug: vehicleTaxonomyId(label),
        label,
        latitude,
        longitude,
        externalIds: Number.isFinite(geonameId) ? { geonames: geonameId } : undefined,
        sourceMeta: { source: 'GEONAMES' }
      });
      return acc;
    }, []);

export const fetchKatottgPlaces = async (input: string | KatottgFetchOptions = {}) => {
  const options = typeof input === 'string' ? { url: input } : input;
  const url = options.url || process.env.KATOTTG_CSV_URL || DEFAULT_KATOTTG_CSV_URL;
  const data = await readTextSource(url, options.headers || katottgAuthHeaders());
  return mapKatottgCsv(data, { includeSettlements: options.includeSettlements });
};

export const fetchGeoNamesPlaces = async (url = process.env.GEONAMES_TSV_URL) => {
  if (!url) throw new Error('GEONAMES sync requires GEONAMES_TSV_URL');
  const data = await readTextSource(url);
  return mapGeoNamesTsv(data);
};
