import { useAuthStore } from "@/store/authStore";
import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";

export default function Index() {
  const { isAuthenticated, loading } = useAuthStore();

  // Wait for the stored session check before deciding where to go.
  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-white">
        <ActivityIndicator size="large" color="#0061FF" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/auth" />;
  }
  return <Redirect href="/(root)/(tabs)/home" />;
}
