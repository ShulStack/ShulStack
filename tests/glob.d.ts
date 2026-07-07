// Minimal typing for Vite's import.meta.glob, used by convex-test module
// discovery. Avoids depending on vite/client types resolving under pnpm.
interface ImportMeta {
  glob: (pattern: string) => Record<string, () => Promise<unknown>>;
}
