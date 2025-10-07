import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";

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
  
  // For app proxy, the shop domain is in the hostname
  const hostShop = url.hostname;
  
  // Priority: URL param > header > hostname > env
  const shopDomain = shopParam || headerShop || hostShop || process.env.SHOPIFY_DOMAIN || "b2bapp-development.myshopify.com";
  
  console.log('🔍 Shop domain extraction:');
  console.log('  - URL param:', shopParam);
  console.log('  - Header:', headerShop);
  console.log('  - Hostname:', hostShop);
  console.log('  - Final:', shopDomain);
  
  return shopDomain;
}

export async function loader({ request }) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  
  console.log('🔍 App proxy loader - Path:', path);
  console.log('🔍 App proxy loader - URL:', url.toString());
  
  // Check if this is a cart-metafields request
  if (path.includes('cart-metafields')) {
    const customerId = url.searchParams.get("customerId");
    const shopDomain = getShopDomain(request);
    
    console.log('🔍 Loading metafields for customer:', customerId);
    console.log('🔍 Shop domain:', shopDomain);
    
    if (!customerId || customerId === 'null') {
      console.error('❌ No customer ID provided');
      return json({ error: "Customer ID is required" }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    try {
      // Use unauthenticated admin API for app proxy requests
      console.log('🔍 Creating admin client for shop:', shopDomain);
      const { admin } = await unauthenticated.admin(shopDomain);
      
      // Format customer ID properly
      const formattedCustomerId = customerId.includes('gid://') 
        ? customerId 
        : `gid://shopify/Customer/${customerId}`;
      
      console.log('🔍 Formatted customer ID:', formattedCustomerId);
      
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
            customerId: formattedCustomerId,
          },
        }
      );

      const data = await response.json();
      console.log('🔍 GraphQL response:', JSON.stringify(data, null, 2));
      
      if (data.errors) {
        console.error("❌ GraphQL errors:", data.errors);
        return json({ error: "Failed to fetch metafields", details: data.errors }, { 
          status: 500, 
          headers: corsHeaders 
        });
      }

      const customer = data.data?.customer;
      if (!customer) {
        console.error('❌ Customer not found:', formattedCustomerId);
        return json({ error: "Customer not found" }, { 
          status: 404, 
          headers: corsHeaders 
        });
      }

      const metafields = customer.metafields?.edges || [];
      console.log('🔍 Found metafields:', metafields.length);
      
      // Look for cart_data metafield specifically
      const cartDataMetafield = metafields.find(
        edge => edge.node.key === "cart_data"
      );

      console.log('🔍 Cart data metafield:', cartDataMetafield);

      let cartData = {};
      if (cartDataMetafield) {
        try {
          cartData = JSON.parse(cartDataMetafield.node.value || "{}");
          console.log('✅ Parsed cart data:', cartData);
        } catch (parseError) {
          console.error('❌ Error parsing cart data JSON:', parseError);
          cartData = {};
        }
      }

      return json({
        customerId: formattedCustomerId,
        cartData,
        metafields: metafields.map(edge => edge.node),
      }, { headers: corsHeaders });
      
    } catch (error) {
      console.error("❌ Error fetching customer metafields:", error);
      console.error("❌ Error stack:", error.stack);
      return json({ 
        error: "Internal server error", 
        details: error.message,
        stack: error.stack 
      }, { 
        status: 500, 
        headers: corsHeaders 
      });
    }
  }

  // Default response for other paths
  return json({ message: "App proxy endpoint" }, { headers: corsHeaders });
}

export async function action({ request }) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const path = url.pathname;
  
  // Check if this is a cart-metafields request
  if (path.includes('cart-metafields')) {
    const shopDomain = getShopDomain(request);

    try {
      // Use unauthenticated admin API for app proxy requests
      const { admin } = await unauthenticated.admin(shopDomain);
      
      const formData = await request.formData();
      const customerId = formData.get("customerId");
      const cartData = formData.get("cartData");

      if (!customerId || customerId === 'null' || !cartData) {
        return json({ error: "Customer ID and cart data are required" }, { 
          status: 400, 
          headers: corsHeaders 
        });
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

      console.log('Saving metafield for customer:', formattedCustomerId);

      // Create or update customer metafield for cart data
      const response = await admin.graphql(
        `#graphql
          mutation customerUpdate($input: CustomerInput!) {
            customerUpdate(input: $input) {
              customer {
                id
                metafields(first: 1, namespace: "quick_order", keys: ["cart_data"]) {
                  edges {
                    node {
                      id
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

      const data = await response.json();
      
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

  // Default response for other paths
  return json({ message: "App proxy endpoint" }, { headers: corsHeaders });
}

// Handle OPTIONS requests for CORS
export async function options() {
  return new Response(null, { status: 200, headers: corsHeaders });
}
