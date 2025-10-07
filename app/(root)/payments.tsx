import {
    FlatList,
    Image,
    SafeAreaView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { router } from "expo-router";
import { useEffect } from "react";

import icons from "@/constants/icons";
import { useAuthStore } from "@/store/authStore";
import { getPayments } from "@/lib/appwrite";
import { useAppwrite } from "@/lib/useAppwrite";

const PaymentItem = ({ payment, onPress }: {
    payment: any;
    onPress: () => void;
}) => {
    return (
        <TouchableOpacity
            onPress={onPress}
            className="flex flex-row items-start p-4 border-b border-gray-200 bg-white"
        >
            <View className="flex-1 ml-3">
                <Text className="text-base font-rubik-bold text-black-300">
                    {payment.propertyTitle}
                </Text>
                <Text className="text-sm font-rubik text-gray-600 mt-1">
                    Amount: ${payment.amount}
                </Text>
                <View className={`px-2 py-1 rounded-full self-start mt-2 ${
                    payment.status === 'completed' ? 'bg-green-100' :
                        payment.status === 'pending' ? 'bg-yellow-100' : 'bg-red-100'
                }`}>
                    <Text className={`text-xs font-rubik-bold ${
                        payment.status === 'completed' ? 'text-green-800' :
                            payment.status === 'pending' ? 'text-yellow-800' : 'text-red-800'
                    }`}>
                        {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                    </Text>
                </View>
                <Text className="text-xs font-rubik text-gray-400 mt-2">
                    {new Date(payment.createdAt).toLocaleDateString()}
                </Text>
            </View>

            <Image
                source={icons.wallet}
                className="w-6 h-6"
                tintColor="#6B7280"
            />
        </TouchableOpacity>
    );
};

const Payments = () => {
    const { user } = useAuthStore();

    const {
        data: payments,
        refetch,
    } = useAppwrite({
        fn: getPayments,
        params: { email: user?.email || "" },
        skip: !user?.email,
    });

    useEffect(() => {
        if (user?.$id) {
            refetch({ email: user.email });
        }
    }, [user?.$id]);

    const handlePaymentPress = (payment: any) => {
    };

    const handleBackPress = () => {
        router.back();
    };

    const totalSpent = payments?.reduce((total: number, payment: any) => {
        return total + parseFloat(payment.amount);
    }, 0) || 0;

    return (
        <SafeAreaView className="h-full bg-white">
            <FlatList
                data={payments || []}
                renderItem={({ item }) => (
                    <PaymentItem
                        payment={item}
                        onPress={() => handlePaymentPress(item)}
                    />
                )}
                keyExtractor={(item) => item.$id}
                contentContainerClassName="pb-20"
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                    <View className="flex items-center justify-center mt-20 px-5">
                        <Image
                            source={icons.wallet} // Or use a payment icon
                            className="w-24 h-24 mb-4"
                            tintColor="#9CA3AF"
                        />
                        <Text className="text-2xl font-rubik-bold text-black-300 mt-5">
                            No Payments
                        </Text>
                        <Text className="text-base text-black-100 mt-2 text-center">
                            You haven't made any payments yet
                        </Text>
                    </View>
                }
                ListHeaderComponent={() => (
                    <View className="px-5">
                        <View className="flex flex-row items-center justify-between mt-5 mb-6">
                            <View className={'flex-row gap-2 items-center'}>
                                <TouchableOpacity
                                    onPress={() => router.back()}
                                    className="flex flex-row bg-primary-200 rounded-full size-11 items-center justify-center"
                                >
                                    <Image source={icons.backArrow} className="size-5" />
                                </TouchableOpacity>

                                <Text className="text-2xl mr-2 text-center font-rubik text-black-300">
                                    Payments
                                </Text>
                            </View>

                            <View className="flex items-end">
                                <Text className="text-sm font-rubik text-gray-600">
                                    Total Spent
                                </Text>
                                <Text className="text-lg font-rubik-bold text-primary-300">
                                    EGP {totalSpent.toFixed(2)}
                                </Text>
                            </View>
                        </View>

                        {payments && payments.length > 0 && (
                            <View className="flex-row justify-between mb-4 bg-primary-50 p-3 rounded-lg">
                                <View className="items-center">
                                    <Text className="text-sm font-rubik text-gray-600">Total</Text>
                                    <Text className="text-lg font-rubik-bold text-black-300">
                                        {payments.length}
                                    </Text>
                                </View>
                                <View className="items-center">
                                    <Text className="text-sm font-rubik text-gray-600">Completed</Text>
                                    <Text className="text-lg font-rubik-bold text-green-600">
                                        {payments.filter((p: any) => p.status === 'completed').length}
                                    </Text>
                                </View>
                                <View className="items-center">
                                    <Text className="text-sm font-rubik text-gray-600">Pending</Text>
                                    <Text className="text-lg font-rubik-bold text-yellow-600">
                                        {payments.filter((p: any) => p.status === 'pending').length}
                                    </Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}
            />
        </SafeAreaView>
    );
};

export default Payments;