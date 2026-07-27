import React from "react";
import { Platform, TextInput } from "react-native";

// App-wide TextInput that guarantees a visible dark text color and a consistent
// placeholder color on every input. Some Android devices (and forced dark mode)
// render input text white/invisible when no explicit `color` is set; injecting a
// dark color here fixes that everywhere at once.
//
// Instance props still win: the injected color is prepended to the style array,
// so any explicit `style={{ color }}` overrides it, and an explicit
// `placeholderTextColor` overrides the default. Refs are forwarded so callers
// that focus/blur the input keep working.
const DEFAULT_TEXT_COLOR = "#1B2B33";
const DEFAULT_PLACEHOLDER_COLOR = "#8895A0";

const AppTextInput = React.forwardRef(function AppTextInput(
  { style, placeholderTextColor, secureTextEntry, ...props },
  ref
) {
  const base = { color: DEFAULT_TEXT_COLOR };
  // Android renders the masked dots of a secureTextEntry field white (ignoring
  // `color`) unless a fontFamily is also set — force the built-in sans-serif so
  // typed passwords stay visible.
  if (secureTextEntry && Platform.OS === "android") base.fontFamily = "sans-serif";
  return (
    <TextInput
      ref={ref}
      secureTextEntry={secureTextEntry}
      style={[base, style]}
      placeholderTextColor={placeholderTextColor ?? DEFAULT_PLACEHOLDER_COLOR}
      {...props}
    />
  );
});

export default AppTextInput;
