import { useStripe } from "@stripe/stripe-react-native";
import { router } from "expo-router";
import React, { useState } from "react";
import { Alert, Image, Text, TouchableOpacity, View } from "react-native";

import CustomButton from "@/components/CustomButton";
import { fetchAPI } from "@/lib/fetch";
import { PaymentProps } from "@/types/type";
import * as Linking from "expo-linking";
import images from "@/constants/images";

const Payment = ({ fullName, email, amount }: PaymentProps) => {
  const { initPaymentSheet, presentPaymentSheet } = useStripe();

  const [success, setSuccess] = useState<boolean>(false);

  const openPaymentSheet = async () => {
    await initializePaymentSheet();

    const { error } = await presentPaymentSheet();

    if (error) {
      Alert.alert(`Error code: ${error.code}`, error.message);
    } else {
      setSuccess(true);
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
      merchantDisplayName: "Expo, Inc.",
      customerId: customer,
      customerEphemeralKeySecret: ephemeralKey,
      paymentIntentClientSecret: paymentIntent,
      defaultBillingDetails: {
        name: fullName,
        email: email,
        phone: "000-000-000",
      },
      returnURL: Linking.createURL("(root)/(tabs)/home"),
    });
  };

  return (
    <>
      <TouchableOpacity
        onPress={openPaymentSheet}
        className="flex-1 flex flex-row items-center justify-center bg-primary-300 py-3 rounded-full shadow-md shadow-zinc-400"
      >
        <Text className="text-white text-lg text-center font-rubik-bold">
          Book Now
        </Text>
      </TouchableOpacity>
{success&&

      <View
        className='flex-1 items-center justify-center bg-white'
      >
          <Image source={images.check} className="w-28 h-28" />

          <Text className="text-2xl text-center font-JakartaBold mt-5">
            Booking placed successfully
          </Text>

          <Text className="text-md text-general-200 font-JakartaRegular text-center mt-3">
            Thank you for your booking. Your booking has been successfully
            placed.
          </Text>

          <CustomButton
            title="Back Home"
            onPress={() => {
              setSuccess(false);
              router.push("/(root)/(tabs)/home");
            }}
            className="mt-5"
          />
        </View>
}
    </>
  );
};

export default Payment;
