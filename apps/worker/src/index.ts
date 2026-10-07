import { route } from "./router";

export default {
  fetch(request) {
    return route(request);
  },
} satisfies ExportedHandler<Env>;
