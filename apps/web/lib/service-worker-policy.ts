export function shouldRegisterServiceWorker(
  location: Pick<Location, "hostname" | "protocol">,
  environment: string | undefined,
): boolean {
  return environment === "production"
    && location.hostname !== "tauri.localhost"
    && location.protocol.startsWith("http");
}
