import React, { useEffect, useState } from "react";
import {
  Modal,
  View,
  Image,
  TouchableOpacity,
  Text,
  StyleSheet,
  ScrollView,
  useWindowDimensions,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

// Full-size photo viewer. The strip on a listing or a bill is a preview;
// this opens one photo, or the whole set, large enough to read.
export default function PhotoLightbox({ visible, uris = [], startIndex = 0, onClose }) {
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(startIndex || 0);
  const [zoomed, setZoomed] = useState(false);
  const photos = (uris || []).filter(Boolean);

  useEffect(() => {
    if (!visible) return;
    const next = Number.isFinite(startIndex) ? startIndex : 0;
    setIndex(Math.min(Math.max(next, 0), Math.max(photos.length - 1, 0)));
    setZoomed(false);
  }, [visible, startIndex, photos.length]);

  if (!visible || photos.length === 0) return null;

  const go = (step) => {
    setZoomed(false);
    setIndex((current) => (current + step + photos.length) % photos.length);
  };

  const frameW = Math.max(width - 24, 280);
  const frameH = Math.max(height - 168, 240);

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.backdrop} testID="photo-lightbox">
        <View style={styles.top}>
          <Text style={styles.count}>
            {photos.length > 1 ? `${index + 1} of ${photos.length}` : "Photo"}
          </Text>
          <TouchableOpacity onPress={() => setZoomed((v) => !v)} testID="photo-zoom" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.action}>{zoomed ? "Fit" : "Zoom"}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Close photo" testID="photo-close" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.stage}
          contentContainerStyle={zoomed ? styles.stageZoom : styles.stageFit}
          maximumZoomScale={zoomed ? 3 : 1}
          minimumZoomScale={1}
          centerContent={!zoomed}
        >
          <Image
            source={{ uri: photos[index] }}
            resizeMode="contain"
            style={zoomed ? imageBox(frameW * 2, frameH * 2) : imageBox(frameW, frameH)}
          />
        </ScrollView>

        {photos.length > 1 ? (
          <View style={styles.nav}>
            <TouchableOpacity onPress={() => go(-1)} testID="photo-prev" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-back" size={30} color="#fff" />
            </TouchableOpacity>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.minis}>
              {photos.map((uri, i) => (
                <TouchableOpacity key={`${i}-${uri.slice(0, 24)}`} onPress={() => { setZoomed(false); setIndex(i); }}>
                  <Image source={{ uri }} style={[styles.mini, i === index && styles.miniOn]} />
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity onPress={() => go(1)} testID="photo-next" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="chevron-forward" size={30} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hint}>Pinch or tap Zoom to look closer.</Text>
        )}
      </View>
    </Modal>
  );
}

const imageBox = (width, height) => ({ width, height, objectFit: "contain", resizeMode: "contain" });

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: "#081014",
    ...(Platform.OS === "web"
      ? { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", zIndex: 1000 }
      : StyleSheet.absoluteFillObject),
  },
  top: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  count: { flex: 1, color: "#fff", fontWeight: "800", fontSize: 16 },
  action: { color: "#fff", fontWeight: "800", fontSize: 15 },
  stage: { flex: 1 },
  stageFit: { flexGrow: 1, alignItems: "center", justifyContent: "center" },
  stageZoom: { alignItems: "center", justifyContent: "center", padding: 12 },
  nav: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 10, paddingBottom: 18 },
  minis: { gap: 8, alignItems: "center", paddingVertical: 8 },
  mini: { width: 52, height: 52, borderRadius: 8, backgroundColor: "#1B2B33" },
  miniOn: { borderWidth: 2, borderColor: "#fff" },
  hint: { color: "#C5D2D8", textAlign: "center", paddingBottom: 22, fontSize: 13 },
});
