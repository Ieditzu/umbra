const { getDefaultConfig } = require("expo/metro-config");
const apiProxy = require("./scripts/api-proxy.cjs");
const config = getDefaultConfig(__dirname);
const previous = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) =>
  apiProxy(previous ? previous(middleware, server) : middleware);
module.exports = config;
