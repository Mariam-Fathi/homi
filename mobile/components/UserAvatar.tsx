import { Text, View } from "react-native";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("") || "?";

/** The user's initials in a circle. */
const UserAvatar = ({
  name,
  size,
  textClassName = "text-base",
}: {
  name: string;
  size: number;
  textClassName?: string;
}) => (
  <View
    style={{ width: size, height: size }}
    className="rounded-full bg-primary-200 items-center justify-center"
  >
    <Text className={`font-rubik-bold text-primary-300 ${textClassName}`}>
      {initials(name)}
    </Text>
  </View>
);

export default UserAvatar;
