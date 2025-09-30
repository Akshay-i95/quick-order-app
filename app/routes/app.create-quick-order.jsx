import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  BlockStack,
  List,
  InlineStack,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { createQuickOrderPage , getActiveTheme} from "../services/shopifyPages.server";
import { getMainMenu, updateMenu, createMainMenu } from "../services/shopifyMenus.server";


export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Create quick order page and update menu
  try {
    const shopDomain = process.env.SHOPIFY_DOMAIN;
    const accessToken = process.env.ACCESS_TOKEN;
    const newPage = await createQuickOrderPage(shopDomain, accessToken);
    const themeId = await getActiveTheme(shopDomain, accessToken);
    const previewPath = `/pages/quick-order`;
    const customizeUrl = `https://${shopDomain}/admin/themes/${themeId}/editor?previewPath=${encodeURIComponent(previewPath)}`;
    //console.log(customizeUrl);
    if (newPage) {
      const menu = await getMainMenu(admin);
      if (menu) {
        await updateMenu(admin, menu, newPage);
      } else {
        await createMainMenu(admin, newPage);
      }
    }

    return json({
      success: true,
      message: "Quick Order page created/updated successfully",
      pageHandle: newPage?.handle || "quick-order",
      customizeUrl:customizeUrl
    });
  } catch (error) {
    console.error("Error setting up quick order page:", error);
    return json({
      success: false,
      message: "Error setting up quick order page: " + error.message
    });
  }
};

export default function CreateQuickOrder() {
  const { customizeUrl } = useLoaderData();

  return (
    <Page>
      <TitleBar title="Quick Order Management" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    Quick Order Page 🛒
                  </Text>
                  <Text variant="bodyMd" as="p">
                    This page manages the Quick Order functionality for your store.
                    The Quick Order page allows customers to quickly add multiple products to their cart.
                  </Text>
                </BlockStack>

                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Quick Order Features:
                  </Text>
                  <List>
                    <List.Item>Customer login protection</List.Item>
                    <List.Item>Bulk product ordering interface</List.Item>
                    <List.Item>Quantity input for multiple items</List.Item>
                    <List.Item>Add to cart functionality</List.Item>
                    <List.Item>Responsive design for mobile and desktop</List.Item>
                    <List.Item>Integration with existing theme</List.Item>
                  </List>
                </BlockStack>

                <Text variant="bodyMd" as="p">
                  The Quick Order page has been created with the handle "quick-order" and is available
                  at /pages/quick-order on your storefront. It requires customers to be logged in to access the functionality.
                </Text>

                <Text variant="bodyMd" as="p">
                  Please click below link to add your quick order page.
                  <InlineStack gap="500">
                    <a href={customizeUrl}
                       target="_blank"
                       rel="noopener noreferrer"
                       style={{
                         display: "inline-block",
                         padding: "0.5rem 1rem",           // px-4 py-2
                         backgroundColor: "#15803d",       // bg-green-700
                         color: "#ffffff",                 // text-white
                         fontWeight: "600",                // font-semibold
                         borderRadius: "0.375rem",         // rounded
                         textDecoration: "none",
                         transition: "background-color 0.2s ease",
                       }}
                    >
                      Add Quick Order Block
                    </a>
                  </InlineStack>
                  Visit your storefront to see the Quick Order page in action!
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
