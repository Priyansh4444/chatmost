import { ConvexReactClient } from "convex/react";
import { ConvexHttpClient } from "convex/browser";

// Get Convex URL from environment variables
const convexUrl = (import.meta.env.VITE_CONVEX_URL as string | undefined)?.trim() || "";

export const isConvexActive = Boolean(convexUrl);

// Shared Convex React & HTTP Clients
// If no URL is provided, fallback to a dummy URL to allow ConvexProvider to mount gracefully
export const convexClient = new ConvexReactClient(convexUrl || "https://dummy-preview.convex.cloud", {
  unsavedChangesWarning: false,
});

export const convexHttpClient = convexUrl ? new ConvexHttpClient(convexUrl) : null;
