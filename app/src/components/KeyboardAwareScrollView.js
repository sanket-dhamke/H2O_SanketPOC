import React from "react";
import { KeyboardAvoidingView, ScrollView, Platform } from "react-native";

// Full-screen form wrapper that keeps the focused input above the keyboard on
// both platforms. iOS uses "padding" (Modal/window doesn't resize); Android
// relies on the default adjustResize + a scrollable body. Taps pass through so
// buttons work on the first tap while the keyboard is open.
export default function KeyboardAwareScrollView({
  children,
  style,
  contentContainerStyle,
  keyboardVerticalOffset = 0,
  ...props
}) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={keyboardVerticalOffset}
    >
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        {...props}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
