import { useAuthStore } from "@/store/authStore";
import { Redirect } from "expo-router";

export default function Index() {
  const { isAuthenticated } = useAuthStore();

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/auth" />;
  }
  return <Redirect href="/(root)/(tabs)/home" />;
}
