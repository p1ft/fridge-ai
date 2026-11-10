const $ = (id) => document.getElementById(id);
let session = null;
let pendingPhotos = [];
let draftItems = [];
let busy = false;
let inventoryDirty = false;
const legacyEnglish = new Map([
  ['яйцо', 'egg'],
  ['яйца', 'eggs'],
  ['помидор', 'tomato'],
  ['помидоры', 'tomatoes'],
  ['лук', 'onion'],
  ['луковица', 'onion'],
  ['луковицы', 'onions'],
  ['Завтрак', 'Breakfast'],
  ['Яичница с помидорами', 'Scrambled Eggs with Tomatoes'],
  ['Яичница с луком', 'Scrambled Eggs with Onion'],
  ['Томатный омлет с луком', 'Tomato and Onion Omelet'],
  ['Нарезать помидоры и обжарить их.', 'Slice the tomatoes and sauté them.'],
  [
    'Разбить яйца в сковороду к помидорам и тщательно прожарить до готовности яиц.',
    'Crack the eggs into the pan with the tomatoes and cook thoroughly.',
  ],
  [
    'Мелко нарезать лук и обжарить до мягкости.',
    'Finely chop the onion and sauté until soft.',
  ],
  [
    'Добавить яйца и тщательно обжарить их до полного приготовления.',
    'Add the eggs and cook thoroughly.',
  ],
  [
    'Мелко нарезать лук и помидоры, затем обжарить овощи.',
    'Finely chop the onion and tomatoes, then sauté the vegetables.',
  ],
  [
    'Взбить яйца, залить ими овощи и тщательно прожарить до готовности.',
    'Beat the eggs, pour them over the vegetables, and cook thoroughly.',
  ],
  [
    'Локальный шаблон. Проверьте, хватает ли продуктов и подходит ли способ приготовления.',
    'Simple fallback recipe. Check that you have enough ingredients and that this cooking method suits them.',
  ],
  [
    'AI не вернул проверяемых рецептов. Показаны простые шаблоны.',
    'The AI response did not pass recipe checks. Showing simple templates.',
  ],
  [
    'AI временно недоступен. Показаны простые шаблоны.',
    'AI is temporarily unavailable. Showing simple templates.',
  ],
]);
const english = (value) =>
  legacyEnglish.get(value) || String(value).replace(/^Сессия/, 'Session');

