import { useState } from "react";
import {
  FlatList,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import type { CountryCode } from "libphonenumber-js/max";

import { COUNTRIES, flagEmoji } from "@/constants/countries";
import { dialCode, exampleNumber, formatAsTyped } from "@/lib/phone";

interface Props {
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
  value: string;
  onChangeText: (text: string) => void;
  error?: string | null;
  placeholder?: string;
  /**
   * Formats the number as it's typed and shows an example for the selected country
   * (the treatment in the phone_autoformat experiment).
   */
  guided?: boolean;
}

/** Country picker (flag + dial code) next to a phone number field. */
const PhoneInput = ({
  country,
  onCountryChange,
  value,
  onChangeText,
  error,
  placeholder = "100 123 4567",
  guided = false,
}: Props) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const example = guided ? exampleNumber(country) : "";

  return (
    <View>
      <View
        className={`flex-row items-center border rounded-xl ${
          error ? "border-red-500" : "border-primary-200"
        }`}
      >
        <TouchableOpacity
          onPress={() => setPickerOpen(true)}
          accessibilityLabel="Choose country code"
          className="flex-row items-center px-3 py-3 border-r border-primary-200"
        >
          <Text className="text-lg">{flagEmoji(country)}</Text>
          <Text className="font-rubik-medium text-black-300 ml-2">
            {dialCode(country)}
          </Text>
          <Text className="text-black-100 ml-1">▾</Text>
        </TouchableOpacity>
        <TextInput
          value={value}
          onChangeText={(text) =>
            onChangeText(guided ? formatAsTyped(value, text, country) : text)
          }
          placeholder={guided && example ? example : placeholder}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          className="flex-1 px-3 py-3 font-rubik text-black-300"
        />
      </View>
      {guided && example && !error ? (
        <Text className="text-xs font-rubik text-black-200 mt-1">
          Example: {example}
        </Text>
      ) : null}
      {error ? (
        <Text className="text-xs font-rubik text-red-600 mt-1">{error}</Text>
      ) : null}

      <Modal
        visible={pickerOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setPickerOpen(false)}
      >
        <View className="flex-1 justify-end bg-black/40">
          <View className="bg-white rounded-t-3xl pt-5 pb-8 max-h-[75%]">
            <Text className="text-xl font-rubik-bold text-black-300 px-6 mb-3">
              Country code
            </Text>
            <FlatList
              data={COUNTRIES}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    onCountryChange(item.code);
                    setPickerOpen(false);
                  }}
                  className={`flex-row items-center px-6 py-3 ${
                    item.code === country ? "bg-primary-100" : ""
                  }`}
                >
                  <Text className="text-xl">{flagEmoji(item.code)}</Text>
                  <Text className="flex-1 font-rubik text-black-300 ml-3">
                    {item.name}
                  </Text>
                  <Text className="font-rubik-medium text-black-200">
                    {dialCode(item.code)}
                  </Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity
              onPress={() => setPickerOpen(false)}
              className="mx-6 mt-3 py-3"
            >
              <Text className="text-center font-rubik-medium text-primary-300">
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default PhoneInput;
