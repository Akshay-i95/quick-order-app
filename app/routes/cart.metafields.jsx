import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  
  console.log("Loading cart metafields for customer:", customerId);
  
  if (!customerId) {
    return json({ error: "Customer ID is required" }, { status: 400 });
  }

  try {
    const { admin } = await authenticate.public.appProxy(request);
    console.log("App proxy authentication successful, customerId:", customerId);
    
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
          customerId: `gid://shopify/Customer/${customerId}`
        }
      }
    );

    const data = await response.json();
    
    const metafields = data.data?.customer?.metafields?.edges || [];
    console.log("Customer metafields found:", metafields.length);
    
    const cartDataMetafield = metafields.find(edge => edge.node.key === "cart_data");
    console.log("Cart data metafield:", cartDataMetafield);

    let cartData = {};
    if (cartDataMetafield) {
      try {
        cartData = JSON.parse(cartDataMetafield.node.value || "{}");
      } catch (e) {
        console.error("Error parsing cart data:", e);
        cartData = {};
      }
    } else {
      console.log("No cart_data metafield found for customer");
    }

    return json({
      customerId,
      cartData: cartData,
      metafields: metafields.map(edge => edge.node),
    });
    
  } catch (error) {
    console.error("Error fetching customer metafields:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request }) {
  try {
    const body = await request.json();
    const { customerId, cartData } = body;

    console.log("💾 Saving cart data for customer:", customerId);

    if (!customerId || !cartData) {
      return json({ error: "Customer ID and cart data are required" }, { status: 400 });
    }

    const { admin } = await authenticate.public.appProxy(request);

    const response = await admin.graphql(
      `#graphql
        mutation customerUpdate($input: CustomerInput!) {
          customerUpdate(input: $input) {
            customer {
              id
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
                value: JSON.stringify(cartData),
                type: "json",
              },
            ],
          },
        },
      }
    );

    const data = await response.json();
    
    if (data.errors || data.data?.customerUpdate?.userErrors?.length > 0) {
      console.error("❌ Metafield update errors:", data.errors || data.data.customerUpdate.userErrors);
      return json({ error: "Failed to update cart data" }, { status: 500 });
    }

    console.log("✅ Cart data saved successfully!");
    
    return json({ 
      success: true, 
      customerId,
      cartData: cartData
    });
    
  } catch (error) {
    console.error("❌ Error updating customer metafield:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
