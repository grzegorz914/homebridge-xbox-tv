'use strict';
const Authentication = require('./authentication.js')
const providers = {
    achievements: require('./providers/achievements.js'),
    catalog: require('./providers/catalog.js'),
    gameclips: require('./providers/gameclips.js'),
    messages: require('./providers/messages.js'),
    people: require('./providers/people.js'),
    pins: require('./providers/pins.js'),
    profile: require('./providers/profile.js'),
    screenshots: require('./providers/screenshots.js'),
    smartglass: require('./providers/smartglass.js'),
    social: require('./providers/social.js'),
    titlehub: require('./providers/titlehub.js'),
    userpresence: require('./providers/userpresence.js'),
    userstats: require('./providers/userstats.js')
}

class XBOXWEBAPI {
    constructor(config) {
        const authenticationConfig = {
            clientId: config.clientId || '',
            clientSecret: config.clientSecret || '',
            userToken: config.userToken || '',
            uhs: config.uhs || '',
            tokensFile: config.tokensFile
        }
        this.authentication = new Authentication(authenticationConfig);
    }

    getProvider(name) {
        if (providers[name] === undefined) {
            return false
        }
        return providers[name](this, name)
    }
}
module.exports = XBOXWEBAPI;