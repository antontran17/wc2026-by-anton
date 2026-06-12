module.exports = app => {
    require('./healthController')(app);
    require('./getController')(app);
};
