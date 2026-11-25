import { randomBytes } from 'node:crypto';

const copy = value => value === undefined ? undefined : structuredClone(value);
const field = (record, key) => key.split('.').reduce((value, segment) => value?.[segment], record);
export function evaluate(expression, record) {
  if (typeof expression === 'string' && expression.startsWith('$')) return field(record, expression.slice(1));
  if (Array.isArray(expression)) return expression.map(e => evaluate(e, record));
  if (expression === null || typeof expression !== 'object') return expression;
  if ('$literal' in expression) return expression.$literal;
  const operator = Object.keys(expression)[0];
  const argument = expression[operator];
  if (!operator?.startsWith('$')) return Object.fromEntries(Object.entries(expression).map(([k, v]) => [k, evaluate(v, record)]));
  if (operator === '$getField') return evaluate(argument.input, record)?.[evaluate(argument.field, record)];
  if (operator === '$setField') return { ...evaluate(argument.input, record), [evaluate(argument.field, record)]: evaluate(argument.value, record) };
  const values = evaluate(argument, record);
  switch (operator) {
    case '$ifNull': return values.find(v => v !== null && v !== undefined) ?? null;
    case '$add': return values.reduce((a, b) => a + b, 0);
    case '$subtract': return values[0] - values[1];
    case '$max': return Math.max(...values);
    case '$concatArrays': return values.flat();
    case '$cond': return values[0] ? values[1] : values[2];
    case '$in': return values[1].includes(values[0]);
    case '$lt': return values[0] < values[1];
    default: throw new Error(`Unsupported fixture operator ${operator}`);
  }
}
function matches(record, filter) {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some(item => matches(record, item));
    if (key === '$expr') return evaluate(expected, record);
    const actual = field(record, key);
    if (expected && typeof expected === 'object' && !(expected instanceof Date)) {
      if ('$ne' in expected) return Array.isArray(actual) ? !actual.includes(expected.$ne) : actual !== expected.$ne;
      if ('$exists' in expected) return (actual !== undefined) === expected.$exists;
      if ('$lte' in expected) return actual <= expected.$lte;
    }
    return Array.isArray(actual) ? actual.includes(expected) : actual === expected;
  });
}
class Query {
  constructor(get) { this.get = get; }
  sort(spec) { this.sortBy = spec; return this; }
  limit(count) { this.count = count; return this; }
  select(fields) { this.fields = fields.split(' '); return this; }
  then(resolve, reject) {
    return Promise.resolve().then(() => {
      let result = this.get();
      if (Array.isArray(result)) {
        if (this.sortBy) { const [key, direction] = Object.entries(this.sortBy)[0]; result.sort((a, b) => (a[key] > b[key] ? 1 : -1) * direction); }
        if (this.count) result = result.slice(0, this.count);
      }
      result = copy(result);
      if (this.fields && result) result = Object.fromEntries(['_id', ...this.fields].filter(k => result[k] !== undefined).map(k => [k, result[k]]));
      return result;
    }).then(resolve, reject);
  }
}
export function repository(defaults = {}, unique = []) {
  const records = new Map();
  const all = filter => [...records.values()].filter(r => matches(r, filter));
  const apply = (record, update, options) => {
    if (Array.isArray(update)) {
      if (!options?.updatePipeline) throw new Error('Mongoose requires updatePipeline');
      for (const stage of update) Object.assign(record, evaluate(stage.$set, record));
    } else Object.assign(record, copy(update.$set || {}));
  };
  return {
    records,
    async create(input) {
      const value = { ...copy(defaults), createdAt: new Date(), _id: input._id || randomBytes(12).toString('hex'), ...copy(input) };
      if (records.has(value._id) || unique.some(check => [...records.values()].some(r => check(r, value)))) throw Object.assign(new Error('Duplicate'), { code: 11000 });
      records.set(value._id, value); return copy(value);
    },
    findById(id) { return new Query(() => records.get(id) || null); },
    findOne(filter) { const query = new Query(() => all(filter)); const then = query.then.bind(query); query.then = (resolve, reject) => then(values => resolve(values[0] || null), reject); return query; },
    find(filter) { return new Query(() => all(filter)); },
    async findOneAndUpdate(filter, update, options = {}) {
      const record = all(filter)[0];
      if (!record && options.upsert) return this.create({ ...Object.fromEntries(Object.entries(filter).filter(([k, v]) => !k.startsWith('$') && (typeof v !== 'object' || v === null))), ...copy(update.$setOnInsert), ...copy(update.$set) });
      if (!record) return null;
      apply(record, update, options); return copy(record);
    },
    async updateOne(filter, update, options) { const record = all(filter)[0]; if (!record) return { modifiedCount: 0 }; apply(record, update, options); return { modifiedCount: 1 }; },
  };
}
