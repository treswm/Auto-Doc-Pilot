/**
 * Zendesk Help Center Brand Configuration
 * Allows easy switching between staging and production environments
 */

const BRANDS = {
  staging: {
    name: "Hi Marley Staging",
    id: 49194539612563,
    subdomain: process.env.ZENDESK_SUBDOMAIN,
    description: "Staging environment for testing",
  },
  production: {
    name: "Hi Marley",
    id: process.env.ZENDESK_PRODUCTION_BRAND_ID, // Will be set via env once ready
    subdomain: process.env.ZENDESK_SUBDOMAIN,
    description: "Production Help Center",
  },
};

// Default to staging for safety
const CURRENT_ENVIRONMENT = process.env.ZENDESK_ENVIRONMENT || "staging";

function getCurrentBrand() {
  const brand = BRANDS[CURRENT_ENVIRONMENT];
  if (!brand) {
    throw new Error(
      `Unknown environment: ${CURRENT_ENVIRONMENT}. Use 'staging' or 'production'.`
    );
  }
  return brand;
}

function getBrandById(brandId) {
  return Object.values(BRANDS).find((b) => b.id === brandId);
}

function switchEnvironment(env) {
  if (!BRANDS[env]) {
    throw new Error(`Unknown environment: ${env}`);
  }
  process.env.ZENDESK_ENVIRONMENT = env;
  console.log(`🔄 Switched to ${env} environment: ${BRANDS[env].name}`);
}

export { getCurrentBrand, getBrandById, switchEnvironment, BRANDS };
