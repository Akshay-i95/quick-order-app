import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useState } from "react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  Text,
  Box,
  Icon,
  Badge,
  Button,
  Banner,
  Divider,
  Checkbox,
  Collapsible,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  SettingsIcon,
  ProductIcon,
  OrderIcon,
  ThemeEditIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { createQuickOrderPage, getActiveTheme } from "../services/shopifyPages.server";
import { getMainMenu, updateMenu, createMainMenu } from "../services/shopifyMenus.server";

export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);

  try {
    // Use the shop domain and access token from the current authenticated session
    // This ensures it works for any store that has the app installed
    const shopDomain = session.shop;
    const accessToken = session.accessToken;
    
    console.log("Using shop domain:", shopDomain);
    console.log("Session ID:", session.id);
    
    if (!shopDomain || !accessToken) {
      throw new Error("Shop domain and access token are required from session");
    }
    
    const newPage = await createQuickOrderPage(shopDomain, accessToken);
    const themeId = await getActiveTheme(shopDomain, accessToken);
    const previewPath = `/pages/quick-order`;
    
    // Extract shop name from domain (remove .myshopify.com)
    const shopName = shopDomain.replace('.myshopify.com', '');
    const customizeUrl = `https://admin.shopify.com/store/${shopName}/themes/${themeId}/editor?customCss=true&previewPath=${encodeURIComponent(previewPath)}`;

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
      customizeUrl: customizeUrl,
      storeUrl: `https://${shopDomain}/pages/quick-order`,
      shopDomain: shopDomain,
    });
  } catch (error) {
    console.error("Error setting up quick order page:", error);
    
    // Ensure shopDomain has a fallback value from the session
    let shopDomain = session?.shop || "unknown-shop.myshopify.com";
    
    // Provide dynamic URLs even during errors
    const shopName = shopDomain.replace('.myshopify.com', '');
    const fallbackCustomizeUrl = `https://admin.shopify.com/store/${shopName}/themes/current/editor`;
    
    return json({
      success: false,
      message: "Error setting up quick order page: " + error.message,
      customizeUrl: fallbackCustomizeUrl,
      storeUrl: `https://${shopDomain}/pages/quick-order`,
      shopDomain: shopDomain,
    });
  }
};

