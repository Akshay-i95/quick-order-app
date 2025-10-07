import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    try {
      // Clean up quick order metafields before deleting session
      await cleanupQuickOrderMetafields(session);
      
      // Delete app sessions
      await db.session.deleteMany({ where: { shop } });
      
      console.log(`✅ App uninstall cleanup completed for ${shop}`);
    } catch (error) {
      console.error(`❌ Error during uninstall cleanup for ${shop}:`, error);
    }
  }

  return new Response();
};

// Clean up all quick order metafields
async function cleanupQuickOrderMetafields(session) {
  try {
    console.log(`🧹 Starting comprehensive metafield cleanup for shop: ${session.shop}`);
    
    let totalDeleted = 0;

    // Step 1: Delete metafield definitions first
    try {
      const definitionsQuery = `
        query getMetafieldDefinitions($first: Int!) {
          metafieldDefinitions(first: $first) {
            edges {
              node {
                id
                namespace
                key
                ownerType
              }
            }
          }
        }
      `;

      const definitionsResponse = await session.graphql(definitionsQuery, { 
        variables: { first: 100 } 
      });
      const definitionsData = await definitionsResponse.json();

      if (definitionsData.data?.metafieldDefinitions?.edges) {
        for (const defEdge of definitionsData.data.metafieldDefinitions.edges) {
          const definition = defEdge.node;
          
          // Delete quick_order namespace definitions
          if (definition.namespace === "quick_order") {
            try {
              const deleteDefMutation = `
                mutation metafieldDefinitionDelete($input: MetafieldDefinitionDeleteInput!) {
                  metafieldDefinitionDelete(input: $input) {
                    deletedDefinitionId
                    userErrors {
                      field
                      message
                    }
                  }
                }
              `;

              const deleteDefResponse = await session.graphql(deleteDefMutation, {
                variables: {
                  input: {
                    id: definition.id
                  }
                }
              });

              const deleteDefData = await deleteDefResponse.json();
              
              if (deleteDefData.data?.metafieldDefinitionDelete?.deletedDefinitionId) {
                totalDeleted++;
                console.log(`🗑️ Deleted metafield definition: ${definition.namespace}.${definition.key} (${definition.ownerType})`);
              } else if (deleteDefData.data?.metafieldDefinitionDelete?.userErrors?.length > 0) {
                console.error(`❌ Error deleting definition ${definition.id}:`, deleteDefData.data.metafieldDefinitionDelete.userErrors);
              }
            } catch (error) {
              console.error(`❌ Error deleting definition ${definition.id}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('❌ Error deleting metafield definitions:', error);
    }

    // Step 2: Delete remaining metafield values (in case definitions deletion didn't cascade)
    try {
      const customersQuery = `
        query getCustomers($first: Int!, $after: String) {
          customers(first: $first, after: $after) {
            edges {
              node {
                id
                metafields(namespace: "quick_order", first: 10) {
                  edges {
                    node {
                      id
                      namespace
                      key
                    }
                  }
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `;

      let hasNextPage = true;
      let cursor = null;

      while (hasNextPage) {
        const variables = { first: 50 };
        if (cursor) variables.after = cursor;

        const customersResponse = await session.graphql(customersQuery, { variables });
        const customersData = await customersResponse.json();

        if (customersData.data?.customers?.edges) {
          for (const customerEdge of customersData.data.customers.edges) {
            const customer = customerEdge.node;
            
            if (customer.metafields.edges.length > 0) {
              for (const metafieldEdge of customer.metafields.edges) {
                try {
                  const deleteMetafieldMutation = `
                    mutation metafieldDelete($input: MetafieldDeleteInput!) {
                      metafieldDelete(input: $input) {
                        deletedId
                        userErrors {
                          field
                          message
                        }
                      }
                    }
                  `;

                  const deleteResponse = await session.graphql(deleteMetafieldMutation, {
                    variables: {
                      input: {
                        id: metafieldEdge.node.id
                      }
                    }
                  });

                  const deleteData = await deleteResponse.json();
                  
                  if (deleteData.data?.metafieldDelete?.deletedId) {
                    totalDeleted++;
                    console.log(`🗑️ Deleted metafield value: ${metafieldEdge.node.namespace}.${metafieldEdge.node.key}`);
                  } else if (deleteData.data?.metafieldDelete?.userErrors?.length > 0) {
                    console.error(`❌ Error deleting metafield ${metafieldEdge.node.id}:`, deleteData.data.metafieldDelete.userErrors);
                  }
                } catch (error) {
                  console.error(`❌ Error deleting metafield ${metafieldEdge.node.id}:`, error);
                }
              }
            }
          }

          hasNextPage = customersData.data.customers.pageInfo.hasNextPage;
          cursor = customersData.data.customers.pageInfo.endCursor;
        } else {
          hasNextPage = false;
        }
      }
    } catch (error) {
      console.error('❌ Error deleting metafield values:', error);
    }

    console.log(`✅ Comprehensive metafield cleanup completed. Total items deleted: ${totalDeleted}`);
    
  } catch (error) {
    console.error('❌ Error during metafield cleanup:', error);
    // Don't throw error to prevent webhook failure
  }
}
