import React, { useState, useEffect } from 'react';
import {View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, FlatList} from 'react-native';
import { databases, config } from "@/lib/appwrite";
import { Query } from "react-native-appwrite";
import { router } from "expo-router";
import icons from "@/constants/icons";
import {FeaturedCard} from "@/components/Cards";

const AnalyticsScreen = () => {
    const [userStats, setUserStats] = useState({
        propertiesViewed: 0,
        propertiesSaved: 0,
        propertiesUnsaved: 0,
        favoriteType: ''
    });

    const [recommendedProperties, setRecommendedProperties] = useState([]);
    const [loading, setLoading] = useState(true);
    const handleCardPress = (id: string) => router.push(`/properties/${id}`);

    useEffect(() => {
        loadUserAnalytics();
    }, []);

    useEffect(() => {
        if (userStats.favoriteType && userStats.favoriteType !== 'None') {
            loadRecommendedProperties();
        }
    }, [userStats.favoriteType]);

    const loadUserAnalytics = async () => {
        try {
            const activities = await databases.listDocuments(
                config.databaseId!,
                'user_activity',
                [Query.equal('userId', "68d973281a3322078585"), Query.orderDesc('$createdAt')]
            );

            const viewed = activities.documents.filter(a => a.action === 'viewed').length;
            const saved = activities.documents.filter(a => a.action === 'saved').length;
            const unsaved = activities.documents.filter(a => a.action === 'unsaved').length;

            const typeCount = {};
            activities.documents.forEach(activity => {
                if (activity.propertyType) {
                    typeCount[activity.propertyType] = (typeCount[activity.propertyType] || 0) + 1;
                }
            });

            const favoriteType = Object.keys(typeCount).length > 0
                ? Object.keys(typeCount).reduce((a, b) => typeCount[a] > typeCount[b] ? a : b)
                : 'None';

            setUserStats({
                propertiesViewed: viewed,
                propertiesSaved: saved,
                propertiesUnsaved: unsaved,
                favoriteType
            });
        } catch (error) {
            console.error('Error loading analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadRecommendedProperties = async () => {
        try {
            const properties = await databases.listDocuments(
                config.databaseId!,
                config.propertiesCollectionId!,
                [
                    Query.equal('type', userStats.favoriteType),
                    Query.limit(4), // Show 4 recommended properties
                    Query.orderDesc('$createdAt')
                ]
            );
            setRecommendedProperties(properties.documents);
        } catch (error) {
            console.error('Error loading recommended properties:', error);
        }
    };

    const navigateToProperty = (propertyId: string) => {
        router.push(`/properties/${propertyId}`);
    };

    const formatPrice = (price: number) => {
        return new Intl.NumberFormat('en-EG', {
            style: 'currency',
            currency: 'EGP',
            minimumFractionDigits: 0,
        }).format(price);
    };

    return (
        <ScrollView style={styles.container} contentContainerStyle={{paddingBottom: 100}} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View className="flex flex-row items-center justify-between my-5">
                <TouchableOpacity
                    onPress={() => router.back()}
                    className="flex flex-row bg-primary-200 rounded-full size-11 items-center justify-center"
                >
                    <Image source={icons.backArrow} className="size-5" />
                </TouchableOpacity>

                <Text className="text-base mr-2 text-center font-rubik-medium text-black-300">
                    Your Activity Insights
                </Text>
                <Image source={icons.bell} className="w-6 h-6" />
            </View>

            <View style={styles.statsContainer}>
                <View style={[styles.statCard, { backgroundColor: '#3B82F6' }]}>
                    <Text style={styles.statNumber}>{userStats.propertiesViewed}</Text>
                    <Text style={styles.statLabel}>Properties Viewed</Text>
                </View>

                <View style={[styles.statCard, { backgroundColor: '#10B981' }]}>
                    <Text style={styles.statNumber}>{userStats.propertiesSaved}</Text>
                    <Text style={styles.statLabel}>Properties Saved</Text>
                </View>
            </View>

            <View style={styles.insightCard}>
                <Text style={styles.insightTitle}>🌟 Your Preference Insight</Text>
                <Text style={styles.insightValue}>
                    {userStats.favoriteType !== 'None' ? userStats.favoriteType : 'Exploring'}
                </Text>
                <Text style={styles.insightSubtitle}>
                    {userStats.favoriteType !== 'None'
                        ? `You seem to love ${userStats.favoriteType.toLowerCase()}s! We'll prioritize these in your recommendations.`
                        : 'Keep browsing to discover your favorite property types!'
                    }
                </Text>
            </View>

            {userStats.favoriteType !== 'None' && recommendedProperties.length > 0 && (
                <View style={styles.recommendationsCard}>
                    <View style={styles.recommendationsHeader}>
                        <Text style={styles.recommendationsTitle}>
                            Recommended {userStats.favoriteType} For You
                        </Text>
                        <Text style={styles.recommendationsSubtitle}>
                            Based on your preferences
                        </Text>
                    </View>


                    <View style={styles.propertiesGrid}>
                        <FlatList
                            data={recommendedProperties}
                            renderItem={({ item }) => (
                                <FeaturedCard
                                    item={item}
                                    onPress={() => handleCardPress(item.$id)}
                                />
                            )}
                            keyExtractor={(item) => item.$id}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerClassName="flex gap-5 my-5"
                        />
                    </View>
                </View>
            )}

            {userStats.favoriteType === 'None' && !loading && (
                <View style={styles.emptyStateCard}>
                    <Image source={icons.search} style={styles.emptyStateIcon} />
                    <Text style={styles.emptyStateTitle}>Discover Your Preferences</Text>
                    <Text style={styles.emptyStateText}>
                        Browse more properties to help us understand what you love!
                    </Text>
                    <TouchableOpacity
                        style={styles.browseButton}
                    >
                        <Text style={styles.browseButtonText}>Browse Properties</Text>
                    </TouchableOpacity>
                </View>
            )}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'white',
        paddingHorizontal: 16,
    },
    statsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        marginBottom: 20,
    },
    statCard: {
        padding: 20,
        borderRadius: 16,
        alignItems: 'center',
        flex: 1,
        minWidth: '48%',
        marginHorizontal: 2,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
    },
    statNumber: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        fontFamily: 'Rubik',
    },
    statLabel: {
        fontSize: 12,
        color: 'white',
        marginTop: 4,
        fontFamily: 'Rubik',
        opacity: 0.9,
        textAlign: 'center',
    },
    insightCard: {
        backgroundColor: 'white',
        padding: 20,
        borderRadius: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
        borderLeftWidth: 4,
        borderLeftColor: '#8B5CF6',
    },
    insightTitle: {
        fontSize: 16,
        color: '#64748b',
        marginBottom: 8,
        fontFamily: 'Rubik',
    },
    insightValue: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#8B5CF6',
        marginBottom: 8,
        fontFamily: 'Rubik',
    },
    insightSubtitle: {
        fontSize: 14,
        color: '#64748b',
        lineHeight: 20,
        fontFamily: 'Rubik',
    },
    // Recommendations Styles
    recommendationsCard: {
        backgroundColor: 'white',
        padding: 20,
        borderRadius: 16,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    recommendationsHeader: {
        marginBottom: 16,
    },
    recommendationsTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#1e293b',
        fontFamily: 'Rubik',
        marginBottom: 4,
    },
    recommendationsSubtitle: {
        fontSize: 14,
        color: '#64748b',
        fontFamily: 'Rubik',
    },
    propertiesGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
    },
    propertyCard: {
        width: '48%',
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        marginBottom: 16,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 2,
    },
    propertyImage: {
        width: '100%',
        height: 120,
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
    },
    propertyInfo: {
        padding: 12,
    },
    propertyName: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1e293b',
        fontFamily: 'Rubik',
        marginBottom: 4,
    },
    propertyAddress: {
        fontSize: 12,
        color: '#64748b',
        fontFamily: 'Rubik',
        marginBottom: 8,
    },
    propertyDetails: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    detailItem: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailIcon: {
        width: 12,
        height: 12,
        marginRight: 2,
    },
    detailText: {
        fontSize: 10,
        color: '#64748b',
        fontFamily: 'Rubik',
    },
    propertyPrice: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#3B82F6',
        fontFamily: 'Rubik',
    },
    seeMoreButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f1f5f9',
        padding: 12,
        borderRadius: 8,
        marginTop: 8,
    },
    seeMoreText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#3B82F6',
        fontFamily: 'Rubik',
        marginRight: 8,
    },
    seeMoreIcon: {
        width: 16,
        height: 16,
        tintColor: '#3B82F6',
    },
    // Empty State Styles
    emptyStateCard: {
        backgroundColor: 'white',
        padding: 32,
        borderRadius: 16,
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 3,
    },
    emptyStateIcon: {
        width: 64,
        height: 64,
        marginBottom: 16,
        tintColor: '#cbd5e1',
    },
    emptyStateTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
        fontFamily: 'Rubik',
        marginBottom: 8,
        textAlign: 'center',
    },
    emptyStateText: {
        fontSize: 14,
        color: '#64748b',
        fontFamily: 'Rubik',
        textAlign: 'center',
        marginBottom: 20,
        lineHeight: 20,
    },
    browseButton: {
        backgroundColor: '#3B82F6',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    browseButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: 'white',
        fontFamily: 'Rubik',
    },
});

export default AnalyticsScreen;