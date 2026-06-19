import { vehicleTaxonomyId } from './vehicleTaxonomy.ids.js';
import type { VehicleTaxonomyCompatibilityConstraints } from './vehicleTaxonomy.types.js';

type ConstraintInput = {
  brandLabel: string;
  modelLabel?: string;
  sourceMeta?: unknown;
};

const RULE_SOURCE = 'RULES_OVERLAY';
const electric = vehicleTaxonomyId('Електро');
const automatic = vehicleTaxonomyId('Автомат');
const sedan = vehicleTaxonomyId('Седан');
const suv = vehicleTaxonomyId('SUV');
const liftback = vehicleTaxonomyId('Ліфтбек');
const pickup = vehicleTaxonomyId('Пікап');
const coupe = vehicleTaxonomyId('Купе');
const cabriolet = vehicleTaxonomyId('Кабріолет');

const EV_ONLY_BRANDS = new Set(['tesla', 'lucid', 'rivian']);

const ELECTRIC_MODEL_RULES: Record<string, string[]> = {
  audi: ['e-tron', 'e-tron gt', 'q4 e-tron', 'q8 e-tron'],
  bmw: ['i3', 'i4', 'i5', 'i7', 'i8', 'ix', 'ix1', 'ix2', 'ix3'],
  'mercedes-benz': ['eqa', 'eqb', 'eqc', 'eqe', 'eqs', 'eqv'],
  hyundai: ['ioniq 5', 'ioniq 6'],
  jaguar: ['i-pace'],
  kia: ['ev3', 'ev5', 'ev6', 'ev9', 'niro ev'],
  nissan: ['leaf', 'ariya'],
  porsche: ['taycan'],
  skoda: ['enyaq'],
  volkswagen: ['id.3', 'id.4', 'id.5', 'id.7', 'id buzz', 'id.buzz'],
  volvo: ['ex30', 'ex40', 'ex90']
};

const TESLA_BODY_BY_MODEL: Record<string, string[]> = {
  'model 3': [sedan],
  'model s': [liftback],
  'model x': [suv],
  'model y': [suv],
  cybertruck: [pickup],
  roadster: [coupe, cabriolet]
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;

const normalizeName = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[._-]+/g, ' ')
    .replace(/\s+/g, ' ');

const normalizeIds = (values: unknown): string[] | undefined => {
  if (!Array.isArray(values)) return undefined;
  const ids = values
    .map((value) => vehicleTaxonomyId(value))
    .filter((value) => value && value !== 'unknown');
  return ids.length ? Array.from(new Set(ids)) : undefined;
};

const readSourceConstraints = (sourceMeta: unknown): VehicleTaxonomyCompatibilityConstraints | undefined => {
  const meta = asRecord(sourceMeta);
  const raw = asRecord(meta?.constraints) || asRecord(meta?.compatibility);
  if (!raw) return undefined;

  const constraints: VehicleTaxonomyCompatibilityConstraints = {
    fuels: normalizeIds(raw.fuels || raw.fuel),
    bodyTypes: normalizeIds(raw.bodyTypes || raw.bodyType || raw.bodies),
    transmissions: normalizeIds(raw.transmissions || raw.transmission || raw.gearbox),
    drives: normalizeIds(raw.drives || raw.drive),
    source: typeof raw.source === 'string' ? raw.source : 'SOURCE_META'
  };

  return compactConstraints(constraints);
};

const compactConstraints = (constraints: VehicleTaxonomyCompatibilityConstraints) => {
  const output: VehicleTaxonomyCompatibilityConstraints = {};
  if (constraints.fuels?.length) output.fuels = constraints.fuels;
  if (constraints.bodyTypes?.length) output.bodyTypes = constraints.bodyTypes;
  if (constraints.transmissions?.length) output.transmissions = constraints.transmissions;
  if (constraints.drives?.length) output.drives = constraints.drives;
  if (Object.keys(output).length) output.source = constraints.source || RULE_SOURCE;
  return Object.keys(output).length ? output : undefined;
};

const electricPowertrain = (): VehicleTaxonomyCompatibilityConstraints => ({
  fuels: [electric],
  transmissions: [automatic],
  source: RULE_SOURCE
});

const modelMatches = (modelName: string, candidates: string[]) =>
  candidates.some((candidate) => modelName === candidate || modelName.startsWith(`${candidate} `));

const resolveRuleConstraints = (input: ConstraintInput): VehicleTaxonomyCompatibilityConstraints | undefined => {
  const brand = vehicleTaxonomyId(input.brandLabel);
  const model = normalizeName(input.modelLabel);

  if (EV_ONLY_BRANDS.has(brand)) {
    return compactConstraints({
      ...electricPowertrain(),
      bodyTypes: brand === 'tesla' && model ? TESLA_BODY_BY_MODEL[model] : undefined
    });
  }

  if (model && modelMatches(model, ELECTRIC_MODEL_RULES[brand] || [])) {
    return compactConstraints(electricPowertrain());
  }

  return undefined;
};

export const resolveVehicleCompatibilityConstraints = (input: ConstraintInput) =>
  readSourceConstraints(input.sourceMeta) || resolveRuleConstraints(input);
