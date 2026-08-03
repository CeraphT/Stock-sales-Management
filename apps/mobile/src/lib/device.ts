import * as Device from "expo-device";
import { Platform } from "react-native";

import { DevicePlatform } from "./api/enums";

// Mirrors DeviceContext.Name/.Platform on the MAUI client — sent on every
// login/refresh/company-create call for the server's Device bookkeeping.
export const deviceName = Device.deviceName ?? Device.modelName ?? "Unknown device";

export const devicePlatform: DevicePlatform =
  Platform.OS === "android" || Platform.OS === "ios" ? DevicePlatform.Mobile : DevicePlatform.Web;
