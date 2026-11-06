import {
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

import ErrorBoundary from "#/components/ErrorBoundary";

import App from "./app";
import Home from "./home";
import Sandbox from "./sandbox";
import Tests from "./tests";

const rootRoute = createRootRoute({
  component: App,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

const testsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tests",
  component: Tests,
});

const testsIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tests/$id",
  component: function TestsWithId() {
    return <Tests />;
  },
});

const sandboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/sandbox",
  component: Sandbox,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  testsRoute,
  testsIdRoute,
  sandboxRoute,
]);

const router = createRouter({
  routeTree,
  basepath: "/satie",
  defaultNotFoundComponent: () => <Home />,
} as any);

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element not found");
const root = createRoot(rootElement);

root.render(
  <ErrorBoundary>
    <RouterProvider router={router} />
  </ErrorBoundary>,
);
