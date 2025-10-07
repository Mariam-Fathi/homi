import { Image, StyleSheet, Text, View } from "react-native";
import React from "react";
import CustomButton from "@/components/CustomButton";
import { router } from "expo-router";
import images from "@/constants/images";

export default function SuccessPayment() {
  return (
    <View className="flex-1 items-center justify-center w-full h-full bg-white px-6">
      <Image source={images.check} className="w-28 h-28 mt-5" />

      <Text className="text-2xl text-center font-JakartaBold mt-5">
          Property Booked Successfully
      </Text>

      <Text className="text-md text-general-200 font-JakartaRegular text-center mt-3">
          Congratulations! Your property viewing has been scheduled. Our agent will contact you shortly to confirm the appointment details.      </Text>

      <CustomButton
        title="Back Home"
        onPress={() => {
          router.push("/(root)/(tabs)/home");
        }}
        className="mt-6 justify-center items-center w-full"
      />
    </View>
  );
}

const styles = StyleSheet.create({});
