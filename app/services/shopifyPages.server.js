import fetch from "node-fetch";

// Add page to navigation menu
const addToNavigation = async (shop, accessToken, pageHandle, pageTitle) => {
  try {
    // First, get the main menu to check if the item already exists
    const menusResponse = await fetch(`https://${shop}/admin/api/2025-07/menus.json`, {
      headers: { "X-Shopify-Access-Token": accessToken },
    });
    const menusData = await menusResponse.json();
    
    // Find the main menu (usually the primary navigation)
    const mainMenu = menusData.menus.find(menu => 
      menu.title.toLowerCase().includes('main') || 
      menu.title.toLowerCase().includes('primary') ||
      menu.handle === 'main-menu'
    ) || menusData.menus[0]; // Fallback to first menu if no main menu found

    if (!mainMenu) {
      console.log("⚠️ No navigation menu found to add Quick Order page");
      return null;
    }

    // Check if Quick Order already exists in the menu
    const existingItem = mainMenu.menu_items?.find(item => 
      item.title === pageTitle || item.url.includes(pageHandle)
    );

    if (existingItem) {
      console.log("ℹ️ Quick Order already exists in navigation menu");
      return existingItem;
    }

    // Add the page to the main menu
    const response = await fetch(`https://${shop}/admin/api/2025-07/menus/${mainMenu.id}/menu_items.json`, {
      method: "POST",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        menu_item: {
          title: pageTitle,
          url: `/pages/${pageHandle}`,
        },
      }),
    });

    if (response.ok) {
      const data = await response.json();
      console.log("✅ Quick Order added to navigation menu:", data.menu_item.title);
      return data.menu_item;
    } else {
      const errorText = await response.text();
      console.log("⚠️ Failed to add to navigation menu:", errorText);
      return null;
    }
  } catch (error) {
    console.log("⚠️ Error adding to navigation menu:", error.message);
    return null;
  }
};

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
    
    // 4️⃣ Add page to navigation menu (non-blocking)
    try {
      await addToNavigation(shop, accessToken, page.handle, page.title);
    } catch (navError) {
      console.log("⚠️ Navigation menu addition failed (non-critical):", navError.message);
    }
    
    return page;
  } catch (err) {
    console.error("Error creating Quick Order page:", err);
    throw err;
  }
}
