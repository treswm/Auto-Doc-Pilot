/**
 * CSV Export Utilities
 * Format data as CSV and generate download headers
 */

/**
 * Escape CSV field value (handle commas, quotes, newlines)
 * @param {string} field - The field value to escape
 * @returns {string} - Escaped field safe for CSV
 */
function escapeCSVField(field) {
  if (!field) return '';

  const str = String(field);
  // If field contains comma, quote, or newline, wrap in quotes and escape inner quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Convert articles array to CSV format
 * @param {Array} articles - Array of article objects with title, reason, affectedFeatures, lastUpdated, url
 * @returns {string} - CSV formatted string
 */
export function articlestoCSV(articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    // Return header only if no articles
    return 'Article Name,Why It Needs Updating,Last Updated,URL\n';
  }

  const lines = [
    // Header row
    'Article Name,Why It Needs Updating,Last Updated,URL'
  ];

  // Data rows
  articles.forEach(article => {
    const name = escapeCSVField(article.title || article.name);
    
    // Use reason if available, otherwise use affectedFeatures
    let explanation = article.reason || '';
    if (!explanation && article.affectedFeatures && Array.isArray(article.affectedFeatures)) {
      explanation = article.affectedFeatures.join(', ');
    }
    
    const whyUpdated = escapeCSVField(explanation);
    const lastUpdated = escapeCSVField(article.updated_at || article.lastUpdated || '');
    const url = escapeCSVField(article.url || article.helpCenterUrl || '');

    lines.push(`${name},${whyUpdated},${lastUpdated},${url}`);
  });

  return lines.join('\n') + '\n'; // Include trailing newline
}

/**
 * Generate filename for CSV export
 * @param {string} releaseId - The release ID
 * @returns {string} - Formatted filename
 */
export function generateCSVFilename(releaseId) {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD
  return `release-analysis-${releaseId}-${dateStr}.csv`;
}

/**
 * Generate CSV response headers
 * @param {string} filename - The filename for download
 * @returns {Object} - Headers object for Express response
 */
export function generateCSVHeaders(filename) {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  };
}
