/// <reference types="nativewind/types" />

// TypeScript 6.0 turned on noUncheckedSideEffectImports by default, which
// flags `import "./global.css"` (TS2882) unless a module pattern is
// declared — react-native-css-interop's types (which nativewind/types
// re-exports) don't cover this yet. See:
// https://schalkneethling.com/posts/typescript-6-0-and-css-side-effect-imports-what-changed-and-how-to-fix-it/
declare module "*.css";
