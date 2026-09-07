const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const config = require(path.join(projectRoot, "desktop-config.json"));
const assetsDirectory = path.join(projectRoot, "myanalyze-frontend", "build", "assets");
const expectedApiUrl = `http://${config.apiHost}:${config.apiPort}`;

if (!fs.existsSync(assetsDirectory)) {
  throw new Error(`Brak katalogu builda frontendu: ${assetsDirectory}`);
}

const javascriptFiles = fs.readdirSync(assetsDirectory)
  .filter((fileName) => fileName.endsWith(".js"))
  .map((fileName) => path.join(assetsDirectory, fileName));

if (javascriptFiles.length === 0) {
  throw new Error("Build frontendu nie zawiera plików JavaScript.");
}

const bundle = javascriptFiles.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
const localApiUrls = [...bundle.matchAll(/http:\/\/(?:localhost|127\.0\.0\.1):(\d+)/g)]
  .map((match) => match[0]);
const unexpectedApiUrls = [...new Set(localApiUrls.filter((url) => url !== expectedApiUrl))];

if (!bundle.includes(expectedApiUrl)) {
  throw new Error(`Frontend nie zawiera oczekiwanego adresu API: ${expectedApiUrl}`);
}

if (unexpectedApiUrls.length > 0) {
  throw new Error(`Frontend zawiera niezgodne lokalne adresy API: ${unexpectedApiUrls.join(", ")}`);
}

console.log(`Desktop frontend API: ${expectedApiUrl} (OK)`);
