import { useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useAuthStore } from "@/store/authStore";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { useNotification } from "@/context/NotificationContext";
import { checkAndNotifyNewProperties } from "@/lib/appwrite";

export const NewPropertiesCheck = () => {
    const { user } = useAuthStore();
    const { preferences, loading: preferencesLoading } = useUserPreferences();
    const [checking, setChecking] = useState(false);
    const { sendPushNotification } = useNotification();

    const handleCheckNewProperties = async () => {
        if (!user?.$id) {
            Alert.alert("Error", "Please log in to use this feature");
            return;
        }

        if (!preferences) {
            Alert.alert("Info", "We need more data about your preferences. Keep browsing properties!");
            return;
        }

        console.log('🔍 Starting property check for user:', user.$id);
        console.log('🎯 User preferences:', preferences);

        setChecking(true);
        try {
            const result = await checkAndNotifyNewProperties({ userId: user.$id });
            console.log('✅ Property check result:', result);

            if (result.success && result.count > 0 && result.property) {
                console.log('📱 Sending push notification for property:', result.property.name);

                await sendPushNotification(
                    '🏠 New Property Match!',
                    `We found a new ${result.property.type} property: ${result.property.name}`,
                    {
                        id: result.property.$id,
                        type: 'new_property',
                        screen: 'property-details'
                    }
                );
                console.log('✅ Push notification sent');

                Alert.alert("Success", `Found ${result.count} new properties! You should receive a notification shortly.`);
            } else {
                Alert.alert("Success", `Found ${result.count} new properties!`);
            }
        } catch (error) {
            console.error('❌ Error checking new properties:', error);
            Alert.alert("Error", error.message || "Failed to check for new properties");
        } finally {
            setChecking(false);
        }
    };

    if (preferencesLoading) {
        return (
            <View className="p-4 items-center">
                <Text className="text-gray-500 text-center">Analyzing your preferences...</Text>
            </View>
        );
    }

    return (
        <View className="bg-primary-50 rounded-lg m-4 justify-center">
            <TouchableOpacity
                onPress={handleCheckNewProperties}
                disabled={checking || !preferences}
                className={`py-3 px-4 rounded-lg ${
                    checking || !preferences ? 'bg-primary-200' : 'bg-primary-300'
                }`}
            >
                <Text className="text-white font-rubik-semibold text-center">
                    {checking ? 'Checking...' : 'Check for New Properties'}
                </Text>
            </TouchableOpacity>
        </View>
    );
};