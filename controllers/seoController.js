module.exports = (app) => {
    app.get('/sitemap.xml', (req, res) => {
        const now = new Date().toISOString().split('T')[0];
        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>/</loc>
    <lastmod>${now}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
        res.set('Content-Type', 'application/xml');
        res.send(xml);
    });
};