export default function CreateQuickOrder() {
  const { customizeUrl } = useLoaderData();

  const [expandedStep, setExpandedStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const steps = [
    {
      id: 1,
      title: 'Install Quick Order Extension',
      description: 'The Quick Order app block is already installed in your theme.',
      icon: CheckCircleIcon,
      guidance: 'Quick Order has been automatically added to your store theme. The extension includes storefront blocks, liquid templates, and JavaScript for seamless cart management.',
      color: 'success'
    },
    {
      id: 2,
      title: 'Create Quick Order Page',
      description: 'A dedicated Quick Order page has been created at /pages/quick-order.',
      icon: ThemeEditIcon,
      guidance: 'Navigate to your Online Store > Pages to find the Quick Order page. This page uses the page.quick-order.liquid template with the Quick Order app block embedded.',
      color: 'info'
    },
    {
      id: 3,
      title: 'Add to Navigation Menu',
      description: 'Link the Quick Order page in your main navigation for easy customer access.',
      icon: SettingsIcon,
      guidance: 'Go to Online Store > Navigation > Main Menu, and add a link to /pages/quick-order. Recommend placing it prominently for B2B customers.',
      color: 'info'
    },
    {
      id: 4,
      title: 'Configure Customer Metafields',
      description: 'Customer metafields enable persistent cart functionality across devices.',
      icon: ProductIcon,
      guidance: 'The app automatically creates customer.metafields.custom.quick_order_cart to store cart data. This allows customers to resume orders from any device.',
      color: 'warning'
    },
    {
      id: 5,
      title: 'Customize Theme Settings',
      description: 'Personalize colors, layout, and display options to match your brand.',
      icon: ThemeEditIcon,
      guidance: 'Use the theme editor to customize Quick Order styling. Adjust grid layouts, enable/disable features, and configure B2B-specific settings like SKU search and bulk ordering.',
      color: 'info'
    }
  ];

  const toggleStep = (stepId) => {
    setExpandedStep(expandedStep === stepId ? null : stepId);
  };

  const handleComplete = (stepId) => {
    if (completedSteps.includes(stepId)) {
      setCompletedSteps(completedSteps.filter(id => id !== stepId));
    } else {
      setCompletedSteps([...completedSteps, stepId]);
      if (completedSteps.length + 1 === steps.length) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 5000);
      }
    }
  };

  return (
    <Page>
      <TitleBar title="Quick Order" />

      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            
            {/* Header */}
            <Card>
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="400" blockAlign="center">
                  <Box background="bg-fill-info" padding="300" borderRadius="100">
                    <Icon source={OrderIcon} tone="info" />
                  </Box>
                  <BlockStack gap="100">
                    <Text as="h1" variant="headingLg" fontWeight="bold">
                      B2B Portal: Quick Order
                    </Text>
                    <Text as="p" variant="bodySm" tone="subdued" fontWeight="medium">
                      Smart Ordering for Smarter B2B
                    </Text>
                  </BlockStack>
                </InlineStack>
              </InlineStack>
            </Card>

            {/* Success Banner */}
            {showSuccess && (
              <Banner title="Order submitted successfully!" tone="success">
                <Text as="p" variant="bodyMd">
                  All items have been added to your cart. Proceed to checkout when ready.
                </Text>
              </Banner>
            )}

            {/* Introduction */}
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="300" blockAlign="start">
                  <Box>
                    <Icon source={CheckCircleIcon} tone="info" />
                  </Box>
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd" fontWeight="semibold">
                      Welcome to Quick Order
                    </Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Enable your B2B customers to place bulk orders in seconds with SKU-based ordering, variant selection, 
                      real-time stock validation, and persistent cart functionality across all devices.
                    </Text>
                  </BlockStack>
                </InlineStack>
              </BlockStack>
            </Card>

            {/* Order Process Steps */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg" fontWeight="semibold">
                  Quick Order Process
                </Text>
                
                <BlockStack gap="300">
                  {steps.map((step) => {
                    const isExpanded = expandedStep === step.id;
                    const isCompleted = completedSteps.includes(step.id);

                    return (
                      <Box 
                        key={step.id}
                        borderWidth="025"
                        borderColor="border"
                        borderRadius="200"
                        padding="0"
                      >
                        <Button
                          onClick={() => toggleStep(step.id)}
                          fullWidth
                          textAlign="left"
                          variant="plain"
                          disclosure={isExpanded ? "up" : "down"}
                        >
                          <Box padding="400">
                            <InlineStack gap="400" blockAlign="center" wrap={false}>
                              <Box 
                                background={isCompleted ? "bg-fill-success" : "bg-surface-secondary"} 
                                padding="300" 
                                borderRadius="100"
                                minWidth="40px"
                              >
                                <Icon 
                                  source={isCompleted ? CheckCircleIcon : step.icon} 
                                  tone={isCompleted ? "success" : "base"} 
                                />
                              </Box>
                              
                              <BlockStack gap="100">
                                <InlineStack gap="200" blockAlign="center">
                                  <Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">
                                    STEP {step.id}
                                  </Text>
                                  {isCompleted && (
                                    <Badge tone="success">COMPLETED</Badge>
                                  )}
                                </InlineStack>
                                <Text as="h3" variant="headingMd" fontWeight="semibold">
                                  {step.title}
                                </Text>
                                <Text as="p" variant="bodyMd" tone="subdued">
                                  {step.description}
                                </Text>
                              </BlockStack>
                            </InlineStack>
                          </Box>
                        </Button>

                        <Collapsible open={isExpanded} id={`step-${step.id}`}>
                          <Box background="bg-surface-secondary" padding="400" borderBlockStartWidth="025" borderColor="border">
                            <BlockStack gap="300">
                              <InlineStack gap="300" blockAlign="start">
                                <Box background="bg-fill-info" padding="200" borderRadius="100" minWidth="32px">
                                  <Icon source={CheckCircleIcon} tone="info" />
                                </Box>
                                <BlockStack gap="100">
                                  <Text as="h4" variant="bodyMd" fontWeight="semibold">
                                    Best Practice
                                  </Text>
                                  <Text as="p" variant="bodySm" tone="subdued">
                                    {step.guidance}
                                  </Text>
                                </BlockStack>
                              </InlineStack>
                              
                              <Box paddingBlockStart="200">
                                <Checkbox
                                  label="Mark as completed"
                                  checked={isCompleted}
                                  onChange={() => handleComplete(step.id)}
                                />
                              </Box>
                            </BlockStack>
                          </Box>
                        </Collapsible>
                      </Box>
                    );
                  })}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Action Buttons */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg" fontWeight="semibold">
                  Quick Actions
                </Text>
                
                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    size="large"
                    icon={OrderIcon}
                    url="/pages/quick-order"
                    target="_blank"
                  >
                    View Quick Order Page
                  </Button>

                  <Button
                    size="large"
                    icon={ThemeEditIcon}
                    url={customizeUrl}
                    target="_blank"
                  >
                    Customize in Theme Editor
                  </Button>
                </InlineStack>

                <Divider />

                <Banner tone="info">
                  <Text as="p" variant="bodyMd">
                    Need advanced B2B features like customer-specific pricing, quote management, or approval workflows? 
                    <Button url="mailto:support@i95dev.com" variant="plain" removeUnderline>
                      Contact i95Dev
                    </Button> to upgrade to the full B2B Portal.
                  </Text>
                </Banner>
              </BlockStack>
            </Card>

            {/* Features Overview */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd" fontWeight="semibold">
                  Key Features
                </Text>
                
                <BlockStack gap="300">
                  <InlineStack gap="300" blockAlign="start">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">SKU-Based Search:</Text> Customers can search by SKU or product name with auto-complete suggestions
                    </Text>
                  </InlineStack>
                  
                  <InlineStack gap="300" blockAlign="start">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">Variant Selection:</Text> Inline variant picker for size, color, and material options
                    </Text>
                  </InlineStack>
                  
                  <InlineStack gap="300" blockAlign="start">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">Real-Time Validation:</Text> Instant stock checking and quantity validation before checkout
                    </Text>
                  </InlineStack>
                  
                  <InlineStack gap="300" blockAlign="start">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">Persistent Cart:</Text> Cart data syncs across devices using customer metafields
                    </Text>
                  </InlineStack>
                  
                  <InlineStack gap="300" blockAlign="start">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p" variant="bodyMd">
                      <Text as="span" fontWeight="semibold">Bulk Ordering:</Text> Add multiple products with different quantities in one click
                    </Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Footer */}
            <Box paddingBlockStart="400">
              <InlineStack align="center">
                <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                  Faster ordering • Happier customers • Increased sales
                </Text>
              </InlineStack>
            </Box>
            
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
