let open = $state(false);
let initialQuery = $state("");

export const searchPalette = {
  get isOpen() {
    return open;
  },
  get initialQuery() {
    return initialQuery;
  },
  open(query = "") {
    initialQuery = query;
    open = true;
  },
  close() {
    open = false;
  },
};
