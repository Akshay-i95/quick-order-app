import fetch from "node-fetch";

// Get active theme ID
export async function getActiveTheme(shop, accessToken) {
  const url = `https://${shop}/admin/api/2025-07/themes.json`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Shopify-Access-Token": accessToken,
      "Content-Type": "application/json",
    },
  });

  const data = await res.json();
  //console.log(data);
  if (!data.themes) throw new Error("Unable to retrieve themes from Shopify");

  const mainTheme = data.themes.find(t => t.role === "main");
  if (!mainTheme) throw new Error("No main theme found");

  return mainTheme.id;
}

// Main function to create Quick Order page
export async function createQuickOrderPage(shop, accessToken) {
  try {
    //console.log(accessToken);
    //console.log(shop);
    const themeId = await getActiveTheme(shop, accessToken);
    const template = "{\n  \"layout\": \"theme\",\n  \"sections\": {\n    \"main\": {\n      \"type\": \"apps\",\n      \"settings\": {\n        \"title\": \"Welcome to QOP\",\n        \"text\": \"<p>Welcome to QOP.</p>\"\n      }\n    }\n  },\n  \"order\": [\"main\"]\n}"
    // 1️⃣ Check if page exists
    let res = await fetch(`https://${shop}/admin/api/2023-10/pages.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    const pagesData = await res.json();
    let page = pagesData.pages.find(p => p.handle === "quick-order");

    if (!page) {
      // Create page
      res = await fetch(`https://${shop}/admin/api/2023-10/pages.json`, {
        method: "POST",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          page: {
            title: "Quick Order",
            handle: "quick-order",
            body_html: "",
            published: true,
          },
        }),
      });
      const data = await res.json();
      page = data.page;
      console.log("✅ Page created:", page.handle);
    } else {
      console.log("ℹ️ Page already exists:", page.handle);
    }
    const pageId = page.id;
    const assetKey = "templates/page.quick-order-list.json";
    // 2️⃣ Check if the template already exists
    const checkResponse = await fetch(`https://${shop}/admin/api/2023-10/themes/${themeId}/assets.json?asset[key]=${assetKey}`, {
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
    });

    if (checkResponse.status === 404) {
      // 2️⃣ Create json template if not exists
      const response = await fetch(`https://${shop}/admin/api/2023-10/themes/${themeId}/assets.json`, {
        method: "PUT",
        headers: {
          "X-Shopify-Access-Token": accessToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          asset: {
            key: assetKey,
            value: template
          },
        }),
      });

      // 👇 check the response
      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ Failed to create template:", errorText);
        throw new Error(errorText);
      }

      const data = await response.json();
      console.log("✅ Template created:", data);
    } else if (checkResponse.ok) {
      console.log("⚠️ Template already exists. Skipping creation.");
    } else {
      const errorText = await checkResponse.text();
      console.error("❌ Failed to check template:", errorText);
      throw new Error(errorText);
    }

    // 3 Assign template to page
    await fetch(`https://${shop}/admin/api/2023-10/pages/${pageId}.json`, {
      method: "PUT",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page: { id: pageId, template_suffix: "quick-order-list" } }),
    });
    console.log("✅ Page assigned to quick-order template");
    return page;
  } catch (err) {
    console.error("Error creating Quick Order page:", err);
    throw err;
  }
}
