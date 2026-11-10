import fs from 'node:fs';

const snapshot = JSON.parse(
  fs.readFileSync(
    new URL('../data/usda/snapshot.json', import.meta.url),
    'utf8',
  ),
);
const foods = new Map(
  snapshot.foods.flatMap((food) =>
    food.aliases.map((alias) => [alias.toLowerCase(), food]),
  ),
);
const ruAliases = {
  яйцо: 'egg',
  яйца: 'eggs',
  помидор: 'tomato',
  помидоры: 'tomatoes',
  томат: 'tomato',
  томаты: 'tomatoes',
  лук: 'onion',
  луковица: 'onion',
  луковицы: 'onions',
  картофель: 'potato',
  картошка: 'potato',
  шпинат: 'spinach',
  рис: 'raw long grain white rice',
  соль: 'salt',
  вода: 'water',
  черныйперец: 'black pepper',
  чёрныйперец: 'black pepper',
  молоко: 'whole milk',
  сливки: 'heavy cream',
  чеддер: 'cheddar',
  масло: 'soybean oil',
};
for (const [alias, english] of Object.entries(ruAliases)) {
  const food = foods.get(english);
  if (food) foods.set(alias, food);
}
const units = new Set(['piece', 'g', 'ml']);
const clean = (v, n = 100) =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, n);

export function inventory(input) {
  if (!Array.isArray(input) || input.length > 30)
    throw Object.assign(new Error('You can add up to 30 ingredients.'), {
      status: 400,
    });
  const used = new Set();
  return input.map((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row))
      throw Object.assign(new Error('Each ingredient must be an object.'), {
        status: 400,
      });
    const name = clean(row.name, 60);
    if (!name || /[<>]/.test(name))
      throw Object.assign(
        new Error(`Check the name of ingredient ${index + 1}.`),
        { status: 400 },
      );
    const id = /^[a-z0-9_-]{1,40}$/i.test(row.id || '')
      ? row.id
      : `item_${index + 1}`;
    if (used.has(id))
      throw Object.assign(new Error('Duplicate ingredient ID.'), {
        status: 400,
      });
    used.add(id);
    const quantity =
      row.quantity === '' || row.quantity == null ? null : Number(row.quantity);
    if (
      quantity !== null &&
      (!Number.isFinite(quantity) || quantity <= 0 || quantity > 10000)
    )
      throw Object.assign(new Error(`Check the quantity for ${name}.`), {
        status: 400,
      });
    const unit = units.has(row.unit) ? row.unit : 'piece';
    return { id, name, quantity, unit };
  });
}

export function visionItems(payload) {
  const raw = Array.isArray(payload?.items) ? payload.items : [];
  return inventory(
    raw.slice(0, 30).map((item, i) => ({
      id: `item_${i + 1}`,
      name: item.name,
      quantity: item.quantity,
      unit: item.unit,
    })),
  );
}

function grams(food, amount, unit) {
  if (unit === 'g') return amount;
  const conversion = food.conversions.find((c) => c.unit === unit);
  return conversion
    ? (amount * conversion.source_grams) / conversion.units_per_portion
    : null;
}

export function nutrition(ingredients, servings) {
  const totals = { kcal: 0, protein_g: 0, fat_g: 0, carbohydrates_g: 0 };
  const missing = [];
  const assumptions = [];
  for (const ingredient of ingredients) {
    const food = foods.get(ingredient.name.toLowerCase());
    const mass = food && grams(food, ingredient.quantity, ingredient.unit);
    if (!mass) {
      missing.push(ingredient.name);
      continue;
    }
    for (const field of Object.keys(totals))
      totals[field] += (food.per_100g[field] * mass) / 100;
    assumptions.push(`${ingredient.name}: ${food.assumption}`);
  }
  for (const field of Object.keys(totals))
    totals[field] = Math.round((totals[field] / servings) * 10) / 10;
  return {
    per_serving: totals,
    coverage: missing.length ? 'partial' : 'complete',
    missing,
    assumptions,
    source: snapshot.snapshot_version,
  };
}

