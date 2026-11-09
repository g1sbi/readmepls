// A page that lists articles client-side (home) can't be refreshed by
// invalidateAll(), so a successful save bumps this counter and such pages react.
let count = $state(0);

export const captureSaved = {
  get count() {
    return count;
  },
  notify() {
    count += 1;
  },
};
