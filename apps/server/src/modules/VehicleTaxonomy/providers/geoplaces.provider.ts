import axios from 'axios';
import { normalizeTaxonomyLabel, vehicleTaxonomyId } from '../vehicleTaxonomy.ids.js';
import type { VehicleTaxonomySourcePlace } from '../vehicleTaxonomy.types.js';

const DEFAULT_KATOTTG_CSV_URL = 'https://api.directory.org.ua/api/katottg/download/csv';

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

const katottgType = (category: string) => {
  const normalized = category.toUpperCase();
  if (['M', 'CITY', 'М', 'МІСТО'].includes(normalized)) return 'city';
  if (['P', 'VILLAGE', 'S', 'С', 'СЕЛО', 'TOWN', 'СМТ'].includes(normalized)) return 'settlement';
  return null;
};

export const mapKatottgCsv = (text: string): VehicleTaxonomySourcePlace[] =>
  parseDelimited(text).reduce<VehicleTaxonomySourcePlace[]>((acc, row) => {
    const label = pick(row, ['name', 'Назва', 'Назва об’єкта українською мовою', 'Назва обʼєкта українською мовою']);
    const category = pick(row, ['category', 'Категорія', 'Тип']);
    const type = katottgType(category);
    const code = pick(row, ['code', 'Код КАТОТТГ', 'katottg', 'Код']);
    if (!label || type !== 'city') return acc;
    acc.push({
      countryCode: 'UA',
      type,
      slug: vehicleTaxonomyId(label),
      label,
      region: pick(row, ['region', 'Область']) || null,
      externalIds: code ? { katottg: code } : undefined,
      sourceMeta: { source: 'KATOTTG' }
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

export const fetchKatottgPlaces = async (url = process.env.KATOTTG_CSV_URL || DEFAULT_KATOTTG_CSV_URL) => {
  const response = await axios.get<string>(url, { responseType: 'text' as any });
  return mapKatottgCsv(String(response.data || ''));
};
