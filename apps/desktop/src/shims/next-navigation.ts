import { useDesktopRouter } from "../router";

export function usePathname(): string {
  return useDesktopRouter().pathname;
}

export function useSearchParams(): URLSearchParams {
  return useDesktopRouter().searchParams;
}

export function useParams<T extends Record<string, string> = Record<string, string>>(): T {
  return useDesktopRouter().params as T;
}

export function useRouter() {
  const router = useDesktopRouter();
  return { push: router.push, replace: router.replace, refresh: router.refresh };
}

export function redirect(href: string): never {
  window.location.hash = href;
  throw new Error(`Redirecting to ${href}`);
}
