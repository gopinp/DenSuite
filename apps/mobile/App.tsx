import { useState } from "react";
import { StatusBar } from "expo-status-bar";
import Svg, { Path } from "react-native-svg";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type Screen = "login" | "register-choice" | "employer-register" | "employee-register" | "forgot";
type PracticeSetup = "single" | "multiple";

export default function App() {
  const [screen, setScreen] = useState<Screen>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [practiceSetup, setPracticeSetup] = useState<PracticeSetup>("single");
  const isRegister = screen === "employer-register" || screen === "employee-register";
  const isEmployer = screen === "employer-register";

  const showNotConnected = () => {
    Alert.alert(
      "Not connected yet",
      "Authentication will be available when the Den Suite account service is connected.",
    );
  };

  const submitLogin = () => {
    if (!username.trim() || !password) {
      Alert.alert("Complete your details", "Enter your username and password to continue.");
      return;
    }
    showNotConnected();
  };

  const submitRegistration = () => {
    if (!username.trim() || !password || !confirmPassword || !joinCode.trim()) {
      Alert.alert("Complete your details", "Fill in every field to create your account.");
      return;
    }
    if (password !== confirmPassword) {
      Alert.alert("Passwords don't match", "Check your password and confirmation, then try again.");
      return;
    }
    showNotConnected();
  };

  const submitPasswordReset = () => {
    if (!username.trim()) {
      Alert.alert("Enter your username", "We need your username to help reset your password.");
      return;
    }
    showNotConnected();
  };

  const heading =
    screen === "register-choice"
      ? "Join Den Suite"
      : isEmployer
        ? "Register your practice"
        : screen === "employee-register"
          ? "Join your practice"
          : screen === "forgot"
            ? "Reset your password"
            : "Welcome back";
  const description =
    screen === "register-choice"
      ? "Choose the option that best describes you."
      : isEmployer
        ? "Start your Den Suite practice account with a code from Den Suite Admin."
        : screen === "employee-register"
          ? "Create your employee account with a code from your practice manager."
          : screen === "forgot"
            ? "Enter your username and we'll help you get back in."
            : "Sign in to your Den Suite practice workspace.";

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.topLine}>
          <View style={styles.brand}>
            <View style={styles.brandMark}>
              <Svg width={25} height={25} viewBox="0 0 32 32">
                <Path
                  d="M16 3.5c-5.4 0-9.6 3.3-9.6 8.5 0 4.3 2.1 7 3.1 11.2.6 2.4 1.2 5.2 3 5.2 1.3 0 1.8-2.4 2.1-4.6.3-2.1.6-3.3 1.4-3.3s1.1 1.2 1.4 3.3c.3 2.2.8 4.6 2.1 4.6 1.8 0 2.4-2.8 3-5.2 1-4.2 3.1-6.9 3.1-11.2 0-5.2-4.2-8.5-9.6-8.5Z"
                  fill="#fff"
                />
                <Path
                  d="M11.5 12.5h9m-4.5-4.5v9"
                  stroke="#6554cb"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </View>
            <Text style={styles.brandName}>
              Den <Text style={styles.brandLight}>Suite</Text>
            </Text>
          </View>
          <Text style={styles.secureLabel}>PRACTICE PORTAL</Text>
        </View>

        <View style={styles.intro}>
          <View style={styles.eyebrowRow}>
            <View style={styles.eyebrowDot} />
            <Text style={styles.eyebrow}>YOUR PRACTICE, CONNECTED</Text>
          </View>
          <Text style={styles.heading}>{heading}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>

        <View style={styles.card}>
          {screen === "register-choice" ? (
            <View style={styles.registerOptions}>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setScreen("employer-register")}
                style={styles.registerOption}
              >
                <View style={styles.optionIcon}><Text style={styles.optionIconText}>✦</Text></View>
                <View style={styles.registerOptionCopy}>
                  <Text style={styles.registerOptionTitle}>I'm an employer</Text>
                  <Text style={styles.registerOptionDescription}>
                    Register your practice or practice group with a Den Suite Admin code.
                  </Text>
                </View>
                <Text style={styles.optionArrow}>›</Text>
              </TouchableOpacity>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => setScreen("employee-register")}
                style={styles.registerOption}
              >
                <View style={[styles.optionIcon, styles.employeeOptionIcon]}>
                  <Text style={styles.optionIconText}>＋</Text>
                </View>
                <View style={styles.registerOptionCopy}>
                  <Text style={styles.registerOptionTitle}>I'm an employee</Text>
                  <Text style={styles.registerOptionDescription}>
                    Join an existing practice with an invite code from your practice manager.
                  </Text>
                </View>
                <Text style={styles.optionArrow}>›</Text>
              </TouchableOpacity>
              <View style={styles.switchRow}>
                <Text style={styles.switchPrompt}>Already have an account?</Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => setScreen("login")}>
                  <Text style={styles.switchLink}>Sign in</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <>
              {screen !== "forgot" && (
                <View style={styles.formHeading}>
                  <Text style={styles.formTitle}>
                    {isRegister ? (isEmployer ? "Practice details" : "Employee details") : "Sign in"}
                  </Text>
                  {isRegister && (
                    <Text style={styles.stepLabel}>
                      {isEmployer ? "PRACTICE SETUP" : "EMPLOYEE ACCOUNT"}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>Username</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="username"
                  onChangeText={setUsername}
                  placeholder="Enter your username"
                  placeholderTextColor="#a4a6b4"
                  returnKeyType="next"
                  style={styles.input}
                  textContentType="username"
                  value={username}
                />
              </View>

              {screen !== "forgot" && (
                <View style={styles.field}>
                  <Text style={styles.label}>Password</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete={isRegister ? "new-password" : "current-password"}
                    onChangeText={setPassword}
                    onSubmitEditing={screen === "login" ? submitLogin : undefined}
                    placeholder={isRegister ? "Create a password" : "Enter your password"}
                    placeholderTextColor="#a4a6b4"
                    returnKeyType={screen === "login" ? "done" : "next"}
                    secureTextEntry
                    style={styles.input}
                    textContentType={isRegister ? "newPassword" : "password"}
                    value={password}
                  />
                </View>
              )}

              {isRegister && (
                <>
                  <View style={styles.field}>
                    <Text style={styles.label}>Confirm password</Text>
                    <TextInput
                      autoCapitalize="none"
                      autoComplete="new-password"
                      onChangeText={setConfirmPassword}
                      placeholder="Enter your password again"
                      placeholderTextColor="#a4a6b4"
                      returnKeyType="next"
                      secureTextEntry
                      style={styles.input}
                      textContentType="newPassword"
                      value={confirmPassword}
                    />
                  </View>

                  <View style={styles.field}>
                    <Text style={styles.label}>
                      {isEmployer ? "Den Suite Admin join code" : "Practice join code"}
                    </Text>
                    <TextInput
                      autoCapitalize="characters"
                      autoCorrect={false}
                      onChangeText={setJoinCode}
                      placeholder={
                        isEmployer
                          ? "Enter the code from Den Suite Admin"
                          : "Enter the code from your practice manager"
                      }
                      placeholderTextColor="#a4a6b4"
                      returnKeyType="done"
                      style={styles.input}
                      value={joinCode}
                    />
                    <Text style={styles.fieldHint}>
                      {isEmployer
                        ? "Get your practice setup code from your Den Suite administrator."
                        : "Ask your practice manager for an employee invite code."}
                    </Text>
                  </View>

                  {isEmployer && (
                    <View style={styles.field}>
                      <Text style={styles.label}>Practice setup</Text>
                      <View style={styles.radioGroup}>
                        {(
                          [
                            ["single", "Single practice", "One practice location"],
                            ["multiple", "Multiple practices", "More than one location"],
                          ] as const
                        ).map(([value, title, caption]) => {
                          const selected = practiceSetup === value;
                          return (
                            <TouchableOpacity
                              accessibilityRole="radio"
                              accessibilityState={{ checked: selected }}
                              key={value}
                              onPress={() => setPracticeSetup(value)}
                              style={[styles.radioOption, selected && styles.radioOptionSelected]}
                            >
                              <View style={[styles.radio, selected && styles.radioSelected]}>
                                {selected && <View style={styles.radioInner} />}
                              </View>
                              <View style={styles.radioCopy}>
                                <Text style={styles.radioTitle}>{title}</Text>
                                <Text style={styles.radioCaption}>{caption}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                </>
              )}

              {screen === "login" && (
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() => setScreen("forgot")}
                  style={styles.forgotLink}
                >
                  <Text style={styles.forgotText}>Forgot password?</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                accessibilityRole="button"
                onPress={
                  isRegister
                    ? submitRegistration
                    : screen === "forgot"
                      ? submitPasswordReset
                      : submitLogin
                }
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>
                  {isEmployer
                    ? "Register practice"
                    : screen === "employee-register"
                      ? "Create employee account"
                      : screen === "forgot"
                        ? "Continue"
                        : "Sign in"}
                </Text>
                <Text style={styles.buttonArrow}>›</Text>
              </TouchableOpacity>

              <View style={styles.switchRow}>
                <Text style={styles.switchPrompt}>
                  {isRegister
                    ? "Already have an account?"
                    : screen === "forgot"
                      ? "Remember your password?"
                      : "New to Den Suite?"}
                </Text>
                <TouchableOpacity
                  accessibilityRole="button"
                  onPress={() =>
                    setScreen(isRegister || screen === "forgot" ? "login" : "register-choice")
                  }
                >
                  <Text style={styles.switchLink}>
                    {isRegister || screen === "forgot" ? "Sign in" : "Register"}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={styles.trustNote}>
          <Text style={styles.trustIcon}>✦</Text>
          <Text style={styles.trustText}>Made for the people behind every healthy smile.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f8f8fb" },
  scrollContent: { flexGrow: 1, paddingHorizontal: 23, paddingTop: 19, paddingBottom: 26 },
  topLine: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  brandMark: {
    width: 34,
    height: 34,
    borderRadius: 11,
    backgroundColor: "#6756d4",
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: { color: "#292842", fontSize: 20, fontWeight: "800", letterSpacing: -0.7 },
  brandLight: { fontWeight: "500" },
  secureLabel: { color: "#9a9bad", fontSize: 9, fontWeight: "700", letterSpacing: 1 },
  intro: { marginTop: 48, marginBottom: 25 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 11 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#d69b67" },
  eyebrow: { color: "#8174c3", fontSize: 9, fontWeight: "800", letterSpacing: 1.2 },
  heading: { color: "#282a40", fontSize: 29, fontWeight: "700", letterSpacing: -1 },
  description: { marginTop: 8, color: "#85889a", fontSize: 13, lineHeight: 19 },
  card: {
    borderWidth: 1,
    borderColor: "#edecf2",
    borderRadius: 18,
    backgroundColor: "#fff",
    padding: 20,
    shadowColor: "#222044",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 2,
  },
  formHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 21,
  },
  formTitle: { color: "#303349", fontSize: 15, fontWeight: "700" },
  stepLabel: { color: "#999baa", fontSize: 8, fontWeight: "700", letterSpacing: 0.9 },
  registerOptions: { gap: 10 },
  registerOption: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#e8e8ef",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 12,
  },
  optionIcon: {
    width: 37,
    height: 37,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#f0edff",
  },
  employeeOptionIcon: { backgroundColor: "#e9f7f3" },
  optionIconText: { color: "#7561ce", fontSize: 17 },
  registerOptionCopy: { flex: 1, gap: 4 },
  registerOptionTitle: { color: "#303349", fontSize: 12, fontWeight: "700" },
  registerOptionDescription: { color: "#85889a", fontSize: 10, lineHeight: 14 },
  optionArrow: { color: "#8c83c4", fontSize: 24 },
  field: { marginBottom: 17 },
  label: { color: "#44465a", fontSize: 11, fontWeight: "700", marginBottom: 7 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#e8e8ef",
    borderRadius: 10,
    backgroundColor: "#fdfdfe",
    paddingHorizontal: 13,
    color: "#303349",
    fontSize: 13,
  },
  fieldHint: { marginTop: 7, color: "#9294a4", fontSize: 10, lineHeight: 15 },
  select: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e8e8ef",
    borderRadius: 10,
    backgroundColor: "#fdfdfe",
    paddingHorizontal: 13,
  },
  selectValue: { color: "#303349", fontSize: 13 },
  selectChevron: { color: "#85889a", fontSize: 18 },
  optionList: {
    borderWidth: 1,
    borderColor: "#e8e8ef",
    borderRadius: 10,
    marginTop: 5,
    overflow: "hidden",
  },
  option: {
    minHeight: 43,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 13,
    backgroundColor: "#fff",
  },
  optionText: { color: "#44465a", fontSize: 12 },
  optionCheck: { color: "#6554cb", fontSize: 15, fontWeight: "700" },
  radioGroup: { gap: 8 },
  radioOption: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e8e8ef",
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  radioOptionSelected: { borderColor: "#887bd5", backgroundColor: "#f8f6ff" },
  radio: {
    width: 17,
    height: 17,
    borderWidth: 1.5,
    borderColor: "#c8c8d3",
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 11,
  },
  radioSelected: { borderColor: "#6554cb" },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#6554cb" },
  radioCopy: { flex: 1 },
  radioTitle: { color: "#3d3f53", fontSize: 11, fontWeight: "700" },
  radioCaption: { color: "#9092a1", fontSize: 9, marginTop: 3 },
  forgotLink: { alignSelf: "flex-end", marginTop: -4, marginBottom: 18 },
  forgotText: { color: "#6b5acb", fontSize: 11, fontWeight: "600" },
  primaryButton: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: "#6554cb",
    marginTop: 2,
  },
  primaryButtonText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  buttonArrow: { color: "#d9d3ff", fontSize: 22, lineHeight: 24, marginLeft: 8 },
  switchRow: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 19 },
  switchPrompt: { color: "#85889a", fontSize: 11 },
  switchLink: { color: "#6554cb", fontSize: 11, fontWeight: "700" },
  trustNote: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: "auto",
    paddingTop: 28,
  },
  trustIcon: { color: "#b4a7ee", fontSize: 13 },
  trustText: { color: "#a1a3b1", fontSize: 9 },
});
