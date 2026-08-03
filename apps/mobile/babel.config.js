module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      ["babel-preset-expo", { jsxImportSource: "nativewind" }],
      "nativewind/babel",
    ],
    // Lets drizzle-orm's generated migrations.js `import m0000 from './0000_x.sql'`
    // resolve to the raw SQL text at bundle time.
    plugins: [["inline-import", { extensions: [".sql"] }]],
  };
};
