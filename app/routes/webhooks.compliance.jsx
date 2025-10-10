import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }) => {
  try {
    // Verify the webhook using Shopify's authentication
    const { topic, shop, session, admin } = await authenticate.webhook(request);
    
    const payload = await request.json();
    
    console.log(`Received compliance webhook: ${topic} for shop: ${shop}`);
    
    switch (topic) {
      case "CUSTOMERS_DATA_REQUEST":
        await handleCustomerDataRequest(payload);
        break;
        
      case "CUSTOMERS_REDACT":
        await handleCustomerRedact(payload);
        break;
        
      case "SHOP_REDACT":
        await handleShopRedact(payload);
        break;
        
      default:
        console.log(`Unhandled compliance webhook topic: ${topic}`);
    }
    
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Compliance webhook error:", error);
    return new Response("Unauthorized", { status: 401 });
  }
};

// Handle customer data request
async function handleCustomerDataRequest(payload) {
  console.log("Processing customer data request:", payload);
  
  const { shop_id, shop_domain, customer, orders_requested, data_request } = payload;
  
  try {
    // Find any contact form submissions for this customer
    const contactForms = await prisma.contactForm.findMany({
      where: {
        email: customer.email
      }
    });
    
    // Log the data that would need to be provided to the merchant
    console.log(`Customer data found for ${customer.email}:`, {
      contactFormSubmissions: contactForms.length,
      customerData: customer,
      ordersRequested: orders_requested,
      dataRequestId: data_request.id
    });
    
    // In a production app, you would:
    // 1. Compile all customer data from your database
    // 2. Send it to the merchant or provide a download link
    // 3. Log the completion of the data request
    
  } catch (error) {
    console.error("Error processing customer data request:", error);
  }
}

// Handle customer data redaction
async function handleCustomerRedact(payload) {
  console.log("Processing customer redaction request:", payload);
  
  const { shop_id, shop_domain, customer, orders_to_redact } = payload;
  
  try {
    // Delete any contact form submissions for this customer
    const deletedRecords = await prisma.contactForm.deleteMany({
      where: {
        email: customer.email
      }
    });
    
    console.log(`Deleted ${deletedRecords.count} contact form records for customer ${customer.email}`);
    
    // In a production app, you would also:
    // 1. Remove customer data from any other tables
    // 2. Anonymize or delete order-related data if applicable
    // 3. Log the completion of the redaction request
    
  } catch (error) {
    console.error("Error processing customer redaction:", error);
  }
}

// Handle shop data redaction (when app is uninstalled)
async function handleShopRedact(payload) {
  console.log("Processing shop redaction request:", payload);
  
  const { shop_id, shop_domain } = payload;
  
  try {
    // Delete all sessions for this shop
    const deletedSessions = await prisma.session.deleteMany({
      where: {
        shop: shop_domain
      }
    });
    
    console.log(`Deleted ${deletedSessions.count} sessions for shop ${shop_domain}`);
    
    // Note: We're not deleting ContactForm data here because it's not shop-specific
    // In your case, contact forms are general inquiries, not tied to specific shops
    // If you had shop-specific data, you would delete it here
    
    // In a production app, you would:
    // 1. Delete all shop-specific data from your database
    // 2. Remove any cached data or files
    // 3. Log the completion of the shop redaction
    
  } catch (error) {
    console.error("Error processing shop redaction:", error);
  }
}
