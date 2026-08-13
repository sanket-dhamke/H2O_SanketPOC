import React from "react";
import { KeyboardAvoidingView, Platform } from "react-native";

// Drop-in replacement for a centered Modal overlay <View>. Wrapping the overlay
// in a KeyboardAvoidingView keeps the vertically-centered modal card above the
// keyboard so inputs near the bottom of a form stay visible while typing.
//
// A React Native <Modal> renders in its own window that does NOT resize with the
// keyboard on Android, so leaving behavior undefined there was a no-op (the card
// never moved and the keyboard hid the fields). KeyboardAvoidingView listens to
// JS keyboard events regardless of window, so an explicit behavior works inside
// modals on both platforms: "padding" on iOS, "height" on Android (the combo
// that reliably re-centers the card above the keyboard).
export default function KeyboardAvoider({ style, keyboardVerticalOffset = 0, children, ...props }) {
  return (
    <KeyboardAvoidingView
      style={style}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={keyboardVerticalOffset}
      {...props}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
