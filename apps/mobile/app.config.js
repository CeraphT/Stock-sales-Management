// Extends app.json with build info read at build time: the commit the APK was
// built from and the build date, shown in the footer of every screen
// (src/components/AppVersionFooter.tsx) so two builds can be told apart.
const { execSync } = require('child_process');

module.exports = ({ config }) => {
  let buildCommit = null;
  try {
    buildCommit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    /* not a git checkout */
  }
  return {
    ...config,
    extra: {
      ...(config.extra ?? {}),
      buildCommit,
      buildDate: new Date().toISOString().slice(0, 10),
    },
  };
};
