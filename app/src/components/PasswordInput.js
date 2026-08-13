import React, { useState } from "react";
import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AppTextInput from "./AppTextInput";

// A password field with a built-in show/hide (eye) toggle. Drop-in replacement
// for a plain <TextInput secureTextEntry>. Any extra props are forwarded to the
// underlying input, so callers can still set value/onChangeText/placeholder etc.
const PasswordInput = React.forwardRef(function PasswordInput(
  { style, containerStyle, ...props },
  ref
) {
  const [show, setShow] = useState(false);
  return (
    <View style={[styles.row, containerStyle]}>
      <AppTextInput
        ref={ref}
        style={[styles.input, style]}
        secureTextEntry={!show}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
      />
      <TouchableOpacity
        style={styles.toggle}
        onPress={() => setShow((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={20} color="#0B6E8F" />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D6DEE3",
    borderRadius: 10,
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 0,
    backgroundColor: "transparent",
  },
  toggle: { paddingHorizontal: 12, paddingVertical: 10 },
});

export default PasswordInput;
