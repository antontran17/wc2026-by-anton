const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

console.log('ℹ️ MongoDB disabled. Running in JSON/static-data mode.');

mongoose.Promise = global.Promise;
module.exports = mongoose;
