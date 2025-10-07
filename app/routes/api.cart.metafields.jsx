import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

// CORS headers for cross-origin requests from storefront
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Shopify-Shop-Domain",
};

export async function loader({ request }) {
  // Handle CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const shop = url.searchParams.get("shop") || request.headers.get("X-Shopify-Shop-Domain");
  
  if (!customerId) {
    return json({ error: "Customer ID is required" }, { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  if (!shop) {
    return json({ error: "Shop domain is required" }, { 
      status: 400, 
      headers: corsHeaders 
    });
  }

  try {
    // Create a mock request for authentication
    const authRequest = new Request(request.url, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        "X-Shopify-Shop-Domain": shop.replace('.myshopify.com', ''),
      }
    });

    // Try to authenticate using the stored access token for this shop
    const { admin } = await authenticate.admin(authRequest);
    
    // Get customer metafields for cart data
    const response = await admin.graphql(
      `#graphql
        query getCustomerMetafields($customerId: ID!) {
          customer(id: "gid://shopify/Customer/${customerId}") {
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
          customerId: customerId,
        },
      }
    );

    const data = await response.json();
    
    if (data.errors) {
      console.error("GraphQL errors:", data.errors);
      return json({ error: "Failed to fetch metafields" }, { 
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
    return json({ error: "Internal server error" }, { 
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

  try {
    const formData = await request.formData();
    const customerId = formData.get("customerId");
    const cartData = formData.get("cartData");
    const shop = formData.get("shop") || request.headers.get("X-Shopify-Shop-Domain");

    if (!customerId || !cartData) {
      return json({ error: "Customer ID and cart data are required" }, { 
        status: 400, 
        headers: corsHeaders 
      });
    }

    if (!shop) {
      return json({ error: "Shop domain is required" }, { 
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

    // Create a mock request for authentication
    const authRequest = new Request(request.url, {
      method: request.method,
      headers: {
        ...Object.fromEntries(request.headers.entries()),
        "X-Shopify-Shop-Domain": shop.replace('.myshopify.com', ''),
      }
    });

    // Authenticate using stored access token
    const { admin } = await authenticate.admin(authRequest);

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
            id: `gid://shopify/Customer/${customerId}`,
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
      return json({ error: "Failed to update cart data" }, { 
        status: 500, 
        headers: corsHeaders 
      });
    }

    return json({ 
      success: true, 
      customerId,
      cartData: parsedCartData,
      customer: data.data.customerUpdate.customer 
    }, { headers: corsHeaders });
    
  } catch (error) {
    console.error("Error updating customer metafield:", error);
    return json({ error: "Internal server error" }, { 
      status: 500, 
      headers: corsHeaders 
    });
  }
}

// Handle OPTIONS requests for CORS
export async function options() {
  return new Response(null, { status: 200, headers: corsHeaders });
}