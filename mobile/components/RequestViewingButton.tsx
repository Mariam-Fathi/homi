import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { notify } from "@/lib/dialog";
import { router } from "expo-router";

import {
  ApiError,
  createViewingRequest,
  getMyViewingRequests,
} from "@/lib/api";
import type { TimeSlot, ViewingRequest } from "@/types/api";
import { VIEWING_STATUS_LABELS } from "@/constants/viewings";
import { DEFAULT_COUNTRY } from "@/constants/countries";
import PhoneInput from "@/components/PhoneInput";
import { checkPhone, splitE164 } from "@/lib/phone";
import { useAuthStore } from "@/store/authStore";
import { track } from "@/lib/analytics";
import { useExperiment } from "@/hooks/useExperiment";
import type { CountryCode } from "libphonenumber-js/max";

const DAYS_AHEAD = 14;
const TIME_SLOTS: { value: TimeSlot; label: string }[] = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
];
const OPEN_STATUSES = new Set(["requested", "contacted", "scheduled"]);

// Local calendar date as YYYY-MM-DD (toISOString would shift it to UTC).
const toIsoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const upcomingDays = () =>
  Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return {
      value: toIsoDate(d),
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      day: d.getDate(),
    };
  });

const Chip = ({
  selected,
  onPress,
  children,
}: {
  selected: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) => (
  <TouchableOpacity
    onPress={onPress}
    className={`px-4 py-2 rounded-xl mr-2 items-center ${
      selected ? "bg-primary-300" : "bg-primary-100 border border-primary-200"
    }`}
  >
    {children}
  </TouchableOpacity>
);

/** "Request a viewing" call to action + form. This is the app's conversion event. */
const RequestViewingButton = ({
  propertyId,
  propertyName,
}: {
  propertyId: string;
  propertyName: string;
}) => {
  const days = useMemo(upcomingDays, []);
  const [visible, setVisible] = useState(false);
  const openedAt = useRef(0);

  const [openRequest, setOpenRequest] = useState<ViewingRequest | null>(null);
  const [date, setDate] = useState(days[0].value);
  const [slot, setSlot] = useState<TimeSlot>("morning");
  // Pre-fill with the signed-in user's number (guests type one).
  const userPhone = useAuthStore((state) => state.user?.phone);
  const saved = userPhone ? splitE164(userPhone) : null;
  const [phone, setPhone] = useState(saved?.national ?? "");
  const [country, setCountry] = useState<CountryCode>(
    saved?.country ?? DEFAULT_COUNTRY
  );
  const [showPhoneError, setShowPhoneError] = useState(false);
  const { variant: phoneFormatVariant, expose: exposePhoneFormat } =
    useExperiment("phone_autoformat");
  const guidedPhone = !saved && phoneFormatVariant === "treatment";

  const openForm = () => {
    openedAt.current = Date.now();
    track("viewing_form_opened", { property_id: propertyId });
    // The experiment only changes the form for people who type their number, so
    // only they are exposed (docs/experimentation.md).
    if (!saved) exposePhoneFormat();
    setVisible(true);
  };

  // Closing without a successful request (Cancel, back button, tapping outside).
  const abandonForm = () => {
    track("viewing_form_abandoned", {
      property_id: propertyId,
      seconds_open: Math.round((Date.now() - openedAt.current) / 1000),
    });
    setVisible(false);
  };
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadOpenRequest = useCallback(async () => {
    try {
      const requests = await getMyViewingRequests({ propertyId });
      setOpenRequest(requests.find((r) => OPEN_STATUSES.has(r.status)) ?? null);
    } catch (error) {
      console.log("Couldn't load viewing requests:", error);
    }
  }, [propertyId]);

  useEffect(() => {
    loadOpenRequest();
  }, [loadOpenRequest]);

  // Any valid number works as a contact, landlines included.
  const phoneResult = checkPhone(phone, country);

  const submit = async () => {
    if (!phoneResult.valid) {
      track("viewing_form_validation_failed", {
        property_id: propertyId,
        field: "phone",
      });
      setShowPhoneError(true);
      return;
    }
    setSubmitting(true);
    try {
      const created = await createViewingRequest({
        property_id: propertyId,
        preferred_date: date,
        time_slot: slot,
        phone: phoneResult.e164,
        message: message.trim() || undefined,
      });
      setOpenRequest(created);
      setVisible(false);
      notify(
        "Request sent",
        `We'll contact you to confirm your viewing of ${propertyName}.`
      );
    } catch (error) {
      notify(
        "Couldn't send request",
        error instanceof ApiError ? error.message : "Please try again."
      );
      if (error instanceof ApiError && error.status === 409) loadOpenRequest();
    } finally {
      setSubmitting(false);
    }
  };

  if (openRequest) {
    return (
      <TouchableOpacity
        onPress={() => router.push("/viewings")}
        className="w-full items-center justify-center bg-primary-100 border border-primary-300 py-4 rounded-full"
      >
        <Text className="text-primary-300 text-base text-center font-rubik-bold">
          Viewing {VIEWING_STATUS_LABELS[openRequest.status].toLowerCase()}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity
        onPress={openForm}
        className="w-full flex flex-row items-center justify-center bg-primary-300 py-4 rounded-full shadow-md shadow-zinc-400"
      >
        <Text className="text-white text-lg text-center font-rubik-bold">
          Request a Viewing
        </Text>
      </TouchableOpacity>

      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={abandonForm}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 justify-end bg-black/40"
        >
          <View className="bg-white rounded-t-3xl px-6 pt-6 pb-10 max-h-[90%]">
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text className="text-2xl font-rubik-bold text-black-300">
                Request a Viewing
              </Text>
              <Text
                className="text-sm font-rubik text-black-200 mt-1"
                numberOfLines={1}
              >
                {propertyName}
              </Text>

              <Text className="text-base font-rubik-medium text-black-300 mt-6 mb-2">
                Preferred day
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                {days.map((d) => (
                  <Chip
                    key={d.value}
                    selected={date === d.value}
                    onPress={() => setDate(d.value)}
                  >
                    <Text
                      className={`text-xs font-rubik ${
                        date === d.value ? "text-white" : "text-black-200"
                      }`}
                    >
                      {d.weekday}
                    </Text>
                    <Text
                      className={`text-lg font-rubik-bold ${
                        date === d.value ? "text-white" : "text-black-300"
                      }`}
                    >
                      {d.day}
                    </Text>
                  </Chip>
                ))}
              </ScrollView>

              <Text className="text-base font-rubik-medium text-black-300 mt-5 mb-2">
                Time of day
              </Text>
              <View className="flex-row">
                {TIME_SLOTS.map((s) => (
                  <Chip
                    key={s.value}
                    selected={slot === s.value}
                    onPress={() => setSlot(s.value)}
                  >
                    <Text
                      className={`text-sm font-rubik-medium ${
                        slot === s.value ? "text-white" : "text-black-300"
                      }`}
                    >
                      {s.label}
                    </Text>
                  </Chip>
                ))}
              </View>

              <Text className="text-base font-rubik-medium text-black-300 mt-5 mb-2">
                Phone number
              </Text>
              <PhoneInput
                guided={guidedPhone}
                country={country}
                onCountryChange={setCountry}
                value={phone}
                onChangeText={setPhone}
                error={
                  showPhoneError && !phoneResult.valid
                    ? phoneResult.error
                    : null
                }
              />

              <Text className="text-base font-rubik-medium text-black-300 mt-5 mb-2">
                Message (optional)
              </Text>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Anything the agent should know?"
                multiline
                maxLength={1000}
                className="border border-primary-200 rounded-xl px-4 py-3 font-rubik text-black-300 min-h-20"
                textAlignVertical="top"
              />

              <View className="flex-row gap-3 mt-6">
                <TouchableOpacity
                  onPress={abandonForm}
                  disabled={submitting}
                  className="flex-1 bg-gray-100 rounded-full py-3"
                >
                  <Text className="text-base font-rubik-medium text-black-300 text-center">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={submit}
                  disabled={submitting}
                  className="flex-1 bg-primary-300 rounded-full py-3 items-center justify-center"
                >
                  {submitting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-base font-rubik-bold text-white text-center">
                      Send Request
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

export default RequestViewingButton;
