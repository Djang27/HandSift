import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Testing Library only auto-cleans with Vitest globals enabled; unmount explicitly instead.
afterEach(() => {
  cleanup();
});
