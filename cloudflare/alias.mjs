// Share the existing authenticated backend and database at the shorter hostname.
// Forward the original Request so login, origin checks and revision headers survive.
export default {
  fetch(request, env) {
    return env.ACTIVITIES.fetch(request);
  }
};
