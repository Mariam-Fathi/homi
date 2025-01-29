import { View, Text, TouchableOpacity } from "react-native";
import React, { useEffect } from "react";
import seed from "@/lib/seed";

const Home = () => {
  return (
    <View>
      <TouchableOpacity onPress={seed}>
        <Text>Seed</Text>
      </TouchableOpacity>
    </View>
  );
};

export default Home;
