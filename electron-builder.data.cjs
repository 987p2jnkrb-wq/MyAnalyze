const base = require("./electron-builder.json");

module.exports = {
  ...base,
  artifactName: "MyAnalyze Setup ${version}-data.${ext}",
  extraResources: [
    {
      from: "dbmigration/myanalyz.data-release.sqlite",
      to: "db-template/myanalyz.sqlite",
    },
  ],
};
