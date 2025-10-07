// app/routes/app.quickorder-metafield-setup.jsx
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const metafieldDefinitions = [
    {
      name: "Quick Order Cart Data",
      namespace: "quick_order",
      key: "cart_data",
      description: "Stores quick order cart data for persistent cart functionality across sessions",
      type: "json",
      ownerType: "CUSTOMER",
    },
  ];

  try {
    for (const definition of metafieldDefinitions) {
      // Check existing definitions for this ownerType
      const checkResponse = await admin.graphql(
        `
        query GetCustomerMetafieldDefinitions($ownerType: MetafieldOwnerType!) {
          metafieldDefinitions(first: 100, ownerType: $ownerType) {
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
      `,
        { variables: { ownerType: definition.ownerType } }
      );

      const checkData = await checkResponse.json();
      const existing = checkData.data?.metafieldDefinitions?.edges?.find(
        (e) =>
          e.node.namespace === definition.namespace && e.node.key === definition.key
      );

      if (!existing) {
        console.log(`Creating metafield definition: ${definition.namespace}.${definition.key}`);
        
        const createResp = await admin.graphql(
          `
          mutation CreateQuickOrderMetafieldDefinition($definition: MetafieldDefinitionInput!) {
            metafieldDefinitionCreate(definition: $definition) {
              createdDefinition {
                id
                name
                namespace
                key
                type {
                  name
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          { variables: { definition } }
        );

        const createJson = await createResp.json();
        const errs = createJson.data?.metafieldDefinitionCreate?.userErrors || [];
        
        if (errs.length) {
          console.error(
            `❌ Error creating ${definition.namespace}.${definition.key}:`,
            errs
          );
        } else {
          console.log(
            `✅ Created metafield definition: ${definition.namespace}.${definition.key}`
          );
        }
      } else {
        console.log(
          `✅ Metafield definition already exists: ${definition.namespace}.${definition.key}`
        );
      }
    }
  } catch (err) {
    console.error("❌ Error ensuring Quick Order metafield definitions:", err);
  }

  // Return success status
  return { 
    success: true, 
    timestamp: new Date().toISOString(),
    message: "Quick Order metafield definitions checked/created"
  };
};
