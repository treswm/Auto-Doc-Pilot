import "dotenv/config";

const {
  ZENDESK_SUBDOMAIN,
  ZENDESK_OAUTH_ACCESS_TOKEN,
  OPENAI_API_KEY,
} = process.env;

if (!ZENDESK_SUBDOMAIN || !ZENDESK_OAUTH_ACCESS_TOKEN) {
  console.error("❌ Missing Zendesk env vars");
  process.exit(1);
}
if (!OPENAI_API_KEY) {
  console.error("❌ Missing OPENAI_API_KEY");
  process.exit(1);
}

const zendeskBaseUrl = `https://${ZENDESK_SUBDOMAIN}.zendesk.com/api/v2`;
const SECTION_ID = "49206877282195"; // Best Practices
const SOURCE_LOCALE = "en-us";
const TARGET_LOCALE = "fr-ca";

async function fetchArticlesInSection() {
  console.log(`📋 Fetching articles from section ${SECTION_ID}...`);
  try {
    const res = await fetch(
      `${zendeskBaseUrl}/help_center/en-us/sections/${SECTION_ID}/articles.json?page[size]=100`,
      {
        headers: {
          Authorization: `Bearer ${ZENDESK_OAUTH_ACCESS_TOKEN}`,
        },
      }
    );
    if (!res.ok) {
      throw new Error(`Failed to fetch: ${res.status}`);
    }
    const data = await res.json();
    return data.articles || [];
  } catch (err) {
    console.error("Error fetching articles:", err.message);
    process.exit(1);
  }
}

async function getFirstUntranslatedArticle(articles) {
  console.log(`\n🔍 Checking which articles need translation...`);
  for (const article of articles) {
    const articleId = article.id;
    try {
      const res = await fetch(
        `${zendeskBaseUrl}/help_center/articles/${articleId}/translations/${TARGET_LOCALE}.json`,
        {
          headers: {
            Authorization: `Bearer ${ZENDESK_OAUTH_ACCESS_TOKEN}`,
          },
        }
      );
      
      if (!res.ok) {
        console.log(`✅ Found untranslated article: ${articleId} - "${article.title}"`);
        return article;
      }
      console.log(`⏭️  Already translated: ${articleId}`);
    } catch (err) {
      console.log(`✅ Found untranslated article: ${articleId} - "${article.title}"`);
      return article;
    }
  }
  return null;
}

async function translateWithOpenAI(title, body) {
  console.log(`\n🤖 Translating with OpenAI...`);
  const payload = {
    model: "gpt-4o-mini",
    response_format: { type: "json_schema", json_schema: { name: "TranslationResult", schema: { type: "object", properties: { title: { type: "string" }, body: { type: "string" } }, required: ["title", "body"], additionalProperties: false } } },
    messages: [
      {
        role: "user",
        content: `Translate this content from English to Canadian French (fr-ca). Return ONLY valid JSON with "title" and "body" fields.\n\nTitle: ${title}\n\nBody: ${body}`,
      },
    ],
  };

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    const data = await res.json();
    const content = data.choices[0].message.content;
    const translated = JSON.parse(content);
    
    console.log(`✅ OpenAI translation complete`);
    console.log(`   Title: ${translated.title.substring(0, 50)}...`);
    
    return {
      title: translated.title,
      body: translated.body,
    };
  } catch (err) {
    console.error("❌ OpenAI translation failed:", err.message);
    throw err;
  }
}

async function uploadTranslation(articleId, translatedTitle, translatedBody) {
  console.log(`\n📤 Uploading translation to Zendesk...`);
  const payload = {
    translation: {
      locale: TARGET_LOCALE,
      title: translatedTitle,
      body: translatedBody,
      draft: false,
    },
  };

  try {
    const res = await fetch(
      `${zendeskBaseUrl}/help_center/articles/${articleId}/translations.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ZENDESK_OAUTH_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      console.log(`\nZendesk response (${res.status}):`, text);
      throw new Error(`Zendesk upload failed ${res.status}: ${text}`);
    }

    const data = await res.json();
    console.log(`✅ Translation uploaded successfully`);
    return data;
  } catch (err) {
    console.error("❌ Upload failed:", err.message);
    throw err;
  }
}

async function main() {
  console.log("🔧 Testing single article translation...\n");
  
  // Get articles
  const articles = await fetchArticlesInSection();
  console.log(`Found ${articles.length} articles in section`);
  
  // Find first untranslated
  const article = await getFirstUntranslatedArticle(articles);
  if (!article) {
    console.log("\n✅ All articles are already translated!");
    process.exit(0);
  }
  
  console.log(`\n📝 Selected article:`);
  console.log(`   ID: ${article.id}`);
  console.log(`   Title: ${article.title}`);
  console.log(`   Body length: ${(article.body || "").length} chars`);
  
  // Translate
  const translated = await translateWithOpenAI(article.title, article.body);
  
  // Upload
  await uploadTranslation(article.id, translated.title, translated.body);
  
  console.log(`\n✅ Test complete! Article ${article.id} should now have a French translation.`);
}

main().catch(err => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});
