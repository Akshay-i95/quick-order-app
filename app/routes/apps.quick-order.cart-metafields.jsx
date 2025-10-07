import { json } from "@remix-run/node";
import { authenticate, unauthenticated } from "../shopify.server";

// CORS headers for cross-origin requests from storefront
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shopify-Shop-Domain",
};

// Helper to get shop domain from request
function getShopDomain(request) {
  const url = new URL(request.url);
  const shopParam = url.searchParams.get("shop");
  const headerShop = request.headers.get("X-Shopify-Shop-Domain");
  
  // For app proxy, the shop domain is in the URL path
  // Format: https://shop-domain.myshopify.com/apps/quick-order/...
  const hostShop = url.hostname;
  
  // Always return the shop domain from env as fallback
  const shopDomain = shopParam || headerShop || process.env.SHOPIFY_DOMAIN;
  
  console.log('🔍 Shop domain detection:', {
    shopParam,
    headerShop,
    hostShop,
    envDomain: process.env.SHOPIFY_DOMAIN,
    finalDomain: shopDomain
  });
  
  return shopDomain;
}

export async function loader({ request }) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const shopDomain = getShopDomain(request);
  
  if (!customerId || customerId === 'null') {
    return json({ error: "Customer ID is required" }, { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  try {
    // Use direct API call with ACCESS_TOKEN for customer data access
    let admin;
    
    if (process.env.ACCESS_TOKEN) {
      console.log('🔄 Using direct API with ACCESS_TOKEN in loader');
      admin = {
        graphql: async (query, variables) => {
          const response = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': process.env.ACCESS_TOKEN
            },
            body: JSON.stringify({ query, variables: variables?.variables })
          });
          return response;
        }
      };
      console.log('✅ Direct API ready for loader');
    } else {
      // Fallback to unauthenticated admin (will fail for customer data but try anyway)
      console.log('⚠️  No ACCESS_TOKEN found, trying unauthenticated admin...');
      const adminResult = await unauthenticated.admin(shopDomain);
      admin = adminResult.admin;
      console.log('✅ Unauthenticated admin API ready for loader');
    }
    
    // Get customer metafields for cart data
    const response = await admin.graphql(
      `#graphql
        query getCustomerMetafields($customerId: ID!) {
          customer(id: $customerId) {
            id
            metafields(first: 250, namespace: "quick_order") {
              edges {
                node {
                  id
                  namespace
                  key
                  value
                  type
                }
              }
            }
          }
        }`,
      {
        variables: {
          customerId: customerId.includes('gid://') ? customerId : `gid://shopify/Customer/${customerId}`,
        },
      }
    );

    const data = await response.json();
    
    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return json({ error: "Failed to fetch metafields", details: data.errors }, { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    const metafields = data.data?.customer?.metafields?.edges || [];
    
    // Look for cart_data metafield specifically
    const cartDataMetafield = metafields.find(
      edge => edge.node.key === "cart_data"
    );

    return json({
      customerId,
      cartData: cartDataMetafield ? JSON.parse(cartDataMetafield.node.value || "{}") : {},
      metafields: metafields.map(edge => edge.node),
    }, { headers: corsHeaders });
    
  } catch (error) {
    console.error("Error fetching customer metafields:", error);
    return json({ error: "Internal server error", details: error.message }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

export async function action({ request }) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const shopDomain = getShopDomain(request);
  console.log('🔧 Action called for shop:', shopDomain);

  try {
    const formData = await request.formData();
    const customerId = formData.get("customerId");
    const cartData = formData.get("cartData");

    console.log('📝 Form data received:', { 
      customerId, 
      cartDataLength: cartData?.length,
      hasCartData: !!cartData 
    });

    if (!customerId || customerId === 'null' || !cartData) {
      console.error('❌ Missing required data:', { customerId, hasCartData: !!cartData });
      return json({ error: "Customer ID and cart data are required" }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Use direct API call with ACCESS_TOKEN for customer data access
    console.log('🔌 Getting admin API for shop:', shopDomain);
    let admin;
    
    if (process.env.ACCESS_TOKEN) {
      console.log('🔄 Using direct API with ACCESS_TOKEN');
      admin = {
        graphql: async (query, variables) => {
          const response = await fetch(`https://${shopDomain}/admin/api/2025-01/graphql.json`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Shopify-Access-Token': process.env.ACCESS_TOKEN
            },
            body: JSON.stringify({ query, variables: variables?.variables })
          });
          return response;
        }
      };
      console.log('✅ Direct API ready');
    } else {
      // Fallback to unauthenticated admin (will fail for customer data but try anyway)
      console.log('⚠️  No ACCESS_TOKEN found, trying unauthenticated admin...');
      const adminResult = await unauthenticated.admin(shopDomain);
      admin = adminResult.admin;
      console.log('✅ Unauthenticated admin API ready');
    }

    // Validate JSON
    let parsedCartData;
    try {
      parsedCartData = JSON.parse(cartData);
    } catch (e) {
      return json({ error: "Invalid JSON format for cart data" }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    // Format customer ID properly
    const formattedCustomerId = customerId.includes('gid://') 
      ? customerId 
      : `gid://shopify/Customer/${customerId}`;

    console.log('💾 Saving metafield for customer:', formattedCustomerId);
    console.log('📦 Cart data to save:', cartData);

    // Create or update customer metafield for cart data
    const response = await admin.graphql(
      `#graphql
        mutation customerUpdate($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer {
              id
              metafields(first: 1, namespace: "quick_order") {
                edges {
                  node {
                    id
                    key
                    value
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }`,
      {
        variables: {
          input: {
            id: formattedCustomerId,
            metafields: [
              {
                namespace: "quick_order",
                key: "cart_data",
                value: cartData,
                type: "json",
              },
            ],
          },
        },
      }
    );

    console.log('📡 GraphQL response status:', response.status);
    
    // Check if response is HTML (indicates auth error)
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/html')) {
      console.error('❌ Received HTML response instead of JSON - likely auth issue');
      return json({ 
        error: "Authentication failed - received HTML response", 
        details: "The request was redirected to a Shopify page instead of returning API data" 
      }, { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    const data = await response.json();
    console.log('📊 GraphQL response data:', JSON.stringify(data, null, 2));
    
    if (data.errors || data.data?.customerUpdate?.userErrors?.length > 0) {
      console.error("Metafield update errors:", data.errors || data.data.customerUpdate.userErrors);
      return json({ 
        error: "Failed to update cart data", 
        details: data.errors || data.data.customerUpdate.userErrors 
      }, { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    console.log('✅ Metafield saved successfully for customer:', formattedCustomerId);

    return json({ 
      success: true, 
      customerId: formattedCustomerId,
      cartData: parsedCartData,
      customer: data.data.customerUpdate.customer 
    }, { headers: corsHeaders });
    
  } catch (error) {
    console.error("Error updating customer metafield:", error);
    return json({ 
      error: "Internal server error", 
      details: error.message 
    }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

// Handle OPTIONS requests for CORS
export async function options() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
