import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
//import { prisma } from "../db.server";
import { createQuickOrderPage} from "../services/shopifyPages.server";
//import { registerQuickOrderScript  } from "../services/shopifyScripts.server";
import { getMainMenu, updateMenu, createMainMenu } from "../services/shopifyMenus.server";
//import { getShopSession } from "../utils/shop-session.server";
//import { createRandomSnowboard } from "../../server/services/shopifyProducts.server";
//import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const shopDomain = process.env.SHOPIFY_DOMAIN;
  const accessToken = process.env.ACCESS_TOKEN;
  const newPage = await createQuickOrderPage(shopDomain, accessToken);
  if (newPage) {
    const menu = await getMainMenu(admin);
    if (menu) {
      await updateMenu(admin, menu, newPage);
    } else {
      await createMainMenu(admin, newPage);
    }
  }
  //}
  //return null;
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/create-quick-order">Quick Orders</Link>
        <Link to="/app/outbound-message">OutBound Message Queue</Link>
        <Link to="/app/inbound-message">InBound Message Queue</Link>
        <Link to="/app/online-store">Online Store</Link>
        <Link to="/app/settings">Account & Settings</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