function normalizedIngredient(row, byId, exclusions) {
  if (!row || typeof row !== 'object') return null;
  const item = byId.get(row.id);
  const quantity = Number(row.quantity);
  if (!item || exclusions.some((x) => item.name.toLowerCase().includes(x)))
    return null;
  if (
    !Number.isFinite(quantity) ||
    quantity <= 0 ||
    quantity > 10000 ||
    row.unit !== item.unit
  )
    return null;
  if (item.quantity != null && quantity > item.quantity) return null;
  return { id: item.id, name: item.name, quantity, unit: item.unit };
}

export function recipes(payload, items, servings, exclusions = '') {
  const raw = Array.isArray(payload?.recipes) ? payload.recipes : [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const excluded = clean(exclusions, 200)
    .toLowerCase()
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const result = [];
  for (const row of raw.slice(0, 6)) {
    const title = clean(row?.title, 90);
    const steps = Array.isArray(row?.steps)
      ? row.steps
          .slice(0, 8)
          .map((s) => clean(s, 260))
          .filter(Boolean)
      : [];
    const ingredients = Array.isArray(row?.ingredients)
      ? row.ingredients.map((i) => normalizedIngredient(i, byId, excluded))
      : [];
    if (
      !title ||
      /[<>]/.test(title) ||
      steps.length < 2 ||
      ingredients.length < 1 ||
      ingredients.some((i) => !i)
    )
      continue;
    const ids = ingredients.map((i) => i.id);
    if (new Set(ids).size !== ids.length) continue;
    const minutes = Number(row.minutes);
    const recipe = {
      id: `recipe_${result.length + 1}`,
      title,
      minutes:
        Number.isInteger(minutes) && minutes >= 5 && minutes <= 180
          ? minutes
          : null,
      ingredients,
      steps,
      servings,
      note: clean(row.note, 180),
    };
    recipe.nutrition = nutrition(ingredients, servings);
    result.push(recipe);
    if (result.length === 3) break;
  }
  return result;
}

export function fallback(items, servings, exclusions = '') {
  const excluded = clean(exclusions, 200)
    .toLowerCase()
    .split(/[,;\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  const available = items.filter(
    (i) => !excluded.some((x) => i.name.toLowerCase().includes(x)),
  );
  if (!available.length) return [];
  const choose = (terms) =>
    available.find((i) => terms.some((t) => i.name.toLowerCase().includes(t)));
  const egg = choose(['egg', 'яйц']);
  const tomato = choose(['tomato', 'помидор']);
  const onion = choose(['onion', 'лук']);
  const potato = choose(['potato', 'картоф']);
  const spinach = choose(['spinach', 'шпинат']);
  const drafts = [];
  if (egg)
    drafts.push({
      title: 'Simple fried eggs',
      minutes: 10,
      ingredients: [egg],
      steps: [
        'Crack the eggs into a clean bowl and check for shell fragments.',
        'Cook in a hot pan until both the whites and yolks are fully set.',
      ],
    });
  if (egg && (tomato || onion || spinach))
    drafts.push({
      title: 'Vegetable omelet',
      minutes: 18,
      ingredients: [egg, tomato || onion || spinach],
      steps: [
        'Wash and chop the vegetables.',
        'Cook the vegetables in a pan, add beaten eggs, and cook until fully set.',
      ],
    });
  if (potato)
    drafts.push({
      title: 'Boiled potatoes',
      minutes: 30,
      ingredients: [potato],
      steps: [
        'Wash the potatoes, peel if desired, and cut into pieces.',
        'Boil in drinking water until tender and serve hot.',
      ],
    });
  if (!drafts.length && tomato)
    drafts.push({
      title: 'Fresh tomato salad',
      minutes: 10,
      ingredients: [tomato],
      steps: ['Wash the tomatoes thoroughly.', 'Slice and serve right away.'],
    });
  if (!drafts.length) return [];
  return drafts.slice(0, 3).map((d, i) => {
    const ingredients = d.ingredients.map((item) => ({
      id: item.id,
      name: item.name,
      quantity:
        item.quantity == null
          ? 1
          : Math.min(
              item.quantity,
              item.unit === 'piece'
                ? Math.max(1, Math.min(servings, item.quantity))
                : item.quantity,
            ),
      unit: item.unit,
    }));
    return {
      id: `fallback_${i + 1}`,
      title: d.title,
      minutes: d.minutes,
      ingredients,
      steps: d.steps,
      servings,
      note: 'Simple fallback recipe. Check that you have enough ingredients and that this cooking method suits them.',
      nutrition: nutrition(ingredients, servings),
    };
  });
}
