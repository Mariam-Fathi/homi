// Expo inlines EXPO_PUBLIC_* variables at build time; reading them in one module also
// lets tests substitute values (see jest.setup.js).
export const API_URL = process.env.EXPO_PUBLIC_API_URL;
