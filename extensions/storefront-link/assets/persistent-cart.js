// Persistent Cart Management - Quantity-based System
class PersistentCart {
  constructor() {
    this.isCustomer = window.customerId !== null && window.customerId !== 'null';
    this.customerId = window.customerId;
    this.saveTimeout = null;
    this.isSaving = false; // Prevent save loops
    this.isLoading = false; // Prevent load loops
    this.cartIconUpdateTimeout = null; // Debounce cart icon updates
    this.isInitialized = false; // Track when initial load is complete
    this.toastTimeout = null; // Debounce toast messages
    
    console.log('PersistentCart initialized:');
    console.log('- window.customerId:', window.customerId);
    console.log('- this.isCustomer:', this.isCustomer);
    console.log('- this.customerId:', this.customerId);
    
    this.init();
  }

  async init() {
    await this.loadCartState();
    this.bindQuantityEvents();
    this.bindFormEvents();
    this.bindCartRemovalEvents();
    // Temporarily disable polling to prevent loops
    // this.startCartPolling();
    
    // Listen for cart events instead
    this.bindCartEvents();
    
    // Calculate subtotal immediately after cart state is loaded
    this.updateInitialSubtotal();
  }

  // Update subtotal on initial load - instant calculation
  updateInitialSubtotal() {
    if (window.priceCalculator) {
      window.priceCalculator.updateSubtotal();
      console.log('✅ Initial subtotal calculated instantly');
    } else {
      console.warn('⚠️ Price calculator not yet available, using immediate retry...');
      // Use immediate retry instead of timeout
      requestAnimationFrame(() => this.updateInitialSubtotal());
    }
  }

  // Load cart state and sync with quick order quantities
  async loadCartState() {
    console.log('🚀 Loading cart state and syncing quantities...');
    console.log('🔍 Customer status:', { isCustomer: this.isCustomer, customerId: this.customerId });
    
    try {
      // Get current cart from Shopify
      const cartData = await this.fetchCurrentCart();
      console.log('Current cart data:', cartData);
      
      // Convert cart items to quantity map
      const cartQuantities = this.extractQuantitiesFromCart(cartData);
      console.log('Cart quantities:', cartQuantities);
      
      // Load any additional metafield data for customers
      let metafieldQuantities = {};
      if (this.isCustomer) {
        metafieldQuantities = await this.loadQuantitiesFromMetafields();
        console.log('Metafield quantities:', metafieldQuantities);
      }
      
      // Smart Cross-Device Sync Logic
      // Decision tree for handling cart vs metafield conflicts
      let finalQuantities = {};
      let needsRestore = false;
      
      const cartIsEmpty = Object.keys(cartQuantities).length === 0;
      const metafieldsHaveData = Object.keys(metafieldQuantities).length > 0;
      const isNewSession = !sessionStorage.getItem('cart_session_active');
      
      if (cartIsEmpty && metafieldsHaveData && isNewSession && this.isCustomer) {
        // Scenario: Empty cart + metafields have data + fresh session
        // This indicates cross-device sync OR page reload after logout
        console.log('🔄 Cross-device sync detected: Empty cart but metafields have data');
        console.log('📱 Restoring metafield quantities for cross-device continuity...');
        
        finalQuantities = { ...metafieldQuantities };
        needsRestore = true;
        
      } else if (!cartIsEmpty) {
        // Scenario: Cart has items - use cart as source of truth
        console.log('✅ Using cart as source of truth (cart has items)');
        finalQuantities = { ...cartQuantities };
        
        // Sync metafields to match cart
        if (this.isCustomer) {
          const metafieldsNeedUpdate = JSON.stringify(cartQuantities) !== JSON.stringify(metafieldQuantities);
          if (metafieldsNeedUpdate) {
            console.log('💾 Syncing metafields to match cart state...');
            await this.saveQuantitiesToMetafields(cartQuantities);
          }
        }
        
      } else {
        // Scenario: Empty cart, empty metafields OR cart empty in same session
        // User deliberately cleared cart, respect that
        console.log('✅ Cart is empty and no restore needed');
        finalQuantities = {};
      }
      
      // Mark session as active to prevent re-restore on same device
      sessionStorage.setItem('cart_session_active', 'true');
      
      console.log('Final quantities to display:', finalQuantities);
      
      // Restore quantities to the form
      this.restoreQuantitiesToInputs(finalQuantities);
      
      // Restore to actual Shopify cart if needed (cross-device sync)
      if (needsRestore && Object.keys(finalQuantities).length > 0) {
        console.log('🔄 Restoring items to Shopify cart for cross-device sync...');
        await this.restoreItemsToCart(finalQuantities);
        
        // Reload cart after restoration - immediate execution
        requestAnimationFrame(async () => {
          const updatedCart = await this.fetchCurrentCart();
          this.updateCartIcon(updatedCart);
          console.log('✅ Cross-device cart restoration complete');
        });
      } else {
        // Update cart icon with current cart state
        this.updateCartIcon(cartData);
      }
      
      console.log('✅ Cart state loaded and synced');
      
    } catch (error) {
      console.error('Error loading cart state:', error);
      // Fallback to metafields only
      if (this.isCustomer) {
        const savedQuantities = await this.loadQuantitiesFromMetafields();
        this.restoreQuantitiesToInputs(savedQuantities);
      }
    }
    
    // Mark initialization as complete
    this.isInitialized = true;
    console.log('✅ PersistentCart initialization complete');
    
    // Immediately notify FixedCartSummary if it exists
    if (window.fixedCartSummary) {
      console.log('🚀 Triggering instant FixedCartSummary sync...');
      window.fixedCartSummary.syncWithCart();
    }
  }

  // Fetch current cart from Shopify
  async fetchCurrentCart() {
    try {
      const response = await fetch('/cart.js');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching cart:', error);
    }
    return { items: [] };
  }

  // Extract quantities from cart data
  extractQuantitiesFromCart(cartData) {
    const quantities = {};
    
    if (cartData && cartData.items) {
      cartData.items.forEach(item => {
        const variantId = item.variant_id?.toString() || item.id?.toString();
        if (variantId) {
          quantities[variantId] = item.quantity || 0;
        }
      });
    }
    
    return quantities;
  }

  // Start polling for cart changes
  startCartPolling() {
    // Poll cart every 5 seconds to detect changes (reduced frequency)
    this.cartPollInterval = setInterval(async () => {
      // Only sync if we're not already saving/loading
      if (!this.isSaving && !this.isLoading) {
        await this.syncWithCart();
      }
    }, 5000); // Increased from 3000 to 5000ms
    
    // Also listen for cart events
    this.bindCartEvents();
  }

