import { PaymentProps } from "@/types/type";
import { useState } from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity } from "react-native";
import { fetchAPI } from "@/lib/fetch";

// Web fallback: Stripe's native payment sheet isn't available, so redirect to
// Stripe-hosted Checkout instead.
export default function Payment({ fullName, email, amount, propertyTitle }: PaymentProps) {
  const [processing, setProcessing] = useState(false);

  const openCheckout = async () => {
    if (processing) return;
    if (!email || !amount) {
      Alert.alert("Error", "Payment details are not available yet.");
      return;
    }

    setProcessing(true);
    try {
      const { url } = await fetchAPI("/api/hosted-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: fullName, email, amount, propertyTitle }),
      });
      window.location.href = url;
    } catch (error) {
      Alert.alert(
        "Payment failed",
        error instanceof Error ? error.message : "Something went wrong. Please try again."
      );
      setProcessing(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={openCheckout}
      disabled={processing}
      className="flex-1 flex flex-row items-center justify-center bg-primary-300 py-3 rounded-full shadow-md shadow-zinc-400"
    >
      {processing ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text className="text-white text-lg text-center font-rubik-bold">
          Book Now
        </Text>
      )}
    </TouchableOpacity>
  );
}
