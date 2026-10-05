import { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from "react-native";
import { confirm, notify } from "@/lib/dialog";
import { useAuthStore } from "@/store/authStore";

interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
}

const DeleteAccountModal = ({ visible, onClose }: DeleteAccountModalProps) => {
  const [isDeleting, setIsDeleting] = useState(false);
  // Goes through the store so the signed-in state is cleared afterwards.
  const deleteAccount = useAuthStore((state) => state.deleteAccount);

  const handleDeleteAccount = async () => {
    const confirmed = await confirm({
      title: "Delete Account",
      message:
        "This will permanently delete your account and:\n\n• Your favorites\n• Your viewing requests\n• Your notifications\n• Your browsing history\n\nThis action cannot be undone!",
      confirmText: "Delete Everything",
      destructive: true,
    });
    if (!confirmed) return;

    try {
      setIsDeleting(true);
      const result = await deleteAccount();

      if (result.success) {
        notify("Account Deleted", result.message);
        onClose();
      } else {
        notify("Deletion Failed", result.message);
      }
    } catch (error) {
      notify(
        "Deletion Failed",
        "An error occurred while deleting your account. Please try again."
      );
    } finally {
      setIsDeleting(false);
    }
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
              • Remove your viewing requests
            </Text>
            <Text className="text-base font-rubik text-gray-600 text-center">
              • Remove all your data
            </Text>
          </View>

          <Text className="text-base font-rubik-medium text-red-600 text-center mb-6">
            This action cannot be undone!
          </Text>

          <View className="flex-row justify-between gap-2">
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
              className="flex-1 bg-red-600 rounded-full py-3 flex-row justify-center items-center"
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
