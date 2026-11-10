import assert from 'node:assert/strict';
import test from 'node:test';
import { fallback, inventory, nutrition, recipes } from '../lib/domain.js';

test('normalizes confirmed inventory and rejects invalid quantities', () => {
  assert.deepEqual(
    inventory([{ id: 'egg', name: ' Egg ', quantity: 4, unit: 'piece' }]),
    [{ id: 'egg', name: 'Egg', quantity: 4, unit: 'piece' }],
  );
  assert.throws(() =>
    inventory([{ name: 'Egg', quantity: -1, unit: 'piece' }]),
  );
});
test('rejects recipe that exceeds confirmed inventory', () => {
  const items = inventory([
    { id: 'egg', name: 'eggs', quantity: 2, unit: 'piece' },
  ]);
  const output = recipes(
    {
      recipes: [
        {
          title: 'Eggs',
          minutes: 10,
          ingredients: [{ id: 'egg', quantity: 3, unit: 'piece' }],
          steps: ['Break eggs', 'Cook thoroughly'],
        },
      ],
    },
    items,
    2,
  );
  assert.equal(output.length, 0);
});
test('nutrition is per serving and explicit about partial coverage', () => {
  const complete = nutrition([{ name: 'eggs', quantity: 2, unit: 'piece' }], 2);
  assert.equal(complete.coverage, 'complete');
  assert.equal(complete.per_serving.kcal, 71.5);
  assert.equal(
    nutrition([{ name: 'яйца', quantity: 2, unit: 'piece' }], 2).per_serving
      .kcal,
    71.5,
  );
  const partial = nutrition(
    [{ name: 'mystery', quantity: 1, unit: 'piece' }],
    1,
  );
  assert.deepEqual(partial.missing, ['mystery']);
});
test('fallback remains available and labels unknown inventory honestly', () => {
  const items = inventory([
    { id: 'egg', name: 'eggs', quantity: null, unit: 'piece' },
  ]);
  const output = fallback(items, 2);
  assert.equal(output.length, 1);
  assert.match(output[0].note, /Check/);
});
