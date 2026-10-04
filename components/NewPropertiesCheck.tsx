import { useState } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import { useAuthStore } from "@/store/authStore";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { checkAndNotifyNewProperties } from "@/lib/appwrite";

export const NewPropertiesCheck = () => {
    const { user } = useAuthStore();
    const { preferences, loading: preferencesLoading } = useUserPreferences();
    const [checking, setChecking] = useState(false);

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

            // checkAndNotifyNewProperties already creates the notification and push.
            if (!result.success) {
                Alert.alert("Error", result.error || "Failed to check for new properties");
            } else if (result.count > 0) {
                Alert.alert("Success", `Found ${result.count} new properties! You should receive a notification shortly.`);
            } else {
                Alert.alert("All caught up", "No new properties matching your preferences right now.");
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