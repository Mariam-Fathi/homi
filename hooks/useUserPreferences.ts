import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/authStore";
import { analyzeUserPreferences } from "@/lib/appwrite";

export const useUserPreferences = () => {
    const { user } = useAuthStore();
    const [preferences, setPreferences] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchPreferences = async () => {
        if (!user?.$id) {
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);
            const userPrefs = await analyzeUserPreferences({ userId: user.$id });
            setPreferences(userPrefs);
        } catch (err) {
            console.error('Error fetching user preferences:', err);
            setError('Failed to load preferences');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPreferences();
    }, [user?.$id]);

    return {
        preferences,
        loading,
        error,
        refetch: fetchPreferences
    };
};