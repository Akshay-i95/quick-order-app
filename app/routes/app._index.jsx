import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  Box,
  List,
  Link,
  InlineStack,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  // Auto-create metafield definitions for quick order functionality
  const metafieldDefinitions = [
    {
      name: "Quick Order Cart Data",
      namespace: "quick_order",
      key: "cart_data",
      description: "Stores persistent cart data for quick order functionality",
      type: "json",
      ownerType: "CUSTOMER",
    },
  ];

  try {
    for (const definition of metafieldDefinitions) {
      // Check if the metafield definition already exists
      const checkResponse = await admin.graphql(`
        query GetMetafieldDefinitions($ownerType: MetafieldOwnerType!) {
          metafieldDefinitions(first: 50, ownerType: $ownerType) {
            edges {
              node {
                id
                name
                namespace
                key
              }
            }
          }
        }
      `, {
        variables: {
          ownerType: definition.ownerType,
        },
      });

      const checkData = await checkResponse.json();
      const existingDefinition = checkData.data?.metafieldDefinitions?.edges?.find(
        edge => edge.node.namespace === definition.namespace && edge.node.key === definition.key
      );

      if (!existingDefinition) {
        // Create metafield definition automatically
        const response = await admin.graphql(`
          mutation CreateMetafieldDefinition($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition {
                id
                name
                namespace
                key
              }
              userErrors {
                field
                message
              }
            }
          }
        `, {
          variables: { definition },
        });

        const responseData = await response.json();
        
        if (responseData.data?.metafieldDefinitionCreate?.userErrors?.length === 0) {
          console.log(`${definition.key} metafield definition created automatically on app load`);
        } else {
          console.error(`Error creating ${definition.key} metafield definition:`, responseData.data?.metafieldDefinitionCreate?.userErrors);
        }
      }
    }
  } catch (error) {
    console.error("Error auto-creating metafield definitions:", error);
  }

  return null;
};

export default function Index() {

  return (
    <Page>

      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">
                    👋 Welcome to i95Dev Wholesale!
                  </Text>
                  <Text variant="bodyMd" as="p">
                    The <strong>i95Dev Wholesale App</strong> is designed to simplify
                    B2B & wholesale operations for your Shopify store. With features
                    like bulk ordering, customer-specific pricing, and volume-based
                    discounts, you can offer a seamless buying experience to your
                    wholesale customers.
                  </Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">
                    Wholesale Features
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Unlock powerful tools designed for wholesale and B2B operations:
                  </Text>
                  <List>
                    <List.Item>
                      <strong>SKU-based Product Search:</strong> Quickly locate products by entering SKU codes, making bulk ordering fast and efficient.
                    </List.Item>
                    <List.Item>
                      <strong>Bulk Order Management:</strong> Add multiple products with custom quantities to your cart in a single step.
                    </List.Item>
                    <List.Item>
                      <strong>Real-time Inventory Check:</strong> Instantly verify product availability before placing orders, reducing errors and backorders.
                    </List.Item>
                    <List.Item>
                      <strong>Draft Order Creation:</strong> Generate draft orders directly in Shopify for easy review and approval.
                    </List.Item>
                    <List.Item>
                      <strong>Admin Configuration:</strong> Customize app settings, restrict SKUs, set default quantities, and manage user permissions.
                    </List.Item>
                    <List.Item>
                      <strong>Volume Discounts:</strong> Automatically apply special pricing for bulk purchases to incentivize larger orders.
                    </List.Item>
                    <List.Item>
                      <strong>Customer-Specific Pricing:</strong> Set unique prices for different wholesale customers or groups.
                    </List.Item>
                    <List.Item>
                      <strong>Order History & Reordering:</strong> Enable wholesale buyers to quickly reorder frequently purchased products.
                    </List.Item>
                    <List.Item>
                      <strong>Flexible Payment Terms:</strong> Support invoicing and net payment terms for B2B clients.
                    </List.Item>
                    <List.Item>
                      <strong>Dedicated Support:</strong> Provide priority support and account management for wholesale partners.
                    </List.Item>
                  </List>
                </BlockStack>
                <InlineStack gap="300">
                  <Button
                    url="/app/settings"
                    variant="plain"
                  >
                    Connector Settings
                  </Button>

                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <BlockStack gap="500">
              <Card>
                <BlockStack gap="200">

                  {/* Wholesale Benefits Section */}
                  <BlockStack gap="200">
                    <Text as="h3" variant="headingMd">
                      Wholesale Benefits
                    </Text>
                    <List>
                      <List.Item>
                        <strong>Volume Discounts:</strong> Offer special pricing for bulk purchases to incentivize larger orders.
                      </List.Item>
                      <List.Item>
                        <strong>Customer-Specific Pricing:</strong> Set custom prices for different wholesale customers or groups.
                      </List.Item>
                      <List.Item>
                        <strong>Streamlined Reordering:</strong> Make it easy for wholesale buyers to reorder frequently purchased products.
                      </List.Item>
                      <List.Item>
                        <strong>Flexible Payment Terms:</strong> Support invoicing and net payment terms for B2B clients.
                      </List.Item>
                      <List.Item>
                        <strong>Dedicated Support:</strong> Provide priority support and account management for wholesale partners.
                      </List.Item>
                    </List>
                  </BlockStack>
                </BlockStack>
              </Card>
            </BlockStack>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
