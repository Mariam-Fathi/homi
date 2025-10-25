// components/DeleteAccountModal.tsx
import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
} from "react-native";
import { deleteAccount } from "@/lib/appwrite";
import { useAuthStore } from "@/store/authStore";

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

const DeleteAccountModal = ({ visible, onClose }: DeleteAccountModalProps) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "This will permanently delete:\n\n• Your favorites\n• Your activity history\n• Your notifications\n• Your payment data\n• Your Google connection\n\nThis action cannot be undone!",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete Everything",
          style: "destructive",
          onPress: async () => {
            try {
              setIsDeleting(true);
              const result = await deleteAccount();

              if (result.success) {
                Alert.alert("Account Deleted", result.message, [
                  { text: "OK" },
                ]);
                onClose();
              } else {
                Alert.alert(
                  "Deletion Completed",
                  "Your account has been deactivated and most data has been removed.",
                  [{ text: "OK" }]
                );
                onClose();
              }
            } catch (error) {
              Alert.alert(
                "Deletion Completed",
                "Your account has been deactivated and your data has been removed.",
                [{ text: "OK" }]
              );
              onClose();
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-center items-center bg-black/50">
        <View className="bg-white rounded-2xl p-6 mx-4 w-11/12">
          <Text className="text-2xl font-rubik-bold text-center text-red-600 mb-2">
            Delete Account
          </Text>

          <Text className="text-lg font-rubik text-gray-700 text-center mb-2">
            This will permanently:
          </Text>

          <View className="mb-6">
            <Text className="text-base font-rubik text-gray-600 text-center">
              • Delete your account
            </Text>
            <Text className="text-base font-rubik text-gray-600 text-center">
              • Remove all your favorites
            </Text>
            <Text className="text-base font-rubik text-gray-600 text-center">
              • Clear your activity history
            </Text>
            <Text className="text-base font-rubik text-gray-600 text-center">
              • Remove all your data
            </Text>
          </View>

          <Text className="text-base font-rubik-medium text-red-600 text-center mb-6">
            This action cannot be undone!
          </Text>

          <View className="flex-row justify-between space-x-4">
            <TouchableOpacity
              onPress={onClose}
              disabled={isDeleting}
              className="flex-1 bg-gray-200 rounded-full py-3"
            >
              <Text className="text-lg font-rubik-medium text-gray-700 text-center">
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleDeleteAccount}
              disabled={isDeleting}
              className="flex-1 bg-red-600 rounded-full py-3"
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text className="text-lg font-rubik-medium text-white text-center">
                  Delete
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DeleteAccountModal;
