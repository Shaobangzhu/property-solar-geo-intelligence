import type { PropertyLocation } from "./propertyLocation";

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

export function createPropertyNavigation(
  navigate: (property: PropertyLocation, signal: AbortSignal) => Promise<unknown>,
  onError: () => void,
) {
  let current: AbortController | null = null;

  return {
    move(property: PropertyLocation) {
      current?.abort();
      const controller = new AbortController();
      current = controller;
      void Promise.resolve()
        .then(() => controller.signal.aborted ? undefined : navigate(property, controller.signal))
        .catch((error: unknown) => {
          if (!controller.signal.aborted && !isAbortError(error)) onError();
        });
    },
    dispose() {
      current?.abort();
      current = null;
    },
  };
}
