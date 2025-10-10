// Quick Order Variant Toggle Test Script
// This file helps test and debug variant toggle functionality

class VariantToggleTest {
  constructor() {
    this.init();
  }

  init() {
    console.log('🧪 Variant Toggle Test initialized');
    this.runDiagnostics();
  }

  runDiagnostics() {
    console.log('🔍 Running variant toggle diagnostics...');
    
    // Check if all required elements exist
    const toggleButtons = document.querySelectorAll('.variant-toggle-btn, .qo-variant-toggle');
    const variantContainers = document.querySelectorAll('.qo-variants-container, .variant-rows');
    
    console.log(`📊 Found ${toggleButtons.length} toggle buttons`);
    console.log(`📊 Found ${variantContainers.length} variant containers`);
    
    // Check each toggle button
    toggleButtons.forEach((button, index) => {
      const productId = button.dataset.productId;
      const variantContainer = document.querySelector(
        `.qo-variants-container[data-product-id="${productId}"], .variant-rows[data-product-id="${productId}"]`
      );
      
      console.log(`Button ${index + 1}:`, {
        productId,
        hasContainer: !!variantContainer,
        buttonVisible: getComputedStyle(button).display !== 'none',
        containerExists: !!variantContainer
      });
    });
    
    // Test last product specifically
    this.testLastProduct();
  }

  testLastProduct() {
    const visibleProducts = Array.from(document.querySelectorAll('.qo-product-card'))
      .filter(card => getComputedStyle(card).display !== 'none');
    
    if (visibleProducts.length === 0) {
      console.log('❌ No visible products found');
      return;
    }
    
    const lastProduct = visibleProducts[visibleProducts.length - 1];
    const lastProductId = lastProduct.dataset.productId;
    const toggleButton = lastProduct.querySelector('.variant-toggle-btn, .qo-variant-toggle');
    const variantContainer = document.querySelector(
      `.qo-variants-container[data-product-id="${lastProductId}"], .variant-rows[data-product-id="${lastProductId}"]`
    );
    
    console.log('🚨 Last Product Test:', {
      productId: lastProductId,
      hasToggleButton: !!toggleButton,
      hasVariantContainer: !!variantContainer,
      toggleButtonRect: toggleButton?.getBoundingClientRect(),
      containerRect: variantContainer?.getBoundingClientRect()
    });
    
    if (toggleButton) {
      console.log('🎯 Testing last product toggle click...');
      this.simulateClick(toggleButton);
    }
  }

  simulateClick(button) {
    const event = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    
    button.dispatchEvent(event);
    console.log('✅ Click event dispatched');
  }

  // Manual test functions
  testAllToggles() {
    const toggleButtons = document.querySelectorAll('.variant-toggle-btn, .qo-variant-toggle');
    
    console.log(`🧪 Testing all ${toggleButtons.length} toggle buttons...`);
    
    toggleButtons.forEach((button, index) => {
      setTimeout(() => {
        console.log(`Testing button ${index + 1}...`);
        this.simulateClick(button);
      }, index * 1000);
    });
  }

  fixMissingContainers() {
    console.log('🔧 Checking for missing variant containers...');
    
    const toggleButtons = document.querySelectorAll('.variant-toggle-btn, .qo-variant-toggle');
    
    toggleButtons.forEach(button => {
      const productId = button.dataset.productId;
      const variantContainer = document.querySelector(
        `.qo-variants-container[data-product-id="${productId}"], .variant-rows[data-product-id="${productId}"]`
      );
      
      if (!variantContainer) {
        console.warn(`❌ Missing variant container for product: ${productId}`);
        
        // Create a placeholder container (for debugging)
        const placeholder = document.createElement('div');
        placeholder.className = 'qo-variants-container variant-rows debug-placeholder';
        placeholder.dataset.productId = productId;
        placeholder.style.display = 'none';
        placeholder.innerHTML = '<p>Debug: Variant container was missing</p>';
        
        // Insert after product card
        const productCard = button.closest('.qo-product-card');
        if (productCard && productCard.nextSibling) {
          productCard.parentNode.insertBefore(placeholder, productCard.nextSibling);
          console.log(`✅ Created debug placeholder for product: ${productId}`);
        }
      }
    });
  }
}

// Auto-initialize when DOM is ready (if not already loaded)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.variantToggleTest = new VariantToggleTest();
  });
} else {
  window.variantToggleTest = new VariantToggleTest();
}

// Global test functions
window.testVariants = () => {
  if (window.variantToggleTest) {
    window.variantToggleTest.testAllToggles();
  }
};

window.fixVariantContainers = () => {
  if (window.variantToggleTest) {
    window.variantToggleTest.fixMissingContainers();
  }
};

console.log('🧪 Variant test script loaded. Available functions:');
console.log('   - window.testVariants() - Test all toggle buttons');
console.log('   - window.fixVariantContainers() - Fix missing containers');
console.log('   - window.debugVariants() - Debug specific product');