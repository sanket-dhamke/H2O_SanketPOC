import React from "react";
import { KeyboardAvoidingView, Platform } from "react-native";

// Drop-in replacement for a centered Modal overlay <View>. Wrapping the overlay
// in a KeyboardAvoidingView lifts the (vertically-centered) modal card above the
// keyboard on iOS, so inputs near the bottom of a form stay visible while
// typing. On Android the default adjustResize already re-centers the card, so we
// leave behavior undefined there to avoid double-shifting.
export default function KeyboardAvoider({ style, children, ...props }) {
  return (
    <KeyboardAvoidingView
      style={style}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      {...props}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
