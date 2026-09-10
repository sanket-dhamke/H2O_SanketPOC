const pack = require("./brandPack.json");

const ICONS = {
  gatemate: require("../../assets/brand/gatemate/icon.png"),
  gatezo: require("../../assets/brand/gatezo/icon.png"),
};

const WORDMARKS = {
  gatemate: require("../../assets/brand/gatemate/icon.png"),
  gatezo: require("../../assets/brand/gatezo/wordmark.png"),
};

export const brand = pack.profiles[pack.active] || pack.profiles.gatemate;
export const brandIcon = ICONS[brand.id] || ICONS.gatemate;
export const brandWordmark = WORDMARKS[brand.id] || WORDMARKS.gatemate;
