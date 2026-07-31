import { lazy, Suspense, type ComponentType } from "react";

interface DynamicOptions {
  loading?: ComponentType;
  ssr?: boolean;
}

export default function dynamic<Props extends object>(
  loader: () => Promise<ComponentType<Props> | { default: ComponentType<Props> }>,
  options: DynamicOptions = {},
): ComponentType<Props> {
  const LazyComponent = lazy(async () => {
    const loaded = await loader();
    return typeof loaded === "object" && "default" in loaded ? loaded : { default: loaded };
  });
  const Loading = options.loading;
  return function DynamicComponent(props: Props) {
    return <Suspense fallback={Loading ? <Loading /> : null}><LazyComponent {...props} /></Suspense>;
  };
}
