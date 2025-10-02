import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, RefreshControl } from 'react-native';
import { getCardAnalyticsSummary } from '@/lib/appwrite';

interface AnalyticsSummary {
    totalViews: number;
    totalClicks: number;
    totalFavorites: number;
    popularProperties: Array<{
        id: string;
        name: string;
        views: number;
        clicks: number;
        favorites: number;
    }>;
    dailyStats: { [key: string]: { views: number; clicks: number; favorites: number } };
}

const AnalyticsDashboard = () => {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadAnalytics = async () => {
        try {
            const data = await getCardAnalyticsSummary();
            setSummary(data);
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadAnalytics();
    }, []);

    const onRefresh = () => {
        setRefreshing(true);
        loadAnalytics();
    };

    if (loading) {
        return (
            <View className="flex-1 justify-center items-center">
                <Text className="text-lg">Loading analytics...</Text>
            </View>
        );
    }

    if (!summary) {
        return (
            <View className="flex-1 justify-center items-center">
                <Text className="text-lg text-red-500">Failed to load analytics</Text>
            </View>
        );
    }

    return (
        <ScrollView
            className="flex-1 bg-gray-50 p-4"
            refreshControl={
                <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
        >
            <View className="mb-6">
                <Text className="text-2xl font-rubik-bold text-gray-900">Analytics Dashboard</Text>
                <Text className="text-gray-600 mt-1">Last 7 days performance</Text>
            </View>

            <View className="flex-row justify-between mb-6">
                <View className="bg-white p-4 rounded-lg shadow-sm flex-1 mr-2">
                    <Text className="text-sm font-rubik text-gray-500">Total Views</Text>
                    <Text className="text-2xl font-rubik-bold text-blue-600 mt-1">{summary.totalViews}</Text>
                </View>

                <View className="bg-white p-4 rounded-lg shadow-sm flex-1 mx-2">
                    <Text className="text-sm font-rubik text-gray-500">Total Clicks</Text>
                    <Text className="text-2xl font-rubik-bold text-green-600 mt-1">{summary.totalClicks}</Text>
                </View>

                <View className="bg-white p-4 rounded-lg shadow-sm flex-1 ml-2">
                    <Text className="text-sm font-rubik text-gray-500">Total Favorites</Text>
                    <Text className="text-2xl font-rubik-bold text-red-600 mt-1">{summary.totalFavorites}</Text>
                </View>
            </View>

            <View className="bg-white p-4 rounded-lg shadow-sm mb-6">
                <Text className="text-lg font-rubik-bold text-gray-900 mb-2">Engagement Rate</Text>
                <View className="flex-row items-center">
                    <Text className="text-3xl font-rubik-bold text-purple-600">
                        {summary.totalViews > 0 ? ((summary.totalClicks / summary.totalViews) * 100).toFixed(1) : 0}%
                    </Text>
                    <Text className="text-gray-600 ml-2">click-through rate</Text>
                </View>
            </View>

            <View className="bg-white p-4 rounded-lg shadow-sm mb-6">
                <Text className="text-lg font-rubik-bold text-gray-900 mb-4">Most Popular Properties</Text>
                {summary.popularProperties.map((property, index) => (
                    <View key={property.id} className="flex-row justify-between items-center py-3 border-b border-gray-100">
                        <View className="flex-1">
                            <Text className="font-rubik-bold text-gray-900" numberOfLines={1}>
                                {index + 1}. {property.name}
                            </Text>
                            <View className="flex-row mt-1">
                                <Text className="text-xs text-blue-600 mr-3">👁️ {property.views}</Text>
                                <Text className="text-xs text-green-600 mr-3">👆 {property.clicks}</Text>
                                <Text className="text-xs text-red-600">❤️ {property.favorites}</Text>
                            </View>
                        </View>
                    </View>
                ))}

                {summary.popularProperties.length === 0 && (
                    <Text className="text-gray-500 text-center py-4">No data available yet</Text>
                )}
            </View>

            <View className="bg-white p-4 rounded-lg shadow-sm">
                <Text className="text-lg font-rubik-bold text-gray-900 mb-4">Daily Activity</Text>
                {Object.entries(summary.dailyStats).map(([date, stats]) => (
                    <View key={date} className="flex-row justify-between items-center py-3 border-b border-gray-100">
                        <Text className="text-gray-700 flex-1">{new Date(date).toLocaleDateString()}</Text>
                        <View className="flex-row">
                            <Text className="text-xs text-blue-600 mr-3">👁️ {stats.views}</Text>
                            <Text className="text-xs text-green-600 mr-3">👆 {stats.clicks}</Text>
                            <Text className="text-xs text-red-600">❤️ {stats.favorites}</Text>
                        </View>
                    </View>
                ))}

                {Object.keys(summary.dailyStats).length === 0 && (
                    <Text className="text-gray-500 text-center py-4">No daily data available</Text>
                )}
            </View>
        </ScrollView>
    );
};

export default AnalyticsDashboard;