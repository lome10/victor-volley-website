// "~/..." = codice dell'app (mobile/src). I pacchetti si cercano solo in mobile/node_modules,
// per non prendere quelli del sito (cartella sopra).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
