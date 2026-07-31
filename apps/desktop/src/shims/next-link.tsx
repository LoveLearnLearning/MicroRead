import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from "react";
import { normalizeHref, useDesktopRouter } from "../router";

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  replace?: boolean;
}

const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link({ href, replace, onClick, ...props }, ref) {
  const router = useDesktopRouter();
  const target = normalizeHref(href);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (replace) router.replace(target); else router.push(target);
  }

  return <a {...props} ref={ref} href={`#${target}`} onClick={handleClick} />;
});

export default Link;
