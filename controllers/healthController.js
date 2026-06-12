const packageJson = require('../package.json');

module.exports = (app) => {
    app.get('/health', (req, res) => {
        res.send({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            version: packageJson.version || '1.0.0',
            database: {
                status: 'disabled',
                message: 'Running in JSON/static-data mode'
            }
        });
    });
};