  // Sync quick order with current cart state
  async syncWithCart() {
    // Prevent sync loops
    if (this.isSyncing) {
      return;
    }
    
    this.isSyncing = true;
    
    try {
      const cartData = await this.fetchCurrentCart();
      const cartQuantities = this.extractQuantitiesFromCart(cartData);
      
      // Get current quick order quantities
      const currentQuantities = this.getCurrentQuantities();
      
      // Check if cart quantities are different from quick order
      let needsSync = false;
      const allVariantIds = new Set([
        ...Object.keys(cartQuantities),
        ...Object.keys(currentQuantities)
      ]);
      
      for (const variantId of allVariantIds) {
        const cartQty = cartQuantities[variantId] || 0;
        const quickOrderQty = currentQuantities[variantId] || 0;
        
        if (cartQty !== quickOrderQty) {
          needsSync = true;
          break;
        }
      }
      
      if (needsSync) {
        console.log('Cart and quick order out of sync, updating quick order...');
        this.updateQuickOrderQuantities(cartQuantities);
        
        // Update cart icon with current cart data
        this.updateCartIcon(cartData);
        
        // Save the synced state to metafields (without triggering another sync)
        if (this.isCustomer && !this.isSaving) {
          const cartData = {
            quantities: cartQuantities,
            timestamp: new Date().toISOString()
          };
          await this.saveQuantitiesToMetafields(cartData.quantities);
        }
      }
    } catch (error) {
      console.error('Error syncing with cart:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  // Bind cart-specific events
  bindCartEvents() {
    // Listen for Shopify cart events
    document.addEventListener('cart:updated', (event) => {
      console.log('Cart updated event received:', event.detail);
      setTimeout(() => this.syncWithCart(), 500);
    });
    
    // Listen for cart drawer/page events
    const cartEvents = ['cart:open', 'cart:close', 'cart:change', 'cart:add', 'cart:remove'];
    cartEvents.forEach(eventName => {
      document.addEventListener(eventName, () => {
        setTimeout(() => this.syncWithCart(), 500);
      });
    });
    
    // Listen for cart form submissions
    document.addEventListener('submit', (event) => {
      if (event.target.matches('[action="/cart"], [action="/cart/add"], [action*="cart"]')) {
        setTimeout(() => this.syncWithCart(), 1000);
      }
    });
  }

  // Load saved quantities and restore them to input fields (metafields only)
  async loadQuantities() {
    console.log('Loading saved quantities...');
    let savedQuantities = {};
    
    // Always use metafields for logged in customers, no localStorage fallback
    if (this.isCustomer) {
      savedQuantities = await this.loadQuantitiesFromMetafields();
      console.log('Loaded quantities from metafields:', savedQuantities);
    } else {
      console.log('⚠️ Not a logged in customer - no quantities to restore');
    }
    
    this.restoreQuantitiesToInputs(savedQuantities);
  }

  // Restore quantities to input fields
  restoreQuantitiesToInputs(quantities) {
    console.log('🎯 Restoring quantities to inputs:', quantities);
    
    // First, reset ALL quantity inputs to 0
    const allInputs = document.querySelectorAll('input[data-variant-id], input[name^="updates["]');
    console.log(`🔄 Resetting ${allInputs.length} quantity inputs to 0`);
    allInputs.forEach(input => {
      input.value = 0;
    });
    
    // Then set the correct quantities from cart
    let updatedCount = 0;
    Object.entries(quantities).forEach(([variantId, quantity]) => {
      const input = document.querySelector(`input[data-variant-id="${variantId}"], input[name="updates[${variantId}]"]`);
      if (input) {
        input.value = quantity || 0;
        console.log(`✅ Set quantity for variant ${variantId}: ${quantity}`);
        updatedCount++;
        // Trigger change event to update totals
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        console.log(`⚠️ Input not found for variant ${variantId}`);
      }
    });
    
    console.log(`🎯 Updated ${updatedCount} out of ${Object.keys(quantities).length} quantities`);
    
    console.log('✅ All quantities synced with cart state');
    
    // Update subtotal after restoring quantities
    setTimeout(() => {
      if (window.priceCalculator) {
        window.priceCalculator.updateSubtotal();
      }
    }, 100);
  }

  // Reset specific variant quantity to zero
  async resetVariantQuantity(variantId) {
    console.log(`🔄 Resetting quantity for variant ${variantId} to zero`);
    
    const input = document.querySelector(`input[data-variant-id="${variantId}"], input[name="updates[${variantId}]"]`);
    if (input) {
      input.value = 0;
      console.log(`✅ Reset quantity for variant ${variantId} to 0`);
      
      // Trigger change event to update totals
      input.dispatchEvent(new Event('change', { bubbles: true }));
      input.dispatchEvent(new Event('input', { bubbles: true }));
      
      // Update the price calculator
      if (window.priceCalculator) {
        window.priceCalculator.updateRowTotal(input.closest('.table-row, .product-row, .variant-row'));
        window.priceCalculator.updateSubtotal();
      }
      
      // Immediately save to metafields to remove this product ID
      await this.saveCurrentQuantities();
      console.log(`💾 Saved metafields after removing variant ${variantId}`);
    } else {
      console.warn(`Input not found for variant ${variantId}`);
    }
  }

  // Listen for cart removal events and reset quantities
  bindCartRemovalEvents() {
    console.log('Binding cart removal events...');
    
    // Method 1: Listen for Shopify cart updates
    document.addEventListener('cart:updated', (event) => {
      console.log('🛒 Cart updated event received:', event.detail);
      this.handleCartUpdate(event.detail);
    });

    // Method 2: Listen for cart line item removals
    document.addEventListener('cart:line-item-removed', async (event) => {
      console.log('🗑️ Cart line item removed:', event.detail);
      if (event.detail && event.detail.variant_id) {
        await this.resetVariantQuantity(event.detail.variant_id.toString());
      }
    });

    // Method 3: Listen for remove button clicks with enhanced selectors
    document.addEventListener('click', async (e) => {
      const removeSelectors = [
        '.remove-item-btn', '.cart-remove-btn', '[data-cart-remove]',
        '.cart__remove', '.remove', '.btn--remove', '.cart-item__remove',
        '[aria-label*="remove" i]', '[title*="remove" i]'
      ];
      
      if (removeSelectors.some(selector => e.target.matches(selector))) {
        console.log('🗑️ Remove button clicked:', e.target);
        
        const variantId = this.getVariantIdFromElement(e.target);
        if (variantId) {
          console.log(`Remove button clicked for variant: ${variantId}`);
          setTimeout(async () => await this.resetVariantQuantity(variantId), 200);
        }
      }
    });

    // Method 4: Listen for cart form submissions with quantity 0
    document.addEventListener('submit', (e) => {
      if (e.target.matches('form[action*="/cart"]')) {
        console.log('🛒 Cart form submitted');
        setTimeout(() => this.checkForRemovedItems(), 300);
      }
    });

    // Method 5: Listen for quantity input changes to 0
    document.addEventListener('change', async (e) => {
      if (e.target.matches('input[name*="updates["]') && e.target.value === '0') {
        const variantId = this.extractVariantIdFromCartInput(e.target);
        if (variantId) {
          console.log(`🗑️ Quantity set to 0 for variant: ${variantId}`);
          setTimeout(async () => await this.resetVariantQuantity(variantId), 100);
        }
      }
    });

    // Method 6: Enhanced DOM observer for cart changes
    const cartObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach(async (node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const variantId = this.findVariantIdInRemovedNode(node);
            if (variantId) {
              console.log(`🗑️ Cart item removed via DOM mutation for variant: ${variantId}`);
              await this.resetVariantQuantity(variantId);
            }
          }
        });
      });
    });

    // Observe more cart areas including common theme structures
    const cartAreas = document.querySelectorAll([
      '.cart', '.cart-drawer', '.cart-items', '#cart-items', '[data-cart]',
      '.drawer__contents', '.cart-content', '.ajax-cart', '.mini-cart',
      '.cart__items', '#CartItems', '.cart-form'
    ].join(', '));
    
    cartAreas.forEach(area => {
      cartObserver.observe(area, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-variant-id', 'data-line-id']
      });
    });

    this.cartObserver = cartObserver;

    // Method 7: Periodic cart state check if on cart page
    if (window.location.pathname.includes('/cart')) {
      this.startCartStateMonitoring();
    }
  }

  // Get variant ID from various element sources
  getVariantIdFromElement(element) {
    // Check data attributes on the element
    let variantId = element.dataset.variantId || element.dataset.lineId;
    
    // Check parent elements
    if (!variantId) {
      const parent = element.closest('[data-variant-id], [data-line-id], .cart-item, .line-item');
      if (parent) {
        variantId = parent.dataset.variantId || parent.dataset.lineId;
      }
    }
    
    // Check for input elements with updates[] name
    if (!variantId) {
      const input = element.closest('form')?.querySelector('input[name*="updates["]');
      if (input) {
        variantId = this.extractVariantIdFromCartInput(input);
      }
    }
    
    return variantId;
  }

  // Extract variant ID from cart input name
  extractVariantIdFromCartInput(input) {
    const nameMatch = input.name?.match(/updates\[(\d+)\]/);
    return nameMatch ? nameMatch[1] : null;
  }

  // Find variant ID in removed DOM node
  findVariantIdInRemovedNode(node) {
    if (!node.querySelector) {
      return node.dataset?.variantId || node.dataset?.lineId;
    }
    
    const cartItem = node.querySelector('[data-variant-id], [data-line-id], input[name*="updates["]');
    if (cartItem) {
      return cartItem.dataset?.variantId || 
             cartItem.dataset?.lineId || 
             this.extractVariantIdFromCartInput(cartItem);
    }
    
    return node.dataset?.variantId || node.dataset?.lineId;
  }

  // Check for items that were removed from cart
  async checkForRemovedItems() {
    const currentQuantities = this.getCurrentQuantities();
    const cartItems = this.getCurrentCartItems();
    
    // Reset quantities for items no longer in cart
    for (const variantId of Object.keys(currentQuantities)) {
      if (!cartItems.includes(variantId) && currentQuantities[variantId] > 0) {
        console.log(`🗑️ Item ${variantId} no longer in cart, resetting quantity`);
        await this.resetVariantQuantity(variantId);
      }
    }
  }

  // Get current cart items from DOM
  getCurrentCartItems() {
    const items = [];
    const cartElements = document.querySelectorAll('[data-variant-id], [data-line-id], input[name*="updates["]');
    
    cartElements.forEach(element => {
      const variantId = element.dataset?.variantId || 
                      element.dataset?.lineId || 
                      this.extractVariantIdFromCartInput(element);
      if (variantId && !items.includes(variantId)) {
        items.push(variantId);
      }
    });
    
    return items;
  }

  // Start monitoring cart state changes
  startCartStateMonitoring() {
    if (this.cartMonitorInterval) return;
    
    let lastCartItems = this.getCurrentCartItems();
    
    this.cartMonitorInterval = setInterval(async () => {
      const currentCartItems = this.getCurrentCartItems();
      const removedItems = lastCartItems.filter(id => !currentCartItems.includes(id));
      
      for (const variantId of removedItems) {
        console.log(`🗑️ Cart monitoring detected removed item: ${variantId}`);
        await this.resetVariantQuantity(variantId);
      }
      
      lastCartItems = currentCartItems;
    }, 1500); // Check every 1.5 seconds
  }

  // Handle cart update events from Shopify
  async handleCartUpdate(cartData) {
    console.log('Handling cart update:', cartData);
    
    if (!cartData || !cartData.items) return;
    
    // Get current quantities from the quick order form
    const currentQuantities = this.getCurrentQuantities();
    
    // Get variant IDs currently in cart
    const cartVariantIds = cartData.items.map(item => item.variant_id?.toString() || item.id?.toString()).filter(Boolean);
    
    // Find variants that were in our form but are no longer in cart
    for (const variantId of Object.keys(currentQuantities)) {
      if (!cartVariantIds.includes(variantId)) {
        console.log(`Variant ${variantId} was removed from cart, resetting quantity`);
        await this.resetVariantQuantity(variantId);
      }
    }
  }

  // Bind events to quantity inputs and form submission
  bindQuantityEvents() {
    console.log('Binding quantity events...');
    
    // Store previous values for stock validation
    document.addEventListener('focus', (e) => {
      if (e.target.matches('input[data-variant-id], input[name^="updates["]')) {
        e.target.dataset.previousValue = e.target.value;
      }
    });
    
    // Auto-save when quantities change
    document.addEventListener('change', (e) => {
      if (e.target.matches('input[data-variant-id], input[name^="updates["]')) {
        console.log('Quantity changed for input:', e.target);
        
        // IMMEDIATE stock validation BEFORE any processing to prevent price flickering
        const requestedQuantity = parseInt(e.target.value) || 0;
        const stockValidation = this.validateStock(e.target, requestedQuantity);
        
        if (!stockValidation.isValid && requestedQuantity > 0) {
          // Immediately correct the quantity BEFORE any calculations
          const maxAvailable = stockValidation.maxAvailable;
          e.target.value = maxAvailable;
          e.target.setAttribute('value', maxAvailable);
          
          // Show toast message for stock validation error
          this.showToast(stockValidation.message, 'error');
        }
        
        this.handleQuantityChange(e.target);
      }
    });
    
    // Also save on input (for real-time updates) with immediate stock validation
    document.addEventListener('input', (e) => {
      if (e.target.matches('input[data-variant-id], input[name^="updates["]')) {
        // IMMEDIATE stock validation BEFORE any calculations to prevent price flickering
        const requestedQuantity = parseInt(e.target.value) || 0;
        const stockValidation = this.validateStock(e.target, requestedQuantity);
        
        if (!stockValidation.isValid && requestedQuantity > 0) {
          // Immediately correct the quantity BEFORE any price calculations
          const maxAvailable = stockValidation.maxAvailable;
          e.target.value = maxAvailable;
          e.target.setAttribute('value', maxAvailable);
          
          // Show debounced toast message for better UX while typing
          this.showDebouncedToast(stockValidation.message, 'error');
        }
        
        // Update row subtotal with the final validated quantity (no flickering)
        this.updateRowSubtotalImmediate(e.target);
        
        // Instant cart update with minimal debounce (50ms) for performance
        clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
          this.handleQuantityChange(e.target);
        }, 50);
        
        // Instant cart icon update
        clearTimeout(this.cartIconUpdateTimeout);
        this.cartIconUpdateTimeout = setTimeout(async () => {
          const cartData = await this.fetchCurrentCart();
          this.updateCartIcon(cartData);
        }, 10);
      }
    });
  }

  // Handle quantity change - update cart and metafields
  async handleQuantityChange(input) {
    // Prevent handling the same change multiple times
    if (this.isHandlingChange) {
      return;
    }
    
    this.isHandlingChange = true;
    
    try {
      const variantId = input.dataset.variantId || input.name.match(/\[(\d+)\]/)?.[1];
      const newQuantity = parseInt(input.value) || 0;
      
      console.log(`Quantity changed for variant ${variantId}: ${newQuantity}`);
      
      // Validate stock before proceeding
      const stockValidation = this.validateStock(input, newQuantity);
      if (!stockValidation.isValid) {
        // Revert input to previous valid quantity or max available
        const previousValue = parseInt(input.dataset.previousValue) || 0;
        input.value = Math.min(previousValue, stockValidation.maxAvailable);
        
        // Update the row subtotal with reverted value
        this.updateRowSubtotalImmediate(input);
        
        this.showToast(stockValidation.message, 'error');
        return;
      }
      
      // Immediately update the row subtotal for live streaming effect
      this.updateRowSubtotalImmediate(input);
      
      // Update the cart with new quantity
      await this.updateCartQuantity(variantId, newQuantity);
      
      // Fetch updated cart data to get accurate totals
      const updatedCartData = await this.fetchCurrentCart();
      this.updateCartIcon(updatedCartData);
      
      // Save current state to metafields
      await this.saveCurrentQuantities();
      
      // Dispatch event to notify other components
      document.dispatchEvent(new CustomEvent('cartUpdated', {
        detail: { variantId, newQuantity, cartData: updatedCartData }
      }));
      
    } catch (error) {
      console.error('Error handling quantity change:', error);
    } finally {
      this.isHandlingChange = false;
    }
  }

  // Validate stock quantity before updating cart
  validateStock(input, requestedQuantity) {
    const variantId = input.dataset.variantId || input.name.match(/\[(\d+)\]/)?.[1];
    const row = input.closest('.qo-product-card, .qo-variant-card, .table-row');
    
    if (!row) {
      return { isValid: false, message: 'Product information not found', maxAvailable: 0 };
    }
    
    // Get stock data from data attributes
    const stockQuantity = parseInt(input.dataset.stockQuantity) || 0;
    const inventoryManagement = input.dataset.inventoryManagement;
    const isAvailable = input.dataset.available !== 'false';
    
    // Get product name for better error messages
    const productElement = row.querySelector('.qo-product-title, .qo-variant-title');
    const productName = productElement ? productElement.textContent.trim() : 'Product';
    
    console.log(`Stock validation for ${productName}:`, {
      variantId,
      requestedQuantity,
      stockQuantity,
      inventoryManagement,
      isAvailable
    });
    
    // Check if product is available at all
    if (!isAvailable) {
      return {
        isValid: false,
        message: `Product unavailable: ${productName} is currently out of stock and cannot be added to cart.`,
        maxAvailable: 0
      };
    }
    
    // If inventory is not managed by Shopify, allow any quantity
    if (inventoryManagement !== 'shopify') {
      return { isValid: true, message: 'Stock validated', maxAvailable: requestedQuantity };
    }
    
    // Check if requested quantity exceeds available stock
    if (requestedQuantity > stockQuantity) {
      const message = stockQuantity > 0 
        ? `Insufficient inventory: Requested quantity of ${requestedQuantity} exceeds available stock of ${stockQuantity} for ${productName}. Quantity adjusted to maximum available.`
        : `Product unavailable: ${productName} is currently out of stock.`;
      
      return {
        isValid: false,
        message: message,
        maxAvailable: stockQuantity
      };
    }
    
    return { isValid: true, message: 'Stock validated', maxAvailable: requestedQuantity };
  }

  // Show debounced toast message to avoid spam while typing
  showDebouncedToast(message, type = 'error') {
    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      this.showToast(message, type);
    }, 300); // 300ms debounce for better UX
  }

  // Update row subtotal immediately for live streaming effect
  updateRowSubtotalImmediate(input) {
    const row = input.closest('.qo-product-card, .qo-variant-card, .table-row');
    if (!row) return;
    
    const subtotalElement = row.querySelector('.qo-total-value');
    if (!subtotalElement) return;
    
    const quantity = parseInt(input.value) || 0;
    let price = 0;
    
    // Get price from data attribute or DOM element
    const priceElement = row.querySelector('.qo-price-value, .price');
    if (priceElement) {
      if (priceElement.dataset.price) {
        // Price in cents from Shopify
        price = parseInt(priceElement.dataset.price) / 100;
      } else {
        // Parse price from text
        const priceText = priceElement.textContent || '';
        const cleanPrice = priceText.replace(/[₹Rs\s$£€,]/g, '');
        price = parseFloat(cleanPrice) || 0;
      }
    }
    
    const subtotal = price * quantity;
    const formattedSubtotal = `$${subtotal.toFixed(2)}`;
    
    // Update the subtotal with enhanced live streaming animation
    if (subtotalElement.textContent !== formattedSubtotal) {
      // Add updating class for visual feedback
      subtotalElement.classList.add('updating');
      subtotalElement.textContent = formattedSubtotal;
      
      // Add pulse animation for extra emphasis
      subtotalElement.classList.add('pulse');
      
      // Reset animations and classes after animation completes
      setTimeout(() => {
        subtotalElement.classList.remove('updating', 'pulse');
      }, 300);
    }
    
    console.log(`💰 Row subtotal updated live: ${quantity} × $${price.toFixed(2)} = ${formattedSubtotal}`);
  }

  // Shopify Polaris Toast notification helper method
  showToast(message, type = 'info') {
    // Remove any existing toasts
    const existingToast = document.querySelector('.Polaris-Toast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create Polaris toast element
    const toast = document.createElement('div');
    toast.className = `Polaris-Toast ${type === 'error' ? 'Polaris-Toast--error' : 'Polaris-Toast--success'}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    const iconSVG = type === 'error' 
      ? `<svg viewBox="0 0 20 20" class="Polaris-Icon__Svg" focusable="false" aria-hidden="true">
           <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM7.8 7.8a.75.75 0 0 1 1.06 0L10 8.94l1.14-1.14a.75.75 0 1 1 1.06 1.06L11.06 10l1.14 1.14a.75.75 0 1 1-1.06 1.06L10 11.06l-1.14 1.14a.75.75 0 1 1-1.06-1.06L8.94 10 7.8 8.86a.75.75 0 0 1 0-1.06z" fill="currentColor"/>
         </svg>`
      : `<svg viewBox="0 0 20 20" class="Polaris-Icon__Svg" focusable="false" aria-hidden="true">
           <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.236 4.53L7.89 10.322a.75.75 0 1 0-1.28.956l2.5 3.347a.75.75 0 0 0 1.247.036l3.5-4.891z" fill="currentColor"/>
         </svg>`;

    toast.innerHTML = `
      <div class="Polaris-Toast__Content">
        <div class="Polaris-Toast__Icon">
          <span class="Polaris-Icon">
            ${iconSVG}
          </span>
        </div>
        <div class="Polaris-Toast__Message">
          ${message}
        </div>
        <button type="button" class="Polaris-Toast__CloseButton" aria-label="Dismiss notification">
          <span class="Polaris-Icon">
            <svg viewBox="0 0 20 20" class="Polaris-Icon__Svg" focusable="false" aria-hidden="true">
              <path d="M14.54 13.46a.75.75 0 1 1-1.06 1.06L10 11.06l-3.48 3.46a.75.75 0 1 1-1.06-1.06L8.94 10 5.46 6.54a.75.75 0 1 1 1.06-1.06L10 8.94l3.46-3.46a.75.75 0 1 1 1.06 1.06L11.06 10l3.48 3.46z" fill="currentColor"/>
            </svg>
          </span>
        </button>
      </div>
    `;

    // Add to page
    document.body.appendChild(toast);

    // Add close button functionality
    const closeButton = toast.querySelector('.Polaris-Toast__CloseButton');
    closeButton.addEventListener('click', () => {
      if (toast && toast.parentNode) {
        toast.classList.add('Polaris-Toast--exiting');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 200);
      }
    });

    // Auto remove after 5 seconds (Polaris standard)
    setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.classList.add('Polaris-Toast--exiting');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 200);
      }
    }, 5000);
  }

  // Update cart quantity via Shopify Cart API
  async updateCartQuantity(variantId, quantity) {
    try {
      const updates = {};
      updates[variantId] = quantity;
      
      const response = await fetch('/cart/update.js', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ updates })
      });
      
      if (response.ok) {
        const cartData = await response.json();
        console.log(`✅ Cart updated for variant ${variantId}: ${quantity}`);
        
        // Trigger cart updated event for theme compatibility
        document.dispatchEvent(new CustomEvent('cart:updated', {
          detail: { cart: cartData }
        }));
        
        // Update cart icon immediately
        this.updateCartIcon(cartData);
        
        return cartData;
      } else {
        throw new Error('Failed to update cart');
      }
      
    } catch (error) {
      console.error('Error updating cart:', error);
      throw error;
    }
  }

  // Update cart icon/badge in header
  updateCartIcon(cartData) {
    try {
      const itemCount = cartData.item_count || 0;
      console.log(`🛒 Updating cart icon with item count: ${itemCount}`);
      
      // Common cart icon selectors used by most Shopify themes
      const cartIconSelectors = [
        // Count/badge selectors
        '.cart-count-bubble', '.cart-count', '.cart__count', '.cart-item-count',
        '[data-cart-count]', '.header-cart-count', '.cart-counter', '.cart-quantity',
        '.minicart-quantity', '.cart-badge', '.cart-number', '.cart-total-items',
        '.header__cart-count', '.site-header__cart-count', '.cart__item-count',
        '.cart-link__bubble', '.cart-link [data-cart-count]', '.cart-drawer-count',
        
        // Icon selectors (some themes put count inside cart icon)
        '.cart-icon', '.header-cart', '.cart-link', '[data-cart-drawer-toggle]',
        '.header__icons .cart', '.site-header__cart', '.cart-count-container',
        '.cart-toggle', '.header-cart-link', '.cart-drawer-toggle'
      ];

      // Update cart count in various possible elements
      cartIconSelectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          // If element has text content that looks like a number, update it
          if (element.textContent && /^\d+$/.test(element.textContent.trim())) {
            element.textContent = itemCount;
            console.log(`✅ Updated cart count in ${selector}: ${itemCount}`);
          }
          
          // Update data attributes
          if (element.hasAttribute('data-cart-count')) {
            element.setAttribute('data-cart-count', itemCount);
            element.textContent = itemCount;
            console.log(`✅ Updated data-cart-count in ${selector}: ${itemCount}`);
          }

          // Some themes use innerHTML or specific child elements
          const countSpan = element.querySelector('span, .count, [data-cart-count]');
          if (countSpan && /^\d+$/.test(countSpan.textContent.trim())) {
            countSpan.textContent = itemCount;
            console.log(`✅ Updated cart count in child span of ${selector}: ${itemCount}`);
          }

          // Hide/show cart icon based on count (some themes do this)
          if (itemCount === 0) {
            element.classList.add('cart-empty');
            element.classList.remove('cart-has-items');
          } else {
            element.classList.remove('cart-empty');
            element.classList.add('cart-has-items');
          }
        });
      });

      // Update cart total price if present
      if (cartData.total_price !== undefined) {
        const cartTotalSelectors = [
          '.cart-total', '.cart__total', '.cart-subtotal', '[data-cart-total]',
          '.header-cart-total', '.minicart-total', '.cart-price'
        ];

        cartTotalSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            // Format price based on Shopify money format
            const formattedPrice = this.formatPrice(cartData.total_price);
            if (element.textContent.includes('Rs') || element.textContent.includes('$')) {
              element.textContent = formattedPrice;
              console.log(`✅ Updated cart total in ${selector}: ${formattedPrice}`);
            }
          });
        });
      }

      // Trigger cart icon update events for custom themes
      document.dispatchEvent(new CustomEvent('cart:icon:updated', {
        detail: { 
          itemCount: itemCount, 
          cartData: cartData,
          timestamp: Date.now() 
        }
      }));

      // Note: Removed cartSynced event to prevent conflicts with cart summary updates
      // Fixed cart summary now updates via cartUpdated and subtotalUpdated events

      // Update browser title if it shows cart count
      if (document.title.includes('(') && document.title.includes(')')) {
        const newTitle = document.title.replace(/\(\d+\)/, itemCount > 0 ? `(${itemCount})` : '');
        document.title = newTitle;
      }

    } catch (error) {
      console.error('Error updating cart icon:', error);
    }
  }

  // Format price according to Shopify money format
  formatPrice(priceInCents) {
    const price = priceInCents / 100;
    return `$${price.toFixed(2)}`;
  }

  // Debounced cart icon update to handle rapid changes
  debouncedCartIconUpdate(cartData) {
    clearTimeout(this.cartIconUpdateTimeout);
    this.cartIconUpdateTimeout = setTimeout(() => {
      this.updateCartIcon(cartData);
    }, 300); // Wait 300ms before updating to batch rapid changes
  }

  bindFormEvents() {
    console.log('Binding form events...');
    
    // Save before form submission
    const form = document.querySelector('.quick-order-form, #quick-order-form');
    if (form) {
      form.addEventListener('submit', (e) => {
        console.log('Form submitting, saving quantities...');
        this.saveCurrentQuantities();
      });
    }
  }

  // Get current quantities from all inputs
  getCurrentQuantities() {
    const quantities = {};
    
    // Find all quantity inputs
    const inputs = document.querySelectorAll('input[data-variant-id], input[name^="updates["]');
    console.log('Found quantity inputs:', inputs.length);
    
    inputs.forEach(input => {
      const variantId = input.dataset.variantId || input.name.match(/\[(\d+)\]/)?.[1];
      const quantity = parseInt(input.value) || 0;
      
      if (variantId && quantity > 0) {
        quantities[variantId] = quantity;
      }
    });
    
    console.log('Current quantities:', quantities);
    return quantities;
  }

  // Save current quantities
  async saveCurrentQuantities() {
    // Prevent save loops
    if (this.isSaving) {
      console.log('Save already in progress, skipping...');
      return;
    }
    
    this.isSaving = true;
    
    try {
      const quantities = this.getCurrentQuantities();
      console.log('Saving quantities:', quantities);
      
      // Mark session as active when user makes changes
      // This prevents auto-restore from treating user actions as cross-device sync
      sessionStorage.setItem('cart_session_active', 'true');
      sessionStorage.setItem('last_cart_update', Date.now().toString());
      
      // Only save for logged in customers to metafields
      if (this.isCustomer) {
        await this.saveQuantitiesToMetafields(quantities);
      } else {
        console.log('⚠️ Not a logged in customer - skipping quantity save');
      }
    } finally {
      this.isSaving = false;
    }
  }

  // Metafield methods for quantities (localStorage removed)

  // Metafield methods for quantities (from original persistent-cart.js)
  async loadQuantitiesFromMetafields() {
    try {
      console.log('Loading quantities from metafields...');
      console.log('Customer ID for load:', this.customerId);
      
      // Don't try to load if no customer ID
      if (!this.customerId || this.customerId === 'null' || this.customerId === null) {
        console.log('⚠️ No customer ID available, skipping metafield load');
        return {};
      }
      
      const response = await fetch(`/apps/quick-order/cart-metafields?customerId=${this.customerId}`, {
        method: 'GET',
        headers: { 
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('Metafield response:', data);
        
        // Return the quantities directly (stored as JSON in metafield)
        return data.cartData && data.cartData.quantities ? data.cartData.quantities : {};
      } else {
        console.error('Failed to load quantities from metafields');
        return {};
      }
    } catch (error) {
      console.error('Error loading quantities from metafields:', error);
      return {};
    }
  }

  async saveQuantitiesToMetafields(quantities) {
    try {
      console.log('💾 Saving quantities to metafields:', quantities);
      console.log('📝 Customer ID for save:', this.customerId);
      
      // Don't save to metafields if no customer ID
      if (!this.customerId || this.customerId === 'null' || this.customerId === null) {
        console.log('⚠️ No customer ID available, skipping metafield save');
        return;
      }
      
      const cartData = {
        quantities: quantities,
        timestamp: new Date().toISOString()
      };

      const formData = new FormData();
      formData.append('customerId', this.customerId);
      formData.append('cartData', JSON.stringify(cartData));

      const response = await fetch('/apps/quick-order/cart-metafields', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        console.log('✅ Quantities saved to metafields successfully');
        const result = await response.json();
        console.log('Save result:', result);
      } else {
        console.error('❌ Failed to save quantities to metafields');
        const errorText = await response.text();
        console.error('Error response:', errorText);
      }
    } catch (error) {
      console.error('❌ Error saving quantities to metafields:', error);
    }
  }

  // Restore items to cart from metafield quantities
  async restoreItemsToCart(quantities) {
    console.log('🔄 Restoring items to cart from metafields:', quantities);
    
    try {
      // Add each item to cart with its saved quantity
      for (const [variantId, quantity] of Object.entries(quantities)) {
        if (quantity > 0) {
          console.log(`➕ Adding variant ${variantId} with quantity ${quantity} to cart`);
          
          const formData = new FormData();
          formData.append('id', variantId);
          formData.append('quantity', quantity);
          
          const response = await fetch('/cart/add.js', {
            method: 'POST',
            body: formData
          });
          
          if (response.ok) {
            console.log(`✅ Added variant ${variantId} to cart successfully`);
          } else {
            console.error(`❌ Failed to add variant ${variantId} to cart:`, await response.text());
          }
        }
      }
      
      console.log('✅ Finished restoring items to cart');
      
    } catch (error) {
      console.error('❌ Error restoring items to cart:', error);
    }
  }

  // Cleanup method to stop polling
  cleanup() {
    if (this.cartPollInterval) {
      clearInterval(this.cartPollInterval);
      this.cartPollInterval = null;
    }
    
    if (this.cartObserver) {
      this.cartObserver.disconnect();
      this.cartObserver = null;
    }
    
    console.log('🧹 PersistentCart cleanup completed');
  }
}

// Search and Filter functionality
class QuickOrderSearch {
  constructor() {
    this.rows = document.querySelectorAll(".table-row");
    this.searchInput = document.getElementById("collection-search");
    this.collectionSelect = document.getElementById("collection-select");
    this.currentPage = 1;
    this.productsPerPage = 10;
    this.filteredRows = Array.from(this.rows);
    
    this.init();
  }

  init() {
    if (!this.searchInput || !this.collectionSelect) {
      console.log('Search elements not found, skipping search initialization');
      return;
    }
    
    this.setupMobileLabels();
    this.bindEvents();
    this.updatePagination();
    this.showCurrentPage();
  }

  setupMobileLabels() {
    if (window.innerWidth <= 749) {
      this.rows.forEach(row => {
        const priceCell = row.querySelector('.price-column');
        const quantityCell = row.querySelector('.quantity-column');
        const totalCell = row.querySelector('.total-column');
        
        if (priceCell) priceCell.setAttribute('data-label', 'Price');
        if (quantityCell) quantityCell.setAttribute('data-label', 'Quantity');
        if (totalCell) totalCell.setAttribute('data-label', 'Total');
      });
    }
  }

  bindEvents() {
    this.searchInput.addEventListener("input", () => this.filterProducts());
    this.collectionSelect.addEventListener("change", () => this.filterProducts());
    
    // Pagination events
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (this.currentPage > 1) {
          this.goToPage(this.currentPage - 1);
        }
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(this.filteredRows.length / this.productsPerPage);
        if (this.currentPage < totalPages) {
          this.goToPage(this.currentPage + 1);
        }
      });
    }
  }

  filterProducts() {
    const searchTerm = this.searchInput.value.toLowerCase().trim();
    const selectedCollection = this.collectionSelect.value;

    this.filteredRows = Array.from(this.rows).filter(row => {
      const productTitle = (row.dataset.productTitle || '').toLowerCase();
      const productSku = (row.dataset.productSku || '').toLowerCase();
      const variantSku = (row.dataset.variantSku || '').toLowerCase();
      const productCollections = row.dataset.collections;

      const matchesSearch = searchTerm === '' || 
                           productTitle.includes(searchTerm) ||
                           productSku.includes(searchTerm) ||
                           variantSku.includes(searchTerm);
      const matchesCollection = selectedCollection === 'all' ||
        (productCollections && productCollections.includes(selectedCollection));

      return matchesSearch && matchesCollection;
    });

    this.currentPage = 1;
    this.updatePagination();
    this.showCurrentPage();
  }

  updatePagination() {
    const totalPages = Math.ceil(this.filteredRows.length / this.productsPerPage);
    const startIndex = (this.currentPage - 1) * this.productsPerPage;
    const endIndex = Math.min(startIndex + this.productsPerPage, this.filteredRows.length);

    // Update pagination info
    const showingStart = document.getElementById('showing-start');
    const showingEnd = document.getElementById('showing-end');
    const totalProducts = document.getElementById('total-products');
    
    if (showingStart) showingStart.textContent = this.filteredRows.length > 0 ? startIndex + 1 : 0;
    if (showingEnd) showingEnd.textContent = endIndex;
    if (totalProducts) totalProducts.textContent = this.filteredRows.length;

    // Update pagination buttons
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    
    if (prevBtn) prevBtn.disabled = this.currentPage === 1;
    if (nextBtn) nextBtn.disabled = this.currentPage === totalPages || totalPages === 0;

    // Update page numbers
    const pageNumbersContainer = document.getElementById('page-numbers');
    if (pageNumbersContainer) {
      pageNumbersContainer.innerHTML = '';

      const maxVisiblePages = 5;
      let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);

      if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }

      for (let i = startPage; i <= endPage; i++) {
        const pageBtn = document.createElement('button');
        pageBtn.type = 'button';
        pageBtn.className = `qo-pagination__number ${i === this.currentPage ? 'qo-pagination__number--active' : ''}`;
        pageBtn.setAttribute('data-page', i);
        pageBtn.textContent = i;
        pageBtn.addEventListener('click', () => this.goToPage(i));
        pageNumbersContainer.appendChild(pageBtn);
      }
    }
  }

  goToPage(page) {
    this.currentPage = page;
    this.showCurrentPage();
    this.updatePagination();
    
    // Scroll to top of the quick order container smoothly
    const container = document.querySelector('.quick-order-container');
    if (container) {
      container.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    } else {
      // Fallback to page top if container not found
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  }

  showCurrentPage() {
    const startIndex = (this.currentPage - 1) * this.productsPerPage;
    const endIndex = startIndex + this.productsPerPage;

    console.log('🔄 Showing current page:', this.currentPage, 'Range:', startIndex, '-', endIndex);

    // Store currently expanded variant states before hiding
    const expandedVariants = new Map();
    document.querySelectorAll('.qo-variants-container').forEach(container => {
      const productId = container.dataset.productId;
      const isExpanded = container.style.display !== 'none' && container.style.display !== '';
      if (isExpanded && productId) {
        expandedVariants.set(productId, true);
        console.log('📋 Storing expanded state for product:', productId);
      }
    });

    // Hide all product rows first (main product cards only, not variant containers)
    this.rows.forEach(row => {
      if (row.classList.contains('qo-product-card')) {
        row.style.display = 'none';
      }
    });

    // Also hide all variant containers initially
    document.querySelectorAll('.qo-variants-container').forEach(container => {
      container.style.display = 'none';
    });

    // Show filtered product rows for current page
    this.filteredRows.forEach((row, index) => {
      if (index >= startIndex && index < endIndex && row.classList.contains('qo-product-card')) {
        row.style.display = '';
        
        // Check if this product's variants should be restored to expanded state
        const productId = row.dataset.productId;
        if (productId && expandedVariants.has(productId)) {
          const variantContainer = document.querySelector(`.qo-variants-container[data-product-id="${productId}"]`);
          const toggleButton = row.querySelector('.qo-variant-toggle, .variant-toggle-btn');
          
          if (variantContainer && toggleButton) {
            // Restore expanded state
            variantContainer.style.display = 'block';
            toggleButton.classList.add('expanded');
            
            // Update toggle button text
            const toggleText = toggleButton.querySelector('.toggle-text');
            if (toggleText) {
              const variantCount = toggleButton.dataset.variantCount || 'variants';
              toggleText.textContent = `Hide ${variantCount}`;
            }
            
            console.log('✅ Restored expanded variants for product:', productId);
          }
        }
      }
    });

    console.log('✅ Page display updated, preserved', expandedVariants.size, 'expanded variant states');
    
    // Re-initialize toggle buttons for newly visible products
    setTimeout(() => {
      this.initializeToggleButtons();
    }, 100);
  }
}

// Price calculation functionality
class PriceCalculator {
  constructor() {
    this.init();
  }

  init() {
    this.bindPriceEvents();
    this.updateSubtotal();
  }

  bindPriceEvents() {
    // Bind to all quantity inputs
    document.addEventListener('input', (e) => {
      if (e.target.matches('.qty-input')) {
        this.updateRowTotal(e.target.closest('.table-row, .product-row, .variant-row'));
        this.updateSubtotal();
      }
    });

    document.addEventListener('change', (e) => {
      if (e.target.matches('.qty-input')) {
        this.updateRowTotal(e.target.closest('.table-row, .product-row, .variant-row'));
        this.updateSubtotal();
      }
    });
  }

  updateRowTotal(row) {
    if (!row) return;
    
    const qtyInput = row.querySelector(".qty-input");
    const rowTotal = row.querySelector(".row-total, .qo-total-value");
    const priceElement = row.querySelector(".price, .qo-price-value");
    
    if (qtyInput && rowTotal && priceElement) {
      let price = 0;
      
      // Priority 1: Use data-price attribute (Shopify prices in cents)
      if (priceElement.dataset.price) {
        const priceInCents = parseInt(priceElement.dataset.price) || 0;
        price = priceInCents / 100; // Convert cents to dollars
      }
      // Priority 2: Parse displayed text if data-price not available
      else {
        const priceText = priceElement.textContent;
        const cleanPrice = priceText.toString()
          .replace(/[Rs\s₹$£€]/g, '') // Remove currency symbols
          .replace(/,/g, '') // Remove commas
          .replace(/[^\d.]/g, ''); // Keep only digits and decimal
        price = parseFloat(cleanPrice) || 0;
      }
      
      const quantity = parseInt(qtyInput.value) || 0;
      const total = (price * quantity).toFixed(2);
      const formattedTotal = `$${total}`;
      
      // Update with enhanced live streaming animation
      if (rowTotal.textContent !== formattedTotal) {
        // Add updating class for visual feedback
        rowTotal.classList.add('updating');
        rowTotal.textContent = formattedTotal;
        
        // Add pulse animation for extra emphasis
        rowTotal.classList.add('pulse');
        
        // Reset animations and classes after animation completes
        setTimeout(() => {
          rowTotal.classList.remove('updating', 'pulse');
        }, 300);
      }
    }
  }

  calculateSubtotal() {
    let subtotal = 0;
    
    // Get ALL quantity inputs regardless of pagination visibility
    const qtyInputs = document.querySelectorAll(".qty-input");
    qtyInputs.forEach(input => {
      const quantity = parseInt(input.value) || 0;
      if (quantity > 0) {
        // Find the price element in the same row
        const row = input.closest('.table-row, .product-row, .variant-row');
        // REMOVED: row.style.display !== 'none' check to include all pages
        if (row) {
          const priceElement = row.querySelector('.price');
          if (priceElement) {
            let price = 0;
            
            // Priority 1: Use data-price attribute (Shopify prices in cents)
            if (priceElement.dataset.price) {
              const priceInCents = parseInt(priceElement.dataset.price) || 0;
              price = priceInCents / 100; // Convert cents to dollars
              console.log(`Using data-price: ${priceInCents} cents = ${price} dollars`);
            }
            // Priority 2: Parse displayed text if data-price not available
            else {
              const priceText = priceElement.textContent;
              const cleanPrice = priceText.toString()
                .replace(/[Rs\s₹$£€]/g, '') // Remove currency symbols
                .replace(/,/g, '') // Remove commas
                .replace(/[^\d.]/g, ''); // Keep only digits and decimal
              price = parseFloat(cleanPrice) || 0;
              console.log(`Using text price: "${priceText}" -> ${price} dollars`);
            }
            
            const lineTotal = price * quantity;
            subtotal += lineTotal;
            
            console.log(`Multi-page calculation: ${price} x ${quantity} = ${lineTotal}`);
          }
        }
      }
    });
    
    console.log('🧮 Total subtotal calculated (all pages):', subtotal.toFixed(2));
    return subtotal;
  }

  updateSubtotal() {
    const subtotal = this.calculateSubtotal();
    const subtotalElement = document.getElementById("subtotal-amount");
    if (subtotalElement) {
      subtotalElement.textContent = `$${subtotal.toFixed(2)}`;
      console.log('✅ Subtotal updated:', `$${subtotal.toFixed(2)}`);
    } else {
      console.warn('❌ Subtotal element not found (#subtotal-amount)');
    }
    
    // Dispatch event to notify fixed cart summary
    document.dispatchEvent(new CustomEvent('subtotalUpdated', {
      detail: { subtotal }
    }));
  }
}

// Variant Toggle functionality
class VariantToggle {
  constructor() {
    this.init();
  }

  init() {
    this.bindToggleEvents();
    this.debugLastProductToggle();
  }

  debugLastProductToggle() {
    // Specifically debug the last product's toggle button
    setTimeout(() => {
      const lastProductCard = document.querySelector('.qo-product-card:last-child');
      if (lastProductCard) {
        const toggleButton = lastProductCard.querySelector('.variant-toggle-btn');
        if (toggleButton) {
          console.log('🔍 Last product toggle button found:', {
            element: toggleButton,
            position: toggleButton.getBoundingClientRect(),
            styles: {
              visibility: getComputedStyle(toggleButton).visibility,
              pointerEvents: getComputedStyle(toggleButton).pointerEvents,
              zIndex: getComputedStyle(toggleButton).zIndex,
              position: getComputedStyle(toggleButton).position
            },
            productId: toggleButton.dataset.productId
          });
          
          // Add specific debug listener for this button
          toggleButton.addEventListener('click', (e) => {
            console.log('🚨 LAST PRODUCT BUTTON DIRECTLY CLICKED:', e);
            e.stopPropagation();
            this.handleToggle(toggleButton);
          });
        } else {
          console.log('🚨 No toggle button found in last product card');
        }
      }
    }, 1000);
  }

  bindToggleEvents() {
    console.log('🔗 Binding variant toggle events...');
    
    // Initialize all toggle buttons with proper attributes
    this.initializeToggleButtons();
    
    // Main event delegation for toggle buttons
    document.addEventListener('click', (e) => {
      const toggleButton = e.target.closest('.variant-toggle-btn, .qo-variant-toggle');
      
      if (toggleButton) {
        e.preventDefault();
        e.stopPropagation();
        
        console.log('🎯 Variant toggle clicked:', {
          productId: toggleButton.dataset.productId,
          button: toggleButton,
          coordinates: { x: e.clientX, y: e.clientY },
          isAccessible: this.isToggleAccessible(toggleButton)
        });
        
        this.handleToggle(toggleButton);
      }
    });

    // Keyboard accessibility for toggle buttons
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        const toggleButton = e.target.closest('.variant-toggle-btn, .qo-variant-toggle');
        if (toggleButton) {
          e.preventDefault();
          this.handleToggle(toggleButton);
        }
      }
    });

    // Debug listener for troubleshooting specific products
    this.bindDebugListeners();
  }

  initializeToggleButtons() {
    const toggleButtons = document.querySelectorAll('.variant-toggle-btn, .qo-variant-toggle');
    console.log(`🔧 Initializing ${toggleButtons.length} toggle buttons...`);
    
    toggleButtons.forEach((button, index) => {
      const productId = button.dataset.productId;
      
      if (!productId) {
        console.warn(`⚠️ Toggle button ${index} missing product ID:`, button);
        return;
      }
      
      // Ensure proper accessibility attributes
      if (!button.hasAttribute('aria-expanded')) {
        button.setAttribute('aria-expanded', 'false');
      }
      
      if (!button.hasAttribute('aria-controls')) {
        button.setAttribute('aria-controls', `variants-${productId}`);
      }
      
      // Ensure button is focusable
      if (!button.hasAttribute('tabindex')) {
        button.setAttribute('tabindex', '0');
      }
      
      // Add role if missing
      if (!button.hasAttribute('role')) {
        button.setAttribute('role', 'button');
      }
      
      console.log(`✅ Toggle button initialized for product: ${productId}`);
    });
  }

  isToggleAccessible(button) {
    const rect = button.getBoundingClientRect();
    const style = getComputedStyle(button);
    
    return {
      visible: style.visibility !== 'hidden',
      displayed: style.display !== 'none',
      clickable: style.pointerEvents !== 'none',
      inViewport: rect.top >= 0 && rect.left >= 0 && 
                 rect.bottom <= window.innerHeight && 
                 rect.right <= window.innerWidth,
      hasSize: rect.width > 0 && rect.height > 0
    };
  }

  bindDebugListeners() {
    // Add debug listener for last visible product specifically
    setTimeout(() => {
      const visibleProducts = Array.from(document.querySelectorAll('.qo-product-card'))
        .filter(card => getComputedStyle(card).display !== 'none');
      
      const lastProduct = visibleProducts[visibleProducts.length - 1];
      if (lastProduct) {
        const toggleButton = lastProduct.querySelector('.variant-toggle-btn, .qo-variant-toggle');
        if (toggleButton) {
          console.log('🔍 Last product toggle debug info:', {
            productId: toggleButton.dataset.productId,
            accessibility: this.isToggleAccessible(toggleButton),
            position: toggleButton.getBoundingClientRect()
          });
        }
      }
    }, 1000);
  }

  handleToggle(button) {
    const productId = button.dataset.productId;
    const productCard = button.closest('.qo-product-card');
    
    if (!productId) {
      console.error('❌ No product ID found on toggle button:', button);
      return;
    }
    
    console.log('🔄 Handling variant toggle for product:', productId);
    
    // Check if the product is completely out of stock
    if (productCard && productCard.classList.contains('qo-product-out-of-stock')) {
      // Check if ALL variants are out of stock
      const variantContainer = document.querySelector(`.qo-variants-container[data-product-id="${productId}"]`);
      if (variantContainer) {
        const availableVariants = variantContainer.querySelectorAll('.qo-status-active');
        if (availableVariants.length === 0) {
          this.showToast('All variants of this product are out of stock', 'error');
          return;
        }
      }
    }
    
    // Try multiple selectors to find variant container (production-level robustness)
    const selectors = [
      `.qo-variants-container[data-product-id="${productId}"]`,
      `.variant-rows[data-product-id="${productId}"]`,
      `[data-product-id="${productId}"].qo-variants-container`,
      `[data-product-id="${productId}"].variant-rows`
    ];
    
    let variantContainer = null;
    let selectorUsed = '';
    
    for (const selector of selectors) {
      variantContainer = document.querySelector(selector);
      if (variantContainer) {
        selectorUsed = selector;
        console.log('✅ Found variant container with selector:', selector);
        break;
      }
    }
    
    if (!variantContainer) {
      console.error('❌ No variant container found for product:', productId);
      console.log('❌ Attempted selectors:', selectors);
      
      // Show helpful error to user
      this.showToast('Unable to load product variants. Please refresh the page.', 'error');
      return;
    }
    
    // Determine if this is the last visible product for special handling
    const visibleProducts = Array.from(document.querySelectorAll('.qo-product-card')).filter(card => 
      getComputedStyle(card).display !== 'none'
    );
    const isLastVisibleProduct = productCard === visibleProducts[visibleProducts.length - 1];
    
    console.log('🔍 Product position info:', {
      productId,
      isLastVisibleProduct,
      visibleProductsCount: visibleProducts.length,
      selectorUsed
    });
    
    this.toggleVariantRows(variantContainer, button, productId, isLastVisibleProduct);
  }

  toggleVariantRows(variantContainer, button, productId, isLastVisibleProduct = false) {
    const isCurrentlyVisible = variantContainer.style.display !== 'none' && variantContainer.style.display !== '';
    const toggleText = button.querySelector('.toggle-text');
    const toggleIcon = button.querySelector('.toggle-icon, .qo-chevron');
    
    console.log('� Toggling variants:', {
      productId,
      isCurrentlyVisible,
      isLastVisibleProduct,
      containerElement: variantContainer
    });

    if (!isCurrentlyVisible) {
      // Show variants with Polaris-compliant animation
      this.showVariants(variantContainer, button, productId, isLastVisibleProduct);
    } else {
      // Hide variants
      this.hideVariants(variantContainer, button, productId, isLastVisibleProduct);
    }

    // Update button state and accessibility
    this.updateToggleButton(button, !isCurrentlyVisible, productId);

    // Update subtotal calculation after variant toggle
    this.debounceSubtotalUpdate();
  }

  showVariants(variantContainer, button, productId, isLastVisibleProduct) {
    // Polaris-style smooth expansion
    variantContainer.style.display = 'block';
    variantContainer.style.opacity = '0';
    variantContainer.style.transform = 'translateY(-10px)';
    
    // Add expanded state class for tree connector highlighting
    variantContainer.classList.add('qo-variants-expanded');
    
    // Special handling for last visible product to prevent overlap with fixed cart
    if (isLastVisibleProduct) {
      this.handleLastProductVariants(variantContainer, true);
    }
    
    // Smooth fade-in animation
    requestAnimationFrame(() => {
      variantContainer.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      variantContainer.style.opacity = '1';
      variantContainer.style.transform = 'translateY(0)';
    });
    
    // Focus management for accessibility
    setTimeout(() => {
      const firstVariantInput = variantContainer.querySelector('.qo-quantity-input:not([disabled])');
      if (firstVariantInput && document.activeElement === button) {
        firstVariantInput.focus();
      }
    }, 250);
    
    console.log(`✅ Variants shown for product: ${productId}${isLastVisibleProduct ? ' (LAST VISIBLE)' : ''}`);
    
    // Show success toast using Polaris styling
    this.showToast(`Variants expanded for ${this.getProductTitle(productId)}`, 'success', 2000);
  }

  hideVariants(variantContainer, button, productId, isLastVisibleProduct) {
    // Polaris-style smooth collapse
    variantContainer.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    variantContainer.style.opacity = '0';
    variantContainer.style.transform = 'translateY(-10px)';
    
    setTimeout(() => {
      variantContainer.style.display = 'none';
      variantContainer.classList.remove('qo-variants-expanded');
      
      // Reset special styling for last product
      if (isLastVisibleProduct) {
        this.handleLastProductVariants(variantContainer, false);
      }
      
      // Reset transition styles
      variantContainer.style.transition = '';
      variantContainer.style.transform = '';
      variantContainer.style.opacity = '';
    }, 200);
    
    console.log(`✅ Variants hidden for product: ${productId}${isLastVisibleProduct ? ' (LAST VISIBLE)' : ''}`);
  }

  handleLastProductVariants(variantContainer, isExpanding) {
    if (isExpanding) {
      // Minimal styling for last product - only add space if really needed
      variantContainer.classList.add('qo-last-product-variants');
      
      // Only add bottom spacer if there's a fixed cart that might overlap
      const fixedCart = document.querySelector('.qo-fixed-cart-summary');
      if (fixedCart) {
        const bottomSpacer = document.querySelector('.qo-bottom-spacer');
        if (bottomSpacer) {
          bottomSpacer.classList.add('qo-last-variants-expanded');
        }
      }
      
      // Smart scroll to keep variants visible (reduced delay)
      setTimeout(() => {
        this.ensureVariantsVisible(variantContainer);
      }, 150);
      
    } else {
      // Clean reset - remove all extra spacing
      variantContainer.style.marginBottom = '';
      variantContainer.classList.remove('qo-last-product-variants');
      
      const bottomSpacer = document.querySelector('.qo-bottom-spacer');
      if (bottomSpacer) {
        bottomSpacer.classList.remove('qo-last-variants-expanded');
      }
    }
  }

  ensureVariantsVisible(variantContainer) {
    const containerRect = variantContainer.getBoundingClientRect();
    const windowHeight = window.innerHeight;
    const fixedCartHeight = document.querySelector('.qo-fixed-cart-summary')?.offsetHeight || 100;
    const buffer = 20;
    
    // Check if variants are being cut off by fixed cart
    if (containerRect.bottom > windowHeight - fixedCartHeight - buffer) {
      const scrollAmount = containerRect.bottom - windowHeight + fixedCartHeight + buffer;
      
      window.scrollBy({
        top: scrollAmount,
        behavior: 'smooth'
      });
      
      console.log('📜 Auto-scrolled to ensure last product variants are visible');
    }
  }

  updateToggleButton(button, isExpanded, productId) {
    const toggleText = button.querySelector('.toggle-text');
    const toggleIcon = button.querySelector('.toggle-icon, .qo-chevron');
    
    // Update button state
    if (isExpanded) {
      button.classList.add('expanded', 'qo-variant-expanded');
      button.setAttribute('aria-expanded', 'true');
    } else {
      button.classList.remove('expanded', 'qo-variant-expanded');
      button.setAttribute('aria-expanded', 'false');
    }
    
    // Update text content
    if (toggleText) {
      const variantCount = button.dataset.variantCount || 'variants';
      toggleText.textContent = isExpanded ? `Hide ${variantCount}` : `Show ${variantCount}`;
    }
    
    // Animate chevron icon
    if (toggleIcon) {
      toggleIcon.style.transform = isExpanded ? 'rotate(180deg)' : 'rotate(0deg)';
      toggleIcon.style.transition = 'transform 0.2s ease';
    }
  }

  getProductTitle(productId) {
    const productCard = document.querySelector(`.qo-product-card[data-product-id="${productId}"]`);
    const titleElement = productCard?.querySelector('.qo-product-title');
    return titleElement?.textContent || 'Product';
  }

  debounceSubtotalUpdate() {
    // Debounce subtotal updates to prevent excessive calculations
    clearTimeout(this.subtotalUpdateTimer);
    this.subtotalUpdateTimer = setTimeout(() => {
      if (window.priceCalculator) {
        window.priceCalculator.updateSubtotal();
      }
    }, 100);
  }

  // Production Debug Method - Call from console if needed
  debugVariantToggle(productId = null) {
    console.log('🔍 VARIANT TOGGLE DEBUG REPORT');
    console.log('=================================');
    
    const toggleButtons = document.querySelectorAll('.variant-toggle-btn, .qo-variant-toggle');
    const variantContainers = document.querySelectorAll('.qo-variants-container, .variant-rows');
    
    console.log(`📊 Found ${toggleButtons.length} toggle buttons and ${variantContainers.length} variant containers`);
    
    toggleButtons.forEach((button, index) => {
      const btnProductId = button.dataset.productId;
      const isTarget = !productId || btnProductId === productId;
      
      if (isTarget) {
        const accessibility = this.isToggleAccessible(button);
        const variantContainer = document.querySelector(`.qo-variants-container[data-product-id="${btnProductId}"], .variant-rows[data-product-id="${btnProductId}"]`);
        
        console.log(`\n🔍 Button ${index + 1} (Product: ${btnProductId}):`);
        console.log('   Accessibility:', accessibility);
        console.log('   Has variant container:', !!variantContainer);
        console.log('   Button element:', button);
        
        if (variantContainer) {
          console.log('   Container visible:', variantContainer.style.display !== 'none');
          console.log('   Container element:', variantContainer);
        }
      }
    });
    
    // Test last product specifically
    const visibleProducts = Array.from(document.querySelectorAll('.qo-product-card'))
      .filter(card => getComputedStyle(card).display !== 'none');
    
    const lastProduct = visibleProducts[visibleProducts.length - 1];
    if (lastProduct) {
      const lastProductId = lastProduct.dataset.productId;
      console.log(`\n🚨 LAST PRODUCT ANALYSIS (ID: ${lastProductId}):`);
      
      const toggleButton = lastProduct.querySelector('.variant-toggle-btn, .qo-variant-toggle');
      if (toggleButton) {
        console.log('   Toggle button found:', toggleButton);
        console.log('   Accessibility:', this.isToggleAccessible(toggleButton));
        
        // Test click functionality
        console.log('   Testing click...');
        toggleButton.click();
      } else {
        console.log('   ❌ No toggle button found in last product!');
      }
    }
    
    console.log('\n=================================');
    return {
      toggleButtons: toggleButtons.length,
      variantContainers: variantContainers.length,
      lastProductId: lastProduct?.dataset.productId
    };
  }
}

// Initialize all functionality when the page loads
document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 Initializing Quick Order functionality...');
  
  // Initialize persistent cart
  window.persistentCart = new PersistentCart();
  
  // Initialize search and filtering
  window.quickOrderSearch = new QuickOrderSearch();
  
  // Initialize price calculations
  window.priceCalculator = new PriceCalculator();
  
  // Initialize variant toggle functionality
  window.variantToggle = new VariantToggle();
  
  // Global debug function for production troubleshooting
  window.debugVariants = (productId) => {
    if (window.persistentCart) {
      return window.persistentCart.debugVariantToggle(productId);
    } else {
      console.error('❌ PersistentCart not initialized');
      return null;
    }
  };
  
  console.log('✅ All Quick Order functionality initialized');
  console.log('🔧 Debug function available: window.debugVariants(productId)');
});

// Global function to reset variant quantity (can be called from anywhere)
window.resetVariantQuantity = async function(variantId) {
  console.log(`🌍 Global function called to reset variant ${variantId}`);
  if (window.persistentCart) {
    await window.persistentCart.resetVariantQuantity(variantId);
  } else {
    console.warn('PersistentCart not initialized yet');
  }
};

// Global function to handle cart removal events
window.handleCartItemRemoval = async function(variantIds) {
  console.log(`🌍 Global function called to handle cart item removal:`, variantIds);
  if (window.persistentCart) {
    const ids = Array.isArray(variantIds) ? variantIds : [variantIds];
    for (const variantId of ids) {
      if (variantId) {
        await window.persistentCart.resetVariantQuantity(variantId);
      }
    }
  } else {
    console.warn('PersistentCart not initialized yet');
  }
};

// Global function to update cart icon
window.updateCartIcon = async function() {
  console.log(`🌍 Global function called to update cart icon`);
  if (window.persistentCart) {
    try {
      const cartData = await window.persistentCart.fetchCurrentCart();
      window.persistentCart.updateCartIcon(cartData);
    } catch (error) {
      console.error('Error updating cart icon globally:', error);
    }
  } else {
    console.warn('PersistentCart not initialized yet');
  }
};

// Add helper method to PersistentCart prototype
PersistentCart.prototype.isLastProductCard = function(productCard) {
  if (!productCard) return false;
  
  const allProducts = document.querySelectorAll('.qo-product-card');
  const productIndex = Array.from(allProducts).indexOf(productCard);
  const isLast = productIndex === allProducts.length - 1;
  
  console.log('🔍 Product position check:', {
    productIndex: productIndex + 1,
    totalProducts: allProducts.length,
    isLast: isLast
  });
  
  return isLast;
};

// Fixed Cart Summary Handler
class FixedCartSummary {
  constructor() {
    this.fixedCartElement = document.getElementById('fixed-cart-summary');
    this.itemCountElement = document.getElementById('cart-item-count');
    this.totalAmountElement = document.getElementById('fixed-subtotal-amount');
    
    // Register globally for instant PersistentCart callbacks
    window.fixedCartSummary = this;
    this.clearAllBtn = document.getElementById('clear-all-btn');
    this.isUpdating = false; // Prevent simultaneous updates
    
    this.init();
  }

  async init() {
    // Bind clear all button
    if (this.clearAllBtn) {
      this.clearAllBtn.addEventListener('click', () => this.clearAllQuantities());
    }

    // Initialize with loading state to prevent flickering
    this.setLoadingState();

    // Wait for persistent cart to load, then sync with cart data
    this.waitForPersistentCartAndSync();

    // Listen for custom events instead of direct input events to avoid conflicts
    this.updateTimeout = null;
    document.addEventListener('cartUpdated', () => {
      this.debouncedUpdateFixedCartSummary();
    });
    
    document.addEventListener('subtotalUpdated', () => {
      this.debouncedUpdateFixedCartSummary();
    });

    // Handle clicks on disabled quantity inputs
    document.addEventListener('focus', (e) => {
      if (e.target.classList.contains('qty-input') && e.target.disabled) {
        e.target.blur(); // Remove focus immediately
        this.showToast('This product is out of stock', 'error');
      }
    });

    // Prevent typing in disabled quantity inputs
    document.addEventListener('keydown', (e) => {
      if (e.target.classList.contains('qty-input') && e.target.disabled) {
        e.preventDefault();
        this.showToast('This product is out of stock', 'error');
      }
    });

    // Removed cartSynced event listener to prevent conflicts
    // Cart summary now updates only via cartUpdated and subtotalUpdated events

    // Bind quantity button events
    this.bindQuantityButtons();
  }

  debouncedUpdateFixedCartSummary() {
    // Instant update - no delay for real-time React-like behavior
    this.updateFixedCartSummary();
  }

  // Update row subtotal immediately (same as in PersistentCart class)
  updateRowSubtotalImmediate(input) {
    const row = input.closest('.qo-product-card, .qo-variant-card, .table-row');
    if (!row) return;
    
    const subtotalElement = row.querySelector('.qo-total-value');
    if (!subtotalElement) return;
    
    const quantity = parseInt(input.value) || 0;
    let price = 0;
    
    // Get price from data attribute or DOM element
    const priceElement = row.querySelector('.qo-price-value, .price');
    if (priceElement) {
      if (priceElement.dataset.price) {
        // Price in cents from Shopify
        price = parseInt(priceElement.dataset.price) / 100;
      } else {
        // Parse price from text
        const priceText = priceElement.textContent || '';
        const cleanPrice = priceText.replace(/[₹Rs\s$£€,]/g, '');
        price = parseFloat(cleanPrice) || 0;
      }
    }
    
    const subtotal = price * quantity;
    const formattedSubtotal = `$${subtotal.toFixed(2)}`;
    
    // Update the subtotal with enhanced live streaming animation
    if (subtotalElement.textContent !== formattedSubtotal) {
      // Add updating class for visual feedback
      subtotalElement.classList.add('updating');
      subtotalElement.textContent = formattedSubtotal;
      
      // Add pulse animation for extra emphasis
      subtotalElement.classList.add('pulse');
      
      // Reset animations and classes after animation completes
      setTimeout(() => {
        subtotalElement.classList.remove('updating', 'pulse');
      }, 300);
    }
    
    console.log(`💰 Row subtotal updated live: ${quantity} × $${price.toFixed(2)} = ${formattedSubtotal}`);
  }

  bindQuantityButtons() {
    // Handle increase buttons
    document.addEventListener('click', (e) => {
      if (e.target.closest('.qo-qty-increase')) {
        e.preventDefault();
        const input = e.target.closest('.qo-quantity-input-wrapper').querySelector('.qo-quantity-input');
        const button = e.target.closest('.qo-qty-increase');
        
        if (button.disabled || input.disabled) {
          this.showToast('This product is out of stock', 'error');
          return;
        }
        
        if (input && !input.disabled) {
          const currentValue = parseInt(input.value) || 0;
          input.value = currentValue + 1;
          
          // Update row subtotal immediately for live streaming effect
          this.updateRowSubtotalImmediate(input);
          
          // Update immediately for button clicks (no debouncing needed)
          this.validateStockQuantity(input);
          this.updateFixedCartSummary();
          
          // Trigger input event for other listeners
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    });

    // Handle decrease buttons
    document.addEventListener('click', (e) => {
      if (e.target.closest('.qo-qty-decrease')) {
        e.preventDefault();
        const input = e.target.closest('.qo-quantity-input-wrapper').querySelector('.qo-quantity-input');
        const button = e.target.closest('.qo-qty-decrease');
        
        if (button.disabled || input.disabled) {
          this.showToast('This product is out of stock', 'error');
          return;
        }
        
        if (input && !input.disabled) {
          const currentValue = parseInt(input.value) || 0;
          if (currentValue > 0) {
            input.value = currentValue - 1;
            
            // Update row subtotal immediately for live streaming effect
            this.updateRowSubtotalImmediate(input);
            
            // Update immediately for button clicks (no debouncing needed)
            this.validateStockQuantity(input);
            this.updateFixedCartSummary();
            
            // Trigger input event for other listeners
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        }
      }
    });
  }

  setLoadingState() {
    // Set loading state to prevent flickering during initialization
    if (this.itemCountElement) {
      this.itemCountElement.textContent = 'Loading...';
    }
    if (this.totalAmountElement) {
      this.totalAmountElement.textContent = 'Loading...';
    }
  }

  async waitForPersistentCartAndSync() {
    // Check immediately for persistent cart - no polling delays
    const checkAndSync = async () => {
      if (window.persistentCart && window.persistentCart.isInitialized === true) {
        console.log('✅ PersistentCart found and initialized, syncing instantly...');
        await this.syncWithCart();
        return;
      }
      
      // If not ready, use immediate callback instead of timeout
      requestAnimationFrame(checkAndSync);
    };
    
    // Start checking immediately
    checkAndSync();
  }

  async syncWithCart() {
    try {
      // Get current cart data
      const response = await fetch('/cart.js');
      const cartData = await response.json();
      
      console.log('🛒 Syncing fixed cart with cart data:', cartData);
      
      let totalItems = 0;
      let totalAmount = 0;
      
      if (cartData && cartData.items) {
        cartData.items.forEach(item => {
          totalItems += item.quantity;
          totalAmount += item.final_line_price;
        });
      }
      
      // Update display atomically to prevent flickering
      const itemText = totalItems === 1 ? 'item' : 'items';
      const newItemText = `${totalItems} ${itemText} in cart`;
      const formattedAmount = this.formatMoney(totalAmount);
      
      requestAnimationFrame(() => {
        if (this.itemCountElement) {
          this.itemCountElement.textContent = newItemText;
        }
        
        if (this.totalAmountElement) {
          this.totalAmountElement.textContent = formattedAmount;
        }
        
        // Always show fixed cart
        if (this.fixedCartElement) {
          this.fixedCartElement.style.display = 'block';
        }
      });
      
      console.log(`✅ Fixed cart synced: ${totalItems} items, ${this.formatMoney(totalAmount)}`);
      
    } catch (error) {
      console.error('❌ Error syncing fixed cart with cart data:', error);
      // Fallback to calculating from quantity inputs
      this.updateFixedCartSummary();
    }
  }

  updateFixedCartSummary() {
    // Prevent simultaneous updates
    if (this.isUpdating) return;
    this.isUpdating = true;

    const quantityInputs = document.querySelectorAll('.qty-input');
    let totalItems = 0;
    let totalAmount = 0;

    quantityInputs.forEach(input => {
      const quantity = parseInt(input.value) || 0;
      if (quantity > 0) {
        totalItems += quantity;
        
        // Get price from data attribute or calculate
        const priceElement = input.closest('.qo-product-card, .qo-variant-card')?.querySelector('[data-price]');
        if (priceElement) {
          const price = parseFloat(priceElement.dataset.price) || 0;
          totalAmount += price * quantity;
        }
      }
    });

    // Calculate new values
    const itemText = totalItems === 1 ? 'item' : 'items';
    const newItemText = `${totalItems} ${itemText} in cart`;
    const newAmountText = this.formatMoney(totalAmount);

    // Only update if the values have actually changed to prevent unnecessary DOM updates
    const currentItemText = this.itemCountElement?.textContent;
    const currentAmountText = this.totalAmountElement?.textContent;
    
    if (currentItemText !== newItemText || currentAmountText !== newAmountText) {
      // Update both elements atomically to prevent flickering
      requestAnimationFrame(() => {
        if (this.itemCountElement && currentItemText !== newItemText) {
          this.itemCountElement.textContent = newItemText;
        }

        if (this.totalAmountElement && currentAmountText !== newAmountText) {
          this.totalAmountElement.textContent = newAmountText;
        }

        // Always show fixed cart (never hide)
        if (this.fixedCartElement) {
          this.fixedCartElement.style.display = 'block';
        }
        
        console.log('🛒 Fixed cart updated (local calculation):', newItemText, newAmountText);
      });
    }

    // Reset update flag
    this.isUpdating = false;
  }

  async clearAllQuantities() {
    // Show loading state
    const clearBtn = document.getElementById('clear-all-btn');
    const originalText = clearBtn ? clearBtn.textContent : '';
    if (clearBtn) {
      clearBtn.textContent = 'Clearing...';
      clearBtn.disabled = true;
    }

    try {
      // Get current cart data to identify quick order items
      const cartData = await this.getCurrentCart();
      const quickOrderVariants = this.getQuickOrderVariants();
      
      // Prepare updates object to remove quick order items from cart
      const updates = {};
      if (cartData && cartData.items) {
        cartData.items.forEach(item => {
          const variantId = item.variant_id?.toString() || item.id?.toString();
          if (quickOrderVariants.has(variantId)) {
            updates[variantId] = 0; // Set quantity to 0 to remove from cart
          }
        });
      }

      // Update cart to remove quick order items
      if (Object.keys(updates).length > 0) {
        const response = await fetch('/cart/update.js', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ updates })
        });

        if (response.ok) {
          const updatedCartData = await response.json();
          console.log('✅ Cart cleared of quick order items');
          
          // Trigger cart updated event for theme compatibility
          document.dispatchEvent(new CustomEvent('cart:updated', {
            detail: { cart: updatedCartData }
          }));
          
          // Update cart icon immediately
          if (window.persistentCart) {
            window.persistentCart.updateCartIcon(updatedCartData);
          }
        } else {
          console.error('Failed to clear cart items');
          this.showToast('Failed to clear cart items', 'error');
        }
      }

      // Clear quantities in quick order form
      const quantityInputs = document.querySelectorAll('.qty-input');
      quantityInputs.forEach(input => {
        input.value = '0';
        // Trigger change event for other listeners
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });

      // Update row totals
      document.querySelectorAll('.row-total').forEach(total => {
        total.textContent = '$0.00';
      });

      // Update main subtotal
      const subtotalElement = document.getElementById('subtotal-amount');
      if (subtotalElement) {
        subtotalElement.textContent = '$0.00';
      }

      // Update fixed cart summary
      this.updateFixedCartSummary();

      // Clear metafields by saving empty quantities to server
      if (window.persistentCart && typeof window.persistentCart.saveQuantitiesToMetafields === 'function') {
        const emptyQuantities = {};
        await window.persistentCart.saveQuantitiesToMetafields(emptyQuantities);
      }

      console.log('✅ All quantities cleared from quick order and cart');
      this.showToast('Cart cleared successfully', 'success');

    } catch (error) {
      console.error('Error clearing cart:', error);
      this.showToast('Error clearing cart', 'error');
    } finally {
      // Restore button state
      if (clearBtn) {
        clearBtn.textContent = originalText;
        clearBtn.disabled = false;
      }
    }
  }

  validateStockQuantity(input) {
    const enteredQuantity = parseInt(input.value) || 0;
    const stockQuantity = parseInt(input.dataset.stockQuantity) || 999999;
    const inventoryManagement = input.dataset.inventoryManagement;
    
    // Only validate if stock tracking is enabled
    if (inventoryManagement === 'shopify' && stockQuantity !== 999999) {
      if (enteredQuantity > stockQuantity) {
        // Show error toast
        this.showStockErrorToast(enteredQuantity, stockQuantity);
        
        // Set input to maximum available stock
        input.value = stockQuantity;
        
        // Trigger input event to update calculations
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  showStockErrorToast(requested, available) {
    const message = `Insufficient inventory: Requested quantity of ${requested} exceeds available stock of ${available}. Quantity has been adjusted to maximum available inventory.`;
    this.showToast(message, 'error');
  }

  formatMoney(cents) {
    // Shopify returns prices in cents, convert to currency format
    const amount = cents / 100;
    
    // Use dollar symbol for all currency formatting
    return '$' + amount.toFixed(2);
  }

  // Helper method to get current cart data
  async getCurrentCart() {
    try {
      const response = await fetch('/cart.js');
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching cart:', error);
    }
    return { items: [] };
  }

  // Helper method to get all variant IDs from quick order form
  getQuickOrderVariants() {
    const variants = new Set();
    const quantityInputs = document.querySelectorAll('.qty-input');
    
    quantityInputs.forEach(input => {
      const variantId = input.dataset.variantId || input.getAttribute('data-variant-id');
      if (variantId) {
        variants.add(variantId.toString());
      }
    });
    
    return variants;
  }

  // Shopify Polaris Toast notification helper method (FixedCartSummary)
  showToast(message, type = 'success') {
    // Remove any existing toasts
    const existingToast = document.querySelector('.Polaris-Toast');
    if (existingToast) {
      existingToast.remove();
    }

    // Create Polaris toast element
    const toast = document.createElement('div');
    toast.className = `Polaris-Toast ${type === 'error' ? 'Polaris-Toast--error' : 'Polaris-Toast--success'}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    toast.setAttribute('aria-atomic', 'true');
    
    const iconSVG = type === 'error' 
      ? `<svg viewBox="0 0 20 20" class="Polaris-Icon__Svg" focusable="false" aria-hidden="true">
           <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM7.8 7.8a.75.75 0 0 1 1.06 0L10 8.94l1.14-1.14a.75.75 0 1 1 1.06 1.06L11.06 10l1.14 1.14a.75.75 0 1 1-1.06 1.06L10 11.06l-1.14 1.14a.75.75 0 1 1-1.06-1.06L8.94 10 7.8 8.86a.75.75 0 0 1 0-1.06z" fill="currentColor"/>
         </svg>`
      : `<svg viewBox="0 0 20 20" class="Polaris-Icon__Svg" focusable="false" aria-hidden="true">
           <path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.236 4.53L7.89 10.322a.75.75 0 1 0-1.28.956l2.5 3.347a.75.75 0 0 0 1.247.036l3.5-4.891z" fill="currentColor"/>
         </svg>`;

    toast.innerHTML = `
      <div class="Polaris-Toast__Content">
        <div class="Polaris-Toast__Icon">
          <span class="Polaris-Icon">
            ${iconSVG}
          </span>
        </div>
        <div class="Polaris-Toast__Message">
          ${message}
        </div>
        <button type="button" class="Polaris-Toast__CloseButton" aria-label="Dismiss notification">
          <span class="Polaris-Icon">
            <svg viewBox="0 0 20 20" class="Polaris-Icon__Svg" focusable="false" aria-hidden="true">
              <path d="M14.54 13.46a.75.75 0 1 1-1.06 1.06L10 11.06l-3.48 3.46a.75.75 0 1 1-1.06-1.06L8.94 10 5.46 6.54a.75.75 0 1 1 1.06-1.06L10 8.94l3.46-3.46a.75.75 0 1 1 1.06 1.06L11.06 10l3.48 3.46z" fill="currentColor"/>
            </svg>
          </span>
        </button>
      </div>
    `;

    // Add to page
    document.body.appendChild(toast);

    // Add close button functionality
    const closeButton = toast.querySelector('.Polaris-Toast__CloseButton');
    closeButton.addEventListener('click', () => {
      if (toast && toast.parentNode) {
        toast.classList.add('Polaris-Toast--exiting');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 200);
      }
    });

    // Auto remove after 5 seconds (Polaris standard)
    setTimeout(() => {
      if (toast && toast.parentNode) {
        toast.classList.add('Polaris-Toast--exiting');
        setTimeout(() => {
          if (toast.parentNode) {
            toast.remove();
          }
        }, 200);
      }
    }, 5000);
  }
}

// Initialize Fixed Cart Summary when DOM is ready - instant initialization
document.addEventListener('DOMContentLoaded', () => {
  new FixedCartSummary(); // Constructor registers itself globally
});