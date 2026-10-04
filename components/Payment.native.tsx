import { useStripe } from "@stripe/stripe-react-native";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ReactNativeModal } from "react-native-modal";
import { fetchAPI } from "@/lib/fetch";
import { PaymentProps } from "@/types/type";
import * as Linking from "expo-linking";
import images from "@/constants/images";
import CustomButton from "./CustomButton";
import { createPaymentRecord } from "@/lib/appwrite";

const Payment = ({ fullName, email, amount,propertyTitle }: PaymentProps) => {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [success, setSuccess] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);

  const savePaymentRecord = async () => {
    try {
      await createPaymentRecord({
        amount: String(amount),
        status: "completed",
        fullName,
        email,
        propertyTitle,
      });
    } catch (error) {
      // The charge already succeeded; don't surface this as a payment failure.
      console.error("Error saving payment record:", error);
    }
  };

  const openPaymentSheet = async () => {
    if (processing) return;
    if (!email || !amount) {
      Alert.alert("Error", "Payment details are not available yet.");
      return;
    }

    setProcessing(true);
    try {
      await initializePaymentSheet();

      const { error } = await presentPaymentSheet();

      if (error) {
        // Closing the sheet isn't an error worth alerting about.
        if (error.code !== "Canceled") {
          Alert.alert("Payment failed", error.message);
        }
      } else {
        await savePaymentRecord();
        setSuccess(true);
      }
    } catch (error) {
      console.error("Payment error:", error);
      Alert.alert(
        "Payment failed",
        error instanceof Error ? error.message : "Something went wrong. Please try again."
      );
    } finally {
      setProcessing(false);
    }
  };

  const initializePaymentSheet = async () => {
    const { paymentIntent, customer, ephemeralKey } = await fetchAPI(
      "/api/payment-sheet",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: fullName,
          email: email,
          amount: amount,
        }),
      }
    );

    const { error } = await initPaymentSheet({
      merchantDisplayName: "Homi",
      customerId: customer,
      customerEphemeralKeySecret: ephemeralKey,
      paymentIntentClientSecret: paymentIntent,
      defaultBillingDetails: {
        name: fullName,
        email: email,
      },
      returnURL: Linking.createURL("/home"),
    });

    if (error) {
      throw new Error(error.message);
    }
  };

  return (
    <>
      <TouchableOpacity
        onPress={openPaymentSheet}
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
      <ReactNativeModal
        isVisible={success}
        onBackdropPress={() => setSuccess(false)}
      >
        <View className="flex flex-col items-center justify-center bg-white p-7 rounded-2xl">
          <Image source={images.check} className="w-28 h-28 mt-5" />

          <Text className="text-2xl text-center font-rubik-bold mt-5">
              Property Booked Successfully
          </Text>

          <Text className="text-base text-black-200 font-rubik text-center mt-3">
              Congratulations! Your property viewing has been scheduled. Our agent will contact you shortly to confirm the appointment details.
        </Text>

          <CustomButton
            title="Back Home"
            onPress={() => {
              setSuccess(false);
              router.replace("/(root)/(tabs)/home");
            }}
            className="mt-5"
          />
        </View>
      </ReactNativeModal>
    </>
  );
};

export default Payment;
