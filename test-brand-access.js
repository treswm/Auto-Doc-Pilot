import 'dotenv/config';

const token = process.env.ZENDESK_OAUTH_ACCESS_TOKEN;
const subdomain = process.env.ZENDESK_SUBDOMAIN || 'himarley-staging';
const sourceLocale = process.env.SOURCE_LOCALE || 'en-us';

async function test() {
  console.log('Testing Help Center access...\n');

  const sectionsRes = await fetch(
    `https://${subdomain}.zendesk.com/api/v2/help_center/${sourceLocale}/sections.json?page[size]=1`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );

  console.log('Sections endpoint:', sectionsRes.status);
  if (sectionsRes.ok) {
    const data = await sectionsRes.json();
    console.log(`Fetched ${data.sections?.length || 0} section(s) from ${sourceLocale}`);
  } else {
    console.log(await sectionsRes.text());
  }
}

test();
