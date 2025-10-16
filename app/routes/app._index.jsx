import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { useEffect, useState } from "react";
import { useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  BlockStack,
  InlineStack,
  InlineGrid,
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
  DeleteIcon,
} from "@shopify/polaris-icons";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { createQuickOrderPage, getActiveTheme } from "../services/shopifyPages.server";
import { getMainMenu, updateMenu, createMainMenu } from "../services/shopifyMenus.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  try {
    const shopDomain = process.env.SHOPIFY_DOMAIN;
    const accessToken = process.env.ACCESS_TOKEN;
    const newPage = await createQuickOrderPage(shopDomain, accessToken);
    const themeId = await getActiveTheme(shopDomain, accessToken);
    const previewPath = `/pages/quick-order`;
    const customizeUrl = `https://${shopDomain}/admin/themes/${themeId}/editor?previewPath=${encodeURIComponent(
      previewPath
    )}`;

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
    return json({
      success: false,
      message: "Error setting up quick order page: " + error.message,
    });
  }
};

export default function Index() {
  const { customizeUrl, storeUrl, shopDomain } = useLoaderData();
  const fetcher = useFetcher();

  // Trigger the Quick Order metafield setup when this component mounts
  useEffect(() => {
    // This ensures metafield definitions get created when the app is installed/accessed
    fetcher.load("/app/quickorder-metafield-setup");
  }, []);

  const [expandedStep, setExpandedStep] = useState(null);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);

  const steps = [
    {
      id: 1,
      title: 'Add Quick Order Block',
      description: 'Add the Quick Order app block to your theme for instant B2B ordering.',
      icon: ThemeEditIcon,
      guidance: 'Follow these simple steps to enable Quick Order:\n\n1. Click "Add Quick Order Block" button below\n2. In the theme editor, click "Add block"\n3. Navigate to "Apps" section\n4. Find and select "Quick Order Link"\n5. Click "Save" to publish changes\n\nThis installs the complete Quick Order system with cart management, inventory validation, and multi-device support.',
      color: 'info',
      hasButton: true,
      buttonText: 'Add Quick Order Block',
      buttonAction: 'addBlock'
    },
    {
      id: 2,
      title: 'Test Quick Order in Store',
      description: 'Visit your online store and test the Quick Order functionality.',
      icon: OrderIcon,
      guidance: 'Go to your online store and navigate to the Quick Order page to test the functionality. The Quick Order page is automatically created at /pages/quick-order with full B2B ordering capabilities.',
      color: 'info',
      hasButton: true,
      buttonText: 'Visit Quick Order Page',
      buttonAction: 'visitStore'
    },
    {
      id: 3,
      title: 'Customize Theme Settings',
      description: 'Personalize colors, layout, and display options to match your brand.',
      icon: SettingsIcon,
      guidance: 'Use the theme editor to customize Quick Order styling. Adjust grid layouts, enable/disable features, and configure B2B-specific settings like SKU search and bulk ordering.',
      color: 'info'
    },
    {
      id: 4,
      title: 'App Uninstallation Guide',
      description: 'Important: What to delete when removing the Quick Order app.',
      icon: DeleteIcon,
      guidance: 'Follow these steps to completely remove the Quick Order app:\n\n1. Delete customer metafields from Settings > Customer events > Metafields\n2. Remove the Quick Order page from Online Store > Pages\n\nThis ensures complete cleanup of all app-related data and pages.',
      color: 'warning',
      hasButton: true,
      hasMultipleButtons: true,
      buttons: [
        {
          text: 'Metafield Uninstall',
          action: 'metafields',
          icon: 'settings'
        },
        {
          text: 'Delete Pages',
          action: 'pages',
          icon: 'product'
        }
      ]
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
      <TitleBar title="i95Dev B2B Portal - Quick Order" />

      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            
            {/* Header */}
            <Card>
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Box padding="200">
                    <img 
                      src="https://www.i95dev.com/wp-content/uploads/2020/08/i95dev-Logo-red.png" 
                      alt="i95Dev Logo" 
                      style={{ height: '40px', width: 'auto' }}
                    />
                  </Box>
                  <Box background="bg-fill-neutral" width="1px" minHeight="40px" />
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
              <Banner title="Setup completed successfully!" tone="success">
                <Text as="p" variant="bodyMd">
                  All setup steps have been completed. Your Quick Order system is ready for B2B customers.
                </Text>
              </Banner>
            )}

            {/* Introduction */}
            <Card>
              <BlockStack gap="300">
                <InlineStack gap="300" blockAlign="center">
                  <Box>
                    <Icon source={CheckCircleIcon} tone="info" />
                  </Box>
                  <Text as="h2" variant="headingMd" fontWeight="semibold">
                    Welcome to Quick Order
                  </Text>
                </InlineStack>
                <Box marginInlineStart="56px">
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Enable your B2B customers to place bulk orders in seconds with SKU-based ordering, variant selection, 
                    real-time stock validation, and persistent cart functionality across all devices.
                  </Text>
                </Box>
              </BlockStack>
            </Card>

            {/* Order Process Steps */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg" fontWeight="semibold">
                  Quick Order Setup
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
                            <InlineStack gap="200" blockAlign="center" wrap={false}>
                              <Box 
                                background={isCompleted ? "bg-fill-success-secondary" : "bg-surface-secondary"} 
                                padding="400" 
                                borderRadius="100"
                                minWidth="48px"
                              >
                                <Icon 
                                  source={isCompleted ? CheckCircleIcon : step.icon} 
                                  tone={isCompleted ? "success" : "base"}
                                  size="large"
                                />
                              </Box>
                              
                              <BlockStack gap="100">
                                <InlineStack gap="100" blockAlign="center">
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
                              <InlineStack gap="200" blockAlign="start">
                                <Box background="bg-fill-info" padding="200" borderRadius="100" minWidth="32px">
                                  <Icon source={CheckCircleIcon} tone="info" />
                                </Box>
                                <BlockStack gap="100">
                                  <Text as="h4" variant="bodyMd" fontWeight="semibold">
                                    {step.title}
                                  </Text>
                                  <Box>
                                    {step.id === 1 ? (
                                      <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Follow these simple steps to enable Quick Order:
                                        </Text>
                                        <Box as="ol" paddingInlineStart="400">
                                          <Text as="li" variant="bodySm" tone="subdued">Click "Add Quick Order Block" button below</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">In the theme editor, click "Add block"</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Navigate to "Apps" section</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Find and select "Quick Order Link"</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Click "Save" to publish changes</Text>
                                        </Box>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          This installs the complete Quick Order system with cart management, inventory validation, and multi-device support.
                                        </Text>
                                      </BlockStack>
                                    ) : step.id === 2 ? (
                                      <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Test the Quick Order functionality with these steps:
                                        </Text>
                                        <Box as="ol" paddingInlineStart="400">
                                          <Text as="li" variant="bodySm" tone="subdued">Click "Visit Quick Order Page" button below</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Search for products by name or SKU</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Add quantities and test variant selection</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Verify cart functionality and checkout process</Text>
                                        </Box>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          The Quick Order page is automatically created at /pages/quick-order with full B2B ordering capabilities.
                                        </Text>
                                      </BlockStack>
                                    ) : step.id === 3 ? (
                                      <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Customize the Quick Order appearance and settings:
                                        </Text>
                                        <Box as="ol" paddingInlineStart="400">
                                          <Text as="li" variant="bodySm" tone="subdued">Use the theme editor to access Quick Order settings</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Adjust colors, layout, and grid options</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Configure B2B-specific features like SKU search</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Enable/disable bulk ordering options</Text>
                                        </Box>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Personalize the experience to match your brand and B2B customer needs.
                                        </Text>
                                      </BlockStack>
                                    ) : step.id === 4 ? (
                                      <BlockStack gap="200">
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          Follow these steps to completely remove the Quick Order app:
                                        </Text>
                                        <Box as="ol" paddingInlineStart="400">
                                          <Text as="li" variant="bodySm" tone="subdued">Delete customer metafields from Settings {"> "} Customer events {"> "} Metafields</Text>
                                          <Text as="li" variant="bodySm" tone="subdued">Remove the Quick Order page from Online Store {"> "} Pages</Text>
                                        </Box>
                                        <Text as="p" variant="bodySm" tone="subdued">
                                          This ensures complete cleanup of all app-related data and pages.
                                        </Text>
                                      </BlockStack>
                                    ) : (
                                      <Text as="p" variant="bodySm" tone="subdued">
                                        {step.guidance}
                                      </Text>
                                    )}
                                  </Box>
                                </BlockStack>
                              </InlineStack>
                              
                              {step.hasButton && (
                                <Box paddingBlockStart="300">
                                  {step.hasMultipleButtons ? (
                                    <InlineStack gap="300">
                                      {step.buttons.map((button, index) => (
                                        <Button
                                          key={index}
                                          variant="primary"
                                          size="medium"
                                          icon={
                                            button.icon === 'settings' ? SettingsIcon : 
                                            button.icon === 'product' ? ProductIcon : 
                                            OrderIcon
                                          }
                                          url={
                                            button.action === 'metafields' ? `https://admin.shopify.com/store/${shopDomain.replace('.myshopify.com', '')}/settings/custom_data/customer/metafields` : 
                                            button.action === 'pages' ? `https://admin.shopify.com/store/${shopDomain.replace('.myshopify.com', '')}/pages?selectedView=all` : 
                                            storeUrl
                                          }
                                          target="_blank"
                                        >
                                          {button.text}
                                        </Button>
                                      ))}
                                    </InlineStack>
                                  ) : (
                                    <Button
                                      variant="primary"
                                      size="medium"
                                      icon={
                                        step.buttonAction === 'addBlock' ? ThemeEditIcon : 
                                        OrderIcon
                                      }
                                      url={
                                        step.buttonAction === 'addBlock' ? customizeUrl : 
                                        storeUrl
                                      }
                                      target="_blank"
                                    >
                                      {step.buttonText}
                                    </Button>
                                  )}
                                </Box>
                              )}
                              
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



            {/* Key Features */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingLg" fontWeight="semibold">
                  Key Features
                </Text>
                
                <Box as="ul" paddingInlineStart="0">
                  <Box as="li" style={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                    <Box style={{ marginTop: '2px' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </Box>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm" fontWeight="semibold">
                        SKU-Based Search
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Customers can search by SKU or product name with auto-complete suggestions
                      </Text>
                    </BlockStack>
                  </Box>
                  
                  <Box as="li" style={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                    <Box style={{ marginTop: '2px' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </Box>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm" fontWeight="semibold">
                        Variant Selection
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Inline variant picker for size, color, and material options
                      </Text>
                    </BlockStack>
                  </Box>
                  
                  <Box as="li" style={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                    <Box style={{ marginTop: '2px' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </Box>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm" fontWeight="semibold">
                        Real-Time Validation
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Instant stock checking and quantity validation before checkout
                      </Text>
                    </BlockStack>
                  </Box>
                  
                  <Box as="li" style={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                    <Box style={{ marginTop: '2px' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </Box>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm" fontWeight="semibold">
                        Persistent Cart
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Cart data syncs across devices using customer metafields
                      </Text>
                    </BlockStack>
                  </Box>
                  
                  <Box as="li" style={{ listStyle: 'none', display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                    <Box style={{ marginTop: '2px' }}>
                      <Icon source={CheckCircleIcon} tone="success" />
                    </Box>
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingSm" fontWeight="semibold">
                        Bulk Ordering
                      </Text>
                      <Text as="p" variant="bodyMd" tone="subdued">
                        Add multiple products with different quantities in one click
                      </Text>
                    </BlockStack>
                  </Box>
                </Box>
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
