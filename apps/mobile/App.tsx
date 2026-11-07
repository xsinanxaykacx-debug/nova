import { StatusBar } from "expo-status-bar";
import { Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";

// TODO: Mobile E2EE requires a custom dev build with react-native-quick-crypto.
// crypto.subtle is not available in RN/Expo Go. Do not claim E2EE on mobile until this is ported and audited.

export default function App() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <Text style={styles.brand}>NABER</Text>
        <Text style={styles.subtitle}>Connect. Chat. Share.</Text>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            {"Mobil uygulama geli\u015ftirme a\u015famas\u0131nda. \u015eifreli sohbet \u015fu an yaln\u0131zca web'de kullan\u0131labilir."}
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.webButton, pressed && styles.webButtonPressed]}
          // TODO: Replace the placeholder with the deployed NOVA web URL.
          onPress={() => {
            const url = "https://<web-url>";
            if (url.includes("<web-url>")) {
              // Placeholder URL: do nothing until deployed web URL is set.
              return;
            }
            void Linking.openURL(url).catch(() => {});
          }}
        >
          <Text style={styles.webButtonText}>{"Web'i A\u00e7"}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#080B14" },
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  brand: {
    color: "#F8FAFC",
    fontSize: 32,
    fontWeight: "700",
    letterSpacing: 2,
  },
  subtitle: { color: "#A78BFA", marginTop: 12, fontSize: 15 },
  infoBox: {
    width: "100%",
    marginTop: 32,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#111827",
  },
  infoText: {
    color: "#CBD5E1",
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  webButton: {
    width: "100%",
    marginTop: 18,
    paddingVertical: 15,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#7C3AED",
  },
  webButtonPressed: { opacity: 0.8 },
  webButtonText: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
});
