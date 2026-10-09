// Expo projects must use Expo's Metro config (asset handling, serializer, EXPO_* env)
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
