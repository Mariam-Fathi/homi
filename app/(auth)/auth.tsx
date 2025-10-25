import icons from "@/constants/icons";
import images from "@/constants/images";
import { login } from "@/lib/appwrite";
import { useAuthStore } from "@/store/authStore";
import { Redirect } from "expo-router";
import {
  ActivityIndicator,
  Image,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState, useEffect, useRef, useCallback } from "react";
import { checkAndNotifyNewProperties } from "@/lib/appwrite";

const Auth = () => {
 const { fetchCurrentUser, isAuthenticated, loading, user } = useAuthStore();
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const hasCheckedProperties = useRef(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout>();

  const checkNewProperties = useCallback(async () => {
    if (hasCheckedProperties.current || !isAuthenticated || !user?.$id) {
      return;
    }

    hasCheckedProperties.current = true;
    
    try {
      console.log("🔍 Checking for new properties after login...");
      const result = await checkAndNotifyNewProperties({ userId: user.$id });
      
      if (result.isNewUser) {
        console.log("👋 Welcome new user!");
      } else if (result.noNewProperties) {
        console.log("📭 No new properties found");
      } else if (result.success) {
        console.log("✅ New properties check completed");
      }
    } catch (error) {
      console.error("Error in new properties check:", error);
    }
  }, [isAuthenticated, user]);

useEffect(() => {
    if (isAuthenticated && user?.$id) {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
      
      checkTimeoutRef.current = setTimeout(() => {
        checkNewProperties();
      }, 1000);
    }

    return () => {
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [isAuthenticated, user, checkNewProperties]);

  useEffect(() => {
    if (!isAuthenticated) {
      hasCheckedProperties.current = false;
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    }
  }, [isAuthenticated]);

  const handleLogin = async () => {
    try {
      setIsLoggingIn(true);
      const result = await login();

      if (result) {
        await fetchCurrentUser();
      } else {
        Alert.alert(
          "Login Failed",
          "Unable to sign in with Google. Please try again."
        );
      }
    } catch (error) {
      console.error("Login error:", error);
      Alert.alert("Error", "An unexpected error occurred during login.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading || isLoggingIn) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text className="text-black-200 mt-4 font-rubik">
          {isLoggingIn ? "Signing you in..." : "Loading..."}
        </Text>
      </View>
    );
  }

  if (isAuthenticated) return <Redirect href="/(root)/(tabs)/home" />;

  return (
    <SafeAreaView className="relative bg-white h-full">
      <Image
        source={images.onboarding}
        className="w-full h-4/6"
        resizeMode="contain"
      />
      <View className="px-8 pb-16 absolute bottom-0 w-full">
        <Text className="text-base text-center uppercase font-rubik text-black-200 tracking-wider">
          Welcome To Homi
        </Text>

        <Text className="text-3xl font-rubik-bold text-black-300 text-center mt-4 leading-10">
          Let's Get You Closer To {"\n"}
          <Text className="text-primary-300">Your Ideal Home</Text>
        </Text>

        <Text className="text-lg font-rubik text-black-200 text-center mt-6">
          Login to Homi with Google
        </Text>

        <TouchableOpacity
          onPress={handleLogin}
          disabled={isLoggingIn}
          className="bg-white border border-gray-200 rounded-full w-full py-4 mt-6 shadow-sm shadow-zinc-300 active:shadow-none active:scale-95"
        >
          <View className="flex flex-row items-center justify-center">
            <Image
              source={icons.google}
              className="w-5 h-5"
              resizeMode="contain"
            />
            <Text className="text-lg font-rubik-medium text-black-300 ml-3">
              {isLoggingIn ? "Signing In..." : "Continue with Google"}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

export default Auth;
