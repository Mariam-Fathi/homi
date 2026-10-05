import icons from "./icons";

export const categories = [
  { title: "All", category: "All" },
  { title: "Compounds", category: "Compounds" },
  { title: "Apartments", category: "Apartments" },
  { title: "Villas", category: "Villas" },
  { title: "Townhouses", category: "Townhouses" },
  { title: "Commercial Units", category: "Commercial" },
];

export const settings = [
  {
    title: "Favorites",
    icon: icons.heart,
    href: '/favorite' as const,
  },
  {
    title: "My Viewings",
    icon: icons.calendar,
    href: '/viewings' as const,
  },
  {
    title: "Notifications",
    icon: icons.bell,
    href: '/notifications' as const,
  }
];

export const facilities = [
  {
    title: "Laundry",
    icon: icons.laundry,
  },
  {
    title: "Parking",
    icon: icons.carPark,
  },
  {
    title: "Gym",
    icon: icons.dumbell,
  },
  {
    title: "Wifi",
    icon: icons.wifi,
  },
  {
    title: "Pet-friendly",
    icon: icons.dog,
  },
];
