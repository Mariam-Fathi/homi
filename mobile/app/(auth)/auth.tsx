import images from "@/constants/images";
import { useAuthStore } from "@/store/authStore";
import { Redirect } from "expo-router";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { notify } from "@/lib/dialog";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import type { CountryCode } from "libphonenumber-js/max";

import PhoneInput from "@/components/PhoneInput";
import { DEFAULT_COUNTRY } from "@/constants/countries";
import { checkPhone } from "@/lib/phone";
import { track } from "@/lib/analytics";
import { useScreenView } from "@/lib/analytics/hooks";

const Auth = () => {
  const { isAuthenticated, loading, loginWithPhone, loginAsGuest } =
    useAuthStore();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState<CountryCode>(DEFAULT_COUNTRY);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState<"phone" | "guest" | null>(null);
  useScreenView("auth");

  const trimmedName = name.trim().replace(/\s+/g, " ");
  const nameError = trimmedName.length < 2 ? "Enter your name" : null;
  const phoneResult = checkPhone(phone, country, { mobileOnly: true });
  const phoneError = phoneResult.valid ? null : phoneResult.error;

  const run = async (kind: "phone" | "guest", attempt: () => Promise<void>) => {
    try {
      setBusy(kind);
      await attempt();
    } catch (error) {
      track("sign_in_failed", { reason: "server_error" });
      notify(
        "Sign-in failed",
        error instanceof Error ? error.message : "Please try again."
      );
    } finally {
      setBusy(null);
    }
  };

  const handleContinue = () => {
    setSubmitted(true);
    if (nameError || !phoneResult.valid) {
      track("sign_in_failed", {
        reason: nameError
          ? "invalid_name"
          : phoneError === "Enter a mobile number"
          ? "not_mobile"
          : "invalid_phone",
      });
      return;
    }
    run("phone", () =>
      loginWithPhone({ name: trimmedName, phone: phoneResult.e164, country })
    );
  };

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#0061FF" />
      </View>
    );
  }

  if (isAuthenticated) return <Redirect href="/(root)/(tabs)/home" />;

  return (
    <SafeAreaView className="flex-1 bg-white">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        className="flex-1"
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="pb-10"
          showsVerticalScrollIndicator={false}
        >
          {/* Explicit style: the className height isn't applied to images on web. */}
          <Image
            source={images.onboarding}
            style={{ width: "100%", height: 260 }}
            resizeMode="cover"
          />

          <View className="px-6 mt-6">
            <Text className="text-base text-center uppercase font-rubik text-black-200 tracking-wider">
              Welcome To Homi
            </Text>
            <Text className="text-3xl font-rubik-bold text-black-300 text-center mt-2 leading-10">
              Let's Get You Closer To{"\n"}
              <Text className="text-primary-300">Your Ideal Home</Text>
            </Text>

            <Text className="text-base font-rubik-medium text-black-300 mt-8 mb-2">
              Your name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Mariam Fathi"
              autoComplete="name"
              textContentType="name"
              autoCapitalize="words"
              maxLength={80}
              className={`border rounded-xl px-4 py-3 font-rubik text-black-300 ${
                submitted && nameError ? "border-red-500" : "border-primary-200"
              }`}
            />
            {submitted && nameError ? (
              <Text className="text-xs font-rubik text-red-600 mt-1">
                {nameError}
              </Text>
            ) : null}

            <Text className="text-base font-rubik-medium text-black-300 mt-4 mb-2">
              Mobile number
            </Text>
            <PhoneInput
              country={country}
              onCountryChange={setCountry}
              value={phone}
              onChangeText={setPhone}
              error={submitted ? phoneError : null}
            />

            <TouchableOpacity
              onPress={handleContinue}
              disabled={busy !== null}
              className="bg-primary-300 rounded-full w-full py-4 mt-6 items-center"
            >
              {busy === "phone" ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="text-lg font-rubik-bold text-white">
                  Continue
                </Text>
              )}
            </TouchableOpacity>

            <View className="flex-row items-center my-4">
              <View className="flex-1 h-px bg-primary-200" />
              <Text className="mx-3 font-rubik text-black-100">or</Text>
              <View className="flex-1 h-px bg-primary-200" />
            </View>

            <TouchableOpacity
              onPress={() => run("guest", loginAsGuest)}
              disabled={busy !== null}
              className="border border-primary-300 rounded-full w-full py-4 items-center"
            >
              {busy === "guest" ? (
                <ActivityIndicator color="#0061FF" />
              ) : (
                <Text className="text-lg font-rubik-medium text-primary-300">
                  Continue as Guest
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

export default Auth;
