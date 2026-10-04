// React can update an existing text node. Never restore the node's first-ever
// value after that update: keep the latest React value as the English source.
export function translatedValue(cache, target, key, current, translate, enabled) {
  let values = cache.get(target);
  if (!values) { values = new Map(); cache.set(target, values); }
  let state = values.get(key);
  if (!state || current !== state.rendered) state = { source: current };
  state.rendered = enabled ? translate(state.source) : state.source;
  values.set(key, state);
  return state.rendered;
}
