import adapter from "@sveltejs/adapter-static";

export default {
  kit: {
    adapter: adapter(),
    prerender: {
      // The "Open app" CTA links to the external app origin, baked as the
      // __APP_URL__ sentinel at build time (PUBLIC_APP_URL=__APP_URL__) and
      // rewritten to the real URL by the container entrypoint
      // (docker-entrypoint.d/40-app-url.sh). The sentinel isn't an internal
      // route, so the prerender crawler's 404 on it is expected — swallow only
      // that one; a genuine broken internal link still throws.
      handleHttpError: ({ path, message }) => {
        if (path.includes("__APP_URL__")) return;
        throw new Error(message);
      },
    },
  },
};