function notice(message, error = false) {
  const box = $('notice');
  box.textContent = message;
  box.classList.toggle('error', error);
  box.classList.remove('hidden');
  clearTimeout(notice.timer);
  notice.timer = setTimeout(() => box.classList.add('hidden'), 8000);
}
async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function setBusy(value) {
  busy = value;
  for (const id of ['new-session', 'analyze', 'save-inventory', 'generate'])
    $(id).disabled = value;
}
async function run(action) {
  if (busy) return;
  setBusy(true);
  try {
    await action();
  } catch (error) {
    notice(error.message, true);
  } finally {
    setBusy(false);
  }
}
function showAuth(authed, protectedDemo = false) {
  $('login-panel').classList.toggle('hidden', authed);
  $('workspace').classList.toggle('hidden', !authed);
  $('logout').classList.toggle('hidden', !authed || !protectedDemo);
}
function itemRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'inventory-row';
  const name = document.createElement('input');
  name.placeholder = 'Ingredient';
  name.value = english(item.name || '');
  name.setAttribute('aria-label', 'Ingredient');
  const qty = document.createElement('input');
  qty.type = 'number';
  qty.min = '0.01';
  qty.step = 'any';
  qty.placeholder = 'Qty';
  qty.value = item.quantity ?? '';
  qty.setAttribute('aria-label', 'Quantity');
  const unit = document.createElement('select');
  unit.setAttribute('aria-label', 'Unit');
  for (const [value, label] of [
    ['piece', 'pcs'],
    ['g', 'g'],
    ['ml', 'ml'],
  ]) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    unit.append(option);
  }
  unit.value = item.unit || 'piece';
  const remove = document.createElement('button');
  remove.className = 'remove-item';
  remove.type = 'button';
  remove.textContent = '×';
  remove.setAttribute('aria-label', 'Remove ingredient');
  remove.onclick = () => {
    row.remove();
    inventoryDirty = true;
  };
  row.dataset.id =
    item.id || crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  row.append(name, qty, unit, remove);
  return row;
}
function renderItems(items) {
  const holder = $('inventory-rows');
  holder.replaceChildren();
  (items.length ? items : [{}]).forEach((item) => holder.append(itemRow(item)));
  inventoryDirty = false;
}
function readItems() {
  return [...$('inventory-rows').children]
    .map((row) => ({
      id: row.dataset.id,
      name: row.children[0].value.trim(),
      quantity: row.children[1].value ? Number(row.children[1].value) : null,
      unit: row.children[2].value,
    }))
    .filter((i) => i.name);
}
function renderRecipes() {
  const holder = $('recipe-results');
  holder.replaceChildren();
  const state = session?.state || {};
  $('recipe-warning').textContent = state.warning || '';
  for (const recipe of state.recipes || []) {
    const card = document.createElement('article');
    card.className = 'recipe';
    const top = document.createElement('div');
    top.className = 'recipe-top';
    const h = document.createElement('h3');
    h.textContent = english(recipe.title);
    const tag = document.createElement('span');
    tag.className = 'source-tag';
    tag.textContent =
      state.source === 'gemini' ? 'AI RECIPE' : 'SIMPLE TEMPLATE';
    top.append(h, tag);
    card.append(top);
    const meta = document.createElement('p');
    meta.className = 'recipe-meta';
    meta.textContent = `${recipe.servings} servings · ${recipe.minutes ? `${recipe.minutes} min` : 'time varies by ingredient'}`;
    card.append(meta);
    const list = document.createElement('ul');
    for (const i of recipe.ingredients) {
      const unit =
        i.unit === 'piece' ? (i.quantity === 1 ? 'pc' : 'pcs') : i.unit;
      const li = document.createElement('li');
      li.textContent = `${english(i.name)} — ${i.quantity} ${unit}`;
      list.append(li);
    }
    card.append(list);
    const steps = document.createElement('ol');
    for (const step of recipe.steps) {
      const li = document.createElement('li');
      li.textContent = english(step);
      steps.append(li);
    }
    card.append(steps);
    if (recipe.note) {
      const p = document.createElement('p');
      p.textContent = english(recipe.note);
      card.append(p);
    }
    if (recipe.nutrition) {
      const n = recipe.nutrition;
      const p = document.createElement('p');
      p.className = 'nutrition';
      p.textContent = `Per serving: ${n.per_serving.kcal} kcal · Protein ${n.per_serving.protein_g} g · Fat ${n.per_serving.fat_g} g · Carbs ${n.per_serving.carbohydrates_g} g. ${n.coverage === 'partial' ? `Partial estimate; not included: ${n.missing.join(', ')}.` : 'Estimated for all ingredients.'} Source: USDA.`;
      card.append(p);
    }
    holder.append(card);
  }
}
function renderSession() {
  draftItems = structuredClone(session?.state?.inventory || []);
  renderItems(draftItems);
  renderRecipes();
  $('saved-label').textContent = session
    ? `Saved · version ${session.revision}`
    : '';
  const pref = session?.state?.preferences || {};
  $('servings').value = pref.servings || 2;
  $('wish').value = english(pref.wish || '');
  $('exclusions').value = english(pref.exclusions || '');
}
async function refreshSessions() {
  const { sessions } = await api('sessions');
  const holder = $('sessions-list');
  holder.replaceChildren();
  for (const s of sessions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `session-button${s.id === session?.id ? ' active' : ''}`;
    const title = document.createElement('strong');
    title.textContent = english(s.state?.title || 'Session');
    const date = document.createElement('small');
    date.textContent = new Date(s.updated_at).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    b.append(title, date);
    b.onclick = () =>
      run(async () => {
        session = (await api(`sessions?id=${encodeURIComponent(s.id)}`))
          .session;
        renderSession();
        await refreshSessions();
      });
    holder.append(b);
  }
}
async function newSession() {
  session = (await api('sessions', { method: 'POST', body: '{}' })).session;
  renderSession();
  await refreshSessions();
}
async function boot() {
  try {
    const auth = await api('auth');
    showAuth(auth.authenticated, auth.protected);
    if (!auth.authenticated) return;
    const { sessions } = await api('sessions');
    if (sessions.length) {
      session = (await api(`sessions?id=${encodeURIComponent(sessions[0].id)}`))
        .session;
      renderSession();
      await refreshSessions();
    } else await newSession();
  } catch (error) {
    notice(error.message, true);
  }
}
async function compress(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.78,
    blob;
  do {
    blob = await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    quality -= 0.12;
  } while (blob.size > 850_000 && quality > 0.35);
  if (blob.size > 950_000)
    throw new Error('Could not reduce the photo to the supported size.');
  return {
    mimeType: 'image/jpeg',
    data: await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }),
  };
}

$('login-form').onsubmit = (event) => {
  event.preventDefault();
  run(async () => {
    await api('auth', {
      method: 'POST',
      body: JSON.stringify({ code: $('access-code').value }),
    });
    $('access-code').value = '';
    showAuth(true, true);
    await boot();
  });
};
$('logout').onclick = () =>
  run(async () => {
    await api('auth', { method: 'DELETE' });
    session = null;
    showAuth(false);
  });
$('new-session').onclick = () => run(newSession);
$('inventory-rows').addEventListener('input', () => {
  inventoryDirty = true;
});
$('inventory-rows').addEventListener('change', () => {
  inventoryDirty = true;
});
$('add-item').onclick = () => {
  $('inventory-rows').append(itemRow());
  inventoryDirty = true;
};
$('photos').onchange = () => {
  pendingPhotos = [...$('photos').files].slice(0, 3);
  $('photo-count').textContent = pendingPhotos.length
    ? `${pendingPhotos.length} photo${pendingPhotos.length === 1 ? '' : 's'} selected`
    : '';
  if ($('photos').files.length > 3)
    notice('You can select up to 3 photos.', true);
};
$('analyze').onclick = () =>
  run(async () => {
    if (!pendingPhotos.length) throw new Error('Choose a photo first.');
    const images = await Promise.all(pendingPhotos.map(compress));
    const result = await api('vision', {
      method: 'POST',
      body: JSON.stringify({ images }),
    });
    renderItems(result.items);
    inventoryDirty = true;
    notice(
      `${result.items.length} ingredient${result.items.length === 1 ? '' : 's'} recognized. Review and save your list.`,
    );
  });
$('save-inventory').onclick = () =>
  run(async () => {
    if (!session) throw new Error('Create a session first.');
    const items = readItems();
    if (!items.length) throw new Error('Add at least one ingredient.');
    session = (
      await api('sessions', {
        method: 'PATCH',
        body: JSON.stringify({
          id: session.id,
          revision: session.revision,
          inventory: items,
        }),
      })
    ).session;
    renderSession();
    await refreshSessions();
    notice('Ingredients saved.');
  });
$('generate').onclick = () =>
  run(async () => {
    if (!session?.state?.inventory?.length)
      throw new Error('Save your ingredients first.');
    if (inventoryDirty)
      throw new Error('You changed the list. Save your ingredients first.');
    session = (
      await api('recipes', {
        method: 'POST',
        body: JSON.stringify({
          id: session.id,
          revision: session.revision,
          servings: Number($('servings').value),
          wish: $('wish').value,
          exclusions: $('exclusions').value,
        }),
      })
    ).session;
    renderRecipes();
    await refreshSessions();
    if (session.state.source === 'fallback')
      notice(session.state.warning || 'Showing simple recipe templates.');
    else notice('Your recipes are ready.');
  });
boot();
